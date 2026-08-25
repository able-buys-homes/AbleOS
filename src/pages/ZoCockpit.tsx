import React from "react";
import {
  scrollToSection,
  useNotificationTarget,
} from "../lib/useNotificationTarget";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { UserMenu } from "../components/UserMenu";
import { NotificationBell } from "../components/NotificationBell";
import { apiFetch } from "../lib/apiFetch";
import {
  StageRow,
  type Stage,
  type UploadState,
} from "../features/rehab/StageRow";

const SIDE = "B" as const;

const phaseDots = [
  { color: "#16A34A" },
  { color: "#F59E0B" },
  { color: "#CBD5E1" },
  { color: "#CBD5E1" },
];

const reveal = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

// Notion returns rows in arbitrary order. Pin each phase to the SOP sequence
// so the checklist reads the same way every visit.
const STAGE_ORDER: Record<string, string[]> = {
  "Phase 0": ["Before Teardown Photos"],
  "Phase 1": [
    "Demo",
    "Structural Repair",
    "Framing",
    "Wiring",
    "Mini Split Rough-In",
  ],
  "Phase 2": ["Insulation", "Drywall", "Paint (Interior)"],
  "Phase 3": [
    "Flooring",
    "Cabinets/Countertops",
    "Bathrooms",
    "Baseboard/Trim",
    "Mini Split Set + Commission",
    "Finishing Fixtures",
    "Final Finished Pics",
  ],
  "Phase 4": [
    "Siding",
    "Skirting + Trim",
    "Deck + Steps",
    "Paint (Exterior)",
    "Curb Appeal/Landscape",
  ],
};

/** Unknown stage names sort to the end rather than disappearing. */
function orderIndex(phase: string, stageName: string) {
  const list = STAGE_ORDER[phase] || [];
  const index = list.indexOf(stageName);
  return index === -1 ? 999 : index;
}

