// src/features/social/SocialQueueCard.tsx
// Raj picks which rehab photos go on the Facebook Page.
//
// Nothing here publishes. Choosing photos queues them; posting is a separate
// step, so a mis-click cannot put a job site on the Page.
//
// Thumbnails are fetched as blobs rather than set as image URLs, because the
// Drive folder is private and the proxy route needs the auth header - which an
// <img src> cannot send.
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, ShareIcon, XIcon } from "lucide-react";
import { NavCard } from "../../components/NavCard";
import { apiFetch } from "../../lib/apiFetch";

type QueueRow = {
  id: string;
  side: string;
  stage_name: string;
  status: string;
  created_at: string;
};

type Photo = {
  id: string;
  name: string;
  mimeType: string;
  posted: { status: string } | null;
};

// Stage names are internal build language. These are the public-facing version
// of the same milestone - what a caption should actually say.
const STAGE_PHRASES: Record<string, string> = {
  "Before Teardown Photos": "Where we started",
  Demo: "Demo done",
  "Structural Repair": "Structural repairs complete",
  Framing: "Framing complete",
  Wiring: "Electrical rough-in complete",
  "Mini Split Rough-In": "Mini split rough-in complete",
  Insulation: "Insulation in",
  Drywall: "Drywall up",
  "Paint (Interior)": "Interior paint done",
  Flooring: "New flooring down",
  "Cabinets/Countertops": "Cabinets and countertops in",
  Bathrooms: "Bathrooms finished",
  "Baseboard/Trim": "Baseboard and trim done",
  "Mini Split Set + Commission": "Mini splits set and running",
  "Finishing Fixtures": "Finishing fixtures in",
  "Final Finished Pics": "Finished and ready",
  Siding: "New siding on",
  "Skirting + Trim": "Skirting and trim done",
  "Deck + Steps": "New deck and steps",
  "Paint (Exterior)": "Exterior paint done",
  "Curb Appeal/Landscape": "Curb appeal done",
};

/** A starting point, not the final word - Raj edits before anything queues. */
function captionFor(row: QueueRow) {
  const phrase = STAGE_PHRASES[row.stage_name] ?? `${row.stage_name} complete`;
  return `${phrase} on ${row.side} at Hometown Meadows.`;
}

export function SocialQueueCard({
  divider = false,
  row = false,
}: {
  divider?: boolean;
  row?: boolean;
}) {
  const [queue, setQueue] = React.useState<QueueRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [thumbs, setThumbs] = React.useState<Record<string, string>>({});
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [caption, setCaption] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/social-queue");
      if (res.status === 401) return;
      const body = await res.json().catch(() => ({}));
      setQueue(Array.isArray(body.queue) ? body.queue : []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Object URLs are revoked on unmount, otherwise every reopen leaks a blob.
  React.useEffect(() => {
    return () => {
      Object.values(thumbs).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [thumbs]);

  const active = queue.find((q) => q.id === activeId) ?? null;

  async function openStage(id: string) {
    const row = queue.find((q) => q.id === id) ?? null;

    setActiveId(id);
    setPicked(new Set());
    setCaption(row ? captionFor(row) : "");
    setProblem("");
    setPhotos([]);
    setThumbs({});

    const res = await apiFetch(
      `/api/social-queue?id=${encodeURIComponent(id)}`,
    );
    const body = await res.json().catch(() => ({}));
    const list: Photo[] = body?.photos ?? [];
    setPhotos(list);

    // One at a time: a stage folder can hold twenty photos and firing twenty
    // parallel Drive fetches through one lambda is how you get a timeout.
    for (const photo of list) {
      try {
        const imgRes = await apiFetch(
          `/api/social-queue?file=${encodeURIComponent(photo.id)}`,
        );
        if (!imgRes.ok) continue;
        const blob = await imgRes.blob();
        setThumbs((t) => ({ ...t, [photo.id]: URL.createObjectURL(blob) }));
      } catch {
        // A thumbnail that will not load is not worth failing the screen over.
      }
    }
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(skip: boolean) {
    if (!active) return;
    if (!skip && !picked.size) {
      setProblem("Pick at least one photo, or skip this stage.");
      return;
    }

    setSaving(true);
    setProblem("");

    try {
      const res = await apiFetch("/api/social-queue", {
        method: "POST",
        body: JSON.stringify({
          queue_id: active.id,
          picks: skip
            ? []
            : [...picked].map((id) => ({ drive_file_id: id, caption })),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save");

      setActiveId(null);
      await load();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <NavCard
        icon={<ShareIcon aria-hidden="true" size={17} strokeWidth={2.5} />}
        title="Ready to post"
        subtitle="Approved stages waiting on your pick"
        count={loading ? null : queue.length}
        tone={queue.length > 0 ? "orange" : "green"}
        variant={row ? "row" : "card"}
        divider={divider}
        onClick={() => setOpen(true)}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              animate={{ y: 0 }}
              className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-[#F1F5F9] sm:rounded-2xl"
              exit={{ y: 40 }}
              initial={{ y: 40 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between bg-white px-5 py-4">
                <div>
                  <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#7A8AA3]">
                    Facebook Page
                  </p>
                  <h2 className="text-[20px] font-semibold text-[#0F1E33]">
                    {active
                      ? `${active.side} — ${active.stage_name}`
                      : "Ready to post"}
                  </h2>
                </div>
                <button
                  aria-label="Close"
                  className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F5F9] text-[#526176]"
                  onClick={() => (active ? setActiveId(null) : setOpen(false))}
                  type="button"
                >
                  <XIcon size={18} />
                </button>
              </div>

              <div className="grid gap-3 overflow-y-auto p-4">
                {!active &&
                  (queue.length === 0 ? (
                    <p className="rounded-2xl bg-white p-4 text-[15px] text-[#8291A5]">
                      Nothing waiting. Stages appear here once you approve them.
                    </p>
                  ) : (
                    queue.map((q) => (
                      <button
                        className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-left active:bg-[#F8FAFC]"
                        key={q.id}
                        onClick={() => openStage(q.id)}
                        type="button"
                      >
                        <p className="text-[17px] font-semibold text-[#0F1E33]">
                          {q.stage_name}
                        </p>
                        <p className="text-[15px] text-[#7A8AA3]">{q.side}</p>
                      </button>
                    ))
                  ))}

                {active && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((p) => {
                        const on = picked.has(p.id);
                        return (
                          <button
                            className={`relative overflow-hidden rounded-xl border-2 ${
                              on ? "border-[#16A34A]" : "border-[#DCE4EE]"
                            }`}
                            key={p.id}
                            onClick={() => togglePick(p.id)}
                            type="button"
                          >
                            {thumbs[p.id] ? (
                              <img
                                alt={p.name}
                                className="h-24 w-full object-cover"
                                src={thumbs[p.id]}
                              />
                            ) : (
                              <div className="h-24 w-full bg-[#E9EEF5]" />
                            )}
                            {on && (
                              <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-[#16A34A] text-white">
                                <CheckIcon size={14} strokeWidth={3} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <label className="block rounded-2xl bg-white p-4">
                      <span className="text-[13px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                        Caption
                      </span>
                      <textarea
                        className="mt-2 min-h-[90px] w-full resize-y rounded-xl border border-[#DCE4EE] px-3 py-2 text-[16px] text-[#0F1E33] focus:border-[#418BFF] focus:outline-none"
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="What should this say on the Page?"
                        value={caption}
                      />
                    </label>

                    {problem && (
                      <p className="text-[15px] text-[#DC2626]">{problem}</p>
                    )}

                    <div className="flex gap-2">
                      <button
                        className="flex-1 rounded-xl border border-[#DCE4EE] bg-white py-3 text-[16px] font-semibold text-[#526176]"
                        disabled={saving}
                        onClick={() => submit(true)}
                        type="button"
                      >
                        Post nothing
                      </button>
                      <button
                        className="flex-1 rounded-xl bg-[#16A34A] py-3 text-[16px] font-semibold text-white disabled:opacity-60"
                        disabled={saving}
                        onClick={() => submit(false)}
                        type="button"
                      >
                        {saving
                          ? "Saving…"
                          : `Queue ${picked.size || ""}`.trim()}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