export function ZoCockpit() {
  const [stages, setStages] = React.useState<Stage[]>([]);

  /* Notifications deep-link into here, e.g. ?stage=<notion page id> */
  const { clear, target } = useNotificationTarget();

  React.useEffect(() => {
    if (target.stage) {
      scrollToSection("checklist-heading");
      clear();
      return;
    }

    if (target.task || target.order) clear();
  }, [clear, target]);
  const [loading, setLoading] = React.useState(true);
  const [uploadStates, setUploadStates] = React.useState<
    Record<string, UploadState>
  >({});

  const loadStages = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/rehab-stages");
      if (res.status === 401) return;
      if (!res.ok) throw new Error(`Failed to load stages (${res.status})`);

      const data = await res.json();
      const list: Stage[] = Array.isArray(data.stages) ? data.stages : [];

      setStages(list);
      setUploadStates((prev) => {
        const next: Record<string, UploadState> = {};
        list.forEach((s) => {
          const existing = prev[s.notionPageId];
          next[s.notionPageId] = {
            uploading: existing?.uploading || false,
            // A sent-back stage clears its link, so Done re-locks.
            driveUrl: s.photoUploaded ? s.drivePhotoLink || "" : "",
            saving: false,
            saved: s.photoUploaded,
            error: existing?.error || "",
            progress: existing?.progress || "",
          };
        });
        return next;
      });
    } catch (err) {
      console.error("Failed to fetch rehab stages:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadStages();
  }, [loadStages]);

  // Pick up approvals and declines without a manual reload.
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) loadStages();
    }, 30_000);

    function handleVisibility() {
      if (!document.hidden) loadStages();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadStages]);

  function updateOne(pageId: string, patch: Partial<UploadState>) {
    setUploadStates((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], ...patch },
    }));
  }

  async function handleUpload(
    pageId: string,
    stageName: string,
    files: FileList,
    /** True when topping up a stage that is already submitted. */
    addOnly = false,
  ) {
    const list = Array.from(files);
    if (list.length === 0) return;

    const notImage = list.find((f) => !f.type.startsWith("image/"));
    if (notImage) {
      updateOne(pageId, { error: `${notImage.name} isn't a photo.` });
      return;
    }

    const tooBig = list.find((f) => f.size > 50 * 1024 * 1024);
    if (tooBig) {
      updateOne(pageId, { error: `${tooBig.name} is over 50MB.` });
      return;
    }

    updateOne(pageId, {
      uploading: true,
      error: "",
      progress: `0 of ${list.length}`,
    });

    try {
      let folderUrl = "";

      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

        const sessionRes = await apiFetch("/api/drive-upload-url", {
          method: "POST",
          body: JSON.stringify({
            side: SIDE,
            stageName,
            mimeType: file.type,
            ext,
          }),
        });

        const sessionRaw = await sessionRes.text();
        if (!sessionRes.ok) {
          let msg = `Upload setup failed (${sessionRes.status})`;
          try {
            const parsed = JSON.parse(sessionRaw);
            if (parsed?.error) msg = parsed.error;
          } catch {
            /* keep default message */
          }
          throw new Error(msg);
        }

        const parsed = JSON.parse(sessionRaw);
        if (!parsed.uploadUrl) {
          throw new Error("No upload URL returned by the server.");
        }
        folderUrl = parsed.folderUrl || folderUrl;

        const putRes = await fetch(parsed.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "image/jpeg" },
          body: file,
        });

        if (!putRes.ok) {
          const detail = await putRes.text();
          throw new Error(
            `${file.name} failed (${putRes.status}): ${detail.slice(0, 120)}`,
          );
        }

        updateOne(pageId, { progress: `${i + 1} of ${list.length}` });
      }

      if (!folderUrl) throw new Error("Drive did not return a folder link.");
      updateOne(pageId, {
        uploading: false,
        progress: "",
        driveUrl: folderUrl,
      });

      // Topping up a stage that is already submitted saves itself. Making
      // someone press Done again would imply there is something to decide.
      if (addOnly) {
        const res = await apiFetch("/api/rehab-stages", {
          method: "POST",
          body: JSON.stringify({
            notionPageId: pageId,
            driveUrl: folderUrl,
            addOnly: true,
          }),
        });

        if (!res.ok) {
          const detail = await res.text();
          throw new Error(
            `Save failed (${res.status}): ${detail.slice(0, 160)}`,
          );
        }

        await loadStages();
      }
    } catch (err) {
      console.error("Upload failed:", err);
      updateOne(pageId, {
        uploading: false,
        progress: "",
        error: err instanceof Error ? err.message : "Upload failed. Try again.",
      });
    }
  }

  async function handleDone(pageId: string) {
    const url = uploadStates[pageId]?.driveUrl;
    if (!url) return;

    updateOne(pageId, { saving: true, error: "" });
    try {
      const res = await apiFetch("/api/rehab-stages", {
        method: "POST",
        body: JSON.stringify({ notionPageId: pageId, driveUrl: url }),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Save failed (${res.status}): ${detail.slice(0, 160)}`);
      }

      updateOne(pageId, { saving: false, saved: true });
      await loadStages();
    } catch (err) {
      console.error("Save failed:", err);
      updateOne(pageId, {
        saving: false,
        error: err instanceof Error ? err.message : "Save failed. Try again.",
      });
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#EEF2F6] text-[#1A1A2E]">
      <header className="bg-gradient-to-r from-[#5EC5E8] to-[#3B82C4] text-white shadow-sm">
        <div className="mx-auto max-w-[428px] px-5 pb-8 pt-5 sm:max-w-2xl sm:px-8 sm:pb-10 sm:pt-6 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
          <div className="flex items-center justify-between">
            <img
              alt="Able Buys Homes"
              className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain shadow-sm"
              src="/able-logo.png"
            />
            <div className="flex items-center gap-3">
              <nav
                aria-label="Workspace pages"
                className="flex items-center gap-1 rounded-full bg-white/15 p-1"
              >
                <span
                  aria-current="page"
                  className="rounded-full bg-white px-3 py-2 text-[16px] font-medium text-[#1E3A8A]"
                >
                  Cockpit
                </span>
                <Link
                  className="rounded-full px-3 py-2 text-[16px] font-medium text-white/80 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
                  to="/zo/inspect"
                >
                  Inspect
                </Link>
              </nav>
              <NotificationBell />
              <UserMenu />
            </div>
          </div>

          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
            ABLE OS · Executive workspace
          </p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Zo&apos;s Cockpit
          </h1>
          <p className="mt-2 max-w-md text-[18px] font-medium text-white/85">
            Phase progress and checklist for your current build.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[428px] px-5 pb-10 sm:max-w-2xl sm:px-8 sm:pb-14 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
        <motion.section
          animate="visible"
          aria-labelledby="profile-heading"
          className="relative -mt-4 overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_8px_20px_rgba(30,58,138,0.08)]"
          initial="hidden"
          transition={{ duration: 0.35, ease: "easeOut" }}
          variants={reveal}
        >
          <div className="absolute inset-y-0 left-0 w-1.5 bg-[#1E3A8A]" />
          <div className="flex items-center justify-between gap-4 px-5 py-4 pl-6 sm:px-7 sm:py-5 sm:pl-8">
            <div>
              <p className="text-[16px] font-semibold tracking-[0.13em] text-[#5B6B82]">
                Personal dashboard
              </p>
              <h2
                className="mt-1 text-[16px] font-semibold tracking-[-0.025em]"
                id="profile-heading"
              >
                Zo (Alonzo)
              </h2>
              <p className="mt-1 text-[16px] font-medium leading-relaxed text-[#64748B]">
                HTM Duplex — Side B
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          animate="visible"
          aria-labelledby="phase-heading"
          className="pt-8 text-center"
          initial="hidden"
          transition={{ delay: 0.08, duration: 0.35, ease: "easeOut" }}
          variants={reveal}
        >
          <span className="text-[68px] font-semibold leading-[0.8] tracking-[-0.075em] text-[#FF7832] sm:text-[80px] lg:text-[92px]">
            {(() => {
              const phases = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];
              const currentIdx = phases.findIndex((p) =>
                stages.some((s) => s.phase === p && !s.photoUploaded),
              );
              return `${currentIdx === -1 ? 4 : currentIdx + 1}/4`;
            })()}
          </span>
          <h2
            className="mt-2 text-[16px] font-semibold tracking-[-0.02em] text-[#1A1A2E]"
            id="phase-heading"
          >
            {
              [
                "Drywall Ready",
                "Ready to Lay Flooring",
                "Inside Done",
                "Exterior / Curb Appeal",
              ][
                (() => {
                  const phases = ["Phase 1", "Phase 2", "Phase 3", "Phase 4"];
                  const idx = phases.findIndex((p) =>
                    stages.some((s) => s.phase === p && !s.photoUploaded),
                  );
                  return idx === -1 ? 3 : idx;
                })()
              ]
            }
          </h2>

          <div className="mt-4 flex items-center justify-center gap-2">
            {phaseDots.map((dot, index) => (
              <span
                className="h-2.5 w-2.5 rounded-full"
                key={index}
                style={{ backgroundColor: dot.color }}
              />
            ))}
          </div>
        </motion.section>

        <motion.section
          animate="visible"
          className="pt-6"
          initial="hidden"
          transition={{ delay: 0.12, duration: 0.35, ease: "easeOut" }}
          variants={reveal}
        >
          <div className="rounded-2xl border border-[#FF7832] bg-[#1A1A2E] px-5 py-4 text-center">
            <p className="text-[16px] font-semibold tracking-[0.04em] text-[#FF7832]">
              No photo, no next stage, no draw.
            </p>
            <p className="mt-1 text-[16px] font-medium text-white/85">
              Upload phase-complete photos before requesting advance.
            </p>
          </div>
        </motion.section>

        <motion.div
          animate="visible"
          initial="hidden"
          transition={{ delay: 0.18, duration: 0.38, ease: "easeOut" }}
          variants={reveal}
        >
          <section aria-labelledby="checklist-heading" className="pt-9">
            <SectionHeading id="checklist-heading">
              This phase&apos;s checklist
            </SectionHeading>
            <div className="mt-4 space-y-6">
              {loading ? (
                <p className="text-[16px] font-medium text-[#8A99AC]">
                  Loading checklist…
                </p>
              ) : (
                [
                  { key: "Phase 0", label: "Phase 0 — Before Teardown" },
                  { key: "Phase 1", label: "Phase 1 — Drywall Ready" },
                  { key: "Phase 2", label: "Phase 2 — Ready to Lay Flooring" },
                  { key: "Phase 3", label: "Phase 3 — Inside Done" },
                  { key: "Phase 4", label: "Phase 4 — Exterior / Curb Appeal" },
                ].map((phase) => {
                  const phaseStages = stages
                    .filter((s) => s.phase === phase.key)
                    .sort(
                      (a, b) =>
                        orderIndex(phase.key, a.stageName) -
                        orderIndex(phase.key, b.stageName),
                    );

                  if (phaseStages.length === 0) return null;

                  return (
                    <div key={phase.key}>
                      <h3 className="mb-3 text-[18px] font-semibold tracking-[0.06em] text-[#5B6B82] sm:text-[15px]">
                        {phase.label}
                      </h3>
                      <div className="space-y-3">
                        {phaseStages.map((stage) => (
                          <StageRow
                            key={stage.notionPageId}
                            onAddPhotos={(pageId, stageName, files) =>
                              handleUpload(pageId, stageName, files, true)
                            }
                            onDone={handleDone}
                            onUpload={handleUpload}
                            stage={stage}
                            uploadState={uploadStates[stage.notionPageId]}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section aria-labelledby="escalate-heading" className="pt-9">
            <SectionHeading id="escalate-heading">
              Escalate only for
            </SectionHeading>
            <div className="mt-4 rounded-2xl border border-dashed border-[#DCE4EE] bg-[#F8FAFC] px-5 py-4">
              <p className="text-[16px] font-medium leading-snug text-[#8A99AC]">
                Hidden damage · safety issue · budget overage — iMessage
                Jeremiah directly. Everything else stays in Notion.
              </p>
            </div>
          </section>
        </motion.div>

        <footer className="pt-10 text-center text-[16px] font-medium tracking-[0.12em] text-[#8291A5]">
          Able OS · V1 Build
        </footer>
      </main>
    </div>
  );
}

/* ── Subcomponents ──────────────────────────────────────── */

type SectionHeadingProps = {
  id: string;
  children: React.ReactNode;
};

function SectionHeading({ id, children }: SectionHeadingProps) {
  return (
    <h2
      className="text-[19px] font-semibold leading-none tracking-[-0.035em] text-[#1A1A2E] sm:text-[21px]"
      id={id}
    >
      {children}
    </h2>
  );
}
