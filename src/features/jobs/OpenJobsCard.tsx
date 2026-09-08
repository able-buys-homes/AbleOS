// src/features/jobs/OpenJobsCard.tsx
// Open work orders, on Raj's cockpit.
//
// A row like every other row on that page, opening a list. The first version
// of this was a full panel and stood out as a third kind of card, which is
// the same drift the shared header fixed.
//
// Read only, deliberately. Raj cannot reach Zo's Jobs board - that route is
// Zo's - so a button here that Raj could press and Zo would never see would
// be worse than no button. This card exists so he knows what the community is
// waiting on before somebody phones him about it.

import React from "react";
import { WrenchIcon } from "lucide-react";
import { NavCard } from "../../components/NavCard";
import { apiFetch } from "../../lib/apiFetch";

type Row = {
  id: string;
  lot_number: string | null;
  tenant_name: string | null;
  title: string;
  category: string;
  priority: "emergency" | "urgent" | "routine";
  status: string;
  opened_at: string;
  assigned_to: string | null;
};

const PRIO: Record<
  Row["priority"],
  { label: string; chip: string; bar: string }
> = {
  emergency: {
    label: "Emergency",
    chip: "bg-[#FDE7E5] text-[#B3261E] border-[#E9B8B2]",
    bar: "#B3261E",
  },
  urgent: {
    label: "Urgent",
    chip: "bg-[#FFF4E5] text-[#92600A] border-[#F0E2C4]",
    bar: "#D97706",
  },
  routine: {
    label: "Routine",
    chip: "bg-[#EEF0F3] text-[#6C7484] border-[#DCE4EE]",
    bar: "#9AA4B2",
  },
};

const STATUS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In progress",
  waiting_parts: "Waiting on parts",
  completed: "Completed",
  cancelled: "Cancelled",
};

const CAT: Record<string, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "Heat / AC",
  roof: "Roof",
  appliance: "Appliance",
  grounds: "Grounds",
  other: "Other",
};

/** How often Raj's cockpit re-reads the board. */
const REFRESH_MS = 5000;

const rank: Record<Row["priority"], number> = {
  emergency: 0,
  urgent: 1,
  routine: 2,
};

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function OpenJobsCard() {
  const [jobs, setJobs] = React.useState<Row[] | null>(null);
  const [problem, setProblem] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/jobs");
      if (res.status === 401) return;

      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("application/json")) {
        throw new Error("The work orders did not come back.");
      }

      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load the jobs");

      // Emergencies first, then oldest. A list that buries an emergency
      // under a loose porch step is worse than no list.
      setJobs(
        ((body?.jobs ?? []) as Row[])
          .filter((j) => j.status !== "completed" && j.status !== "cancelled")
          .sort(
            (a, b) =>
              rank[a.priority] - rank[b.priority] ||
              +new Date(a.opened_at) - +new Date(b.opened_at),
          ),
      );

      // Clear a previous failure once a read succeeds, so a one-off network
      // blip does not leave "could not load" sitting there over good data.
      setProblem("");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not load the jobs");
    }
  }, []);

  // Zo opens a job standing in a driveway; Raj should see it without
  // reloading anything.
  //
  // Paused while the tab is hidden. Polling every five seconds into a
  // background tab all day is thousands of calls nobody reads, and this is a
  // Hobby plan with a function budget.
  React.useEffect(() => {
    load();

    const timer = window.setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);

    function onVisible() {
      if (!document.hidden) load();
    }

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const emergencies = (jobs ?? []).filter(
    (j) => j.priority === "emergency",
  ).length;

  const subtitle = problem
    ? "Could not load the work orders"
    : emergencies > 0
      ? `${emergencies} emergency${emergencies === 1 ? "" : "s"} — no water, no heat, sewage or a hazard`
      : "What the community is waiting on";

  return (
    <>
      <NavCard
        count={jobs ? jobs.length : null}
        icon={<WrenchIcon size={20} strokeWidth={2.25} />}
        onClick={() => setOpen(true)}
        subtitle={subtitle}
        title="Open work orders"
        tone="orange"
      />

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-[#141A28]/55 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[20px] bg-[#F1F2F4] sm:rounded-[18px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-none items-center justify-between gap-3 bg-[#1E3A8A] px-5 py-4 text-white">
              <div>
                <h2 className="text-[17px] font-bold tracking-[-0.01em]">
                  Open work orders
                </h2>
                <div className="mt-0.5 text-[12.5px] text-[#A9B4CC]">
                  {jobs
                    ? `${jobs.length} open at Hometown Meadows`
                    : "Loading…"}
                </div>
              </div>
              <button
                aria-label="Close"
                className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/15 text-[19px] leading-none"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              {problem && (
                <p className="text-[15px] text-[#B91C1C]">{problem}</p>
              )}

              {jobs && jobs.length === 0 && (
                <p className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[15px] text-[#6C7484]">
                  Nothing open. That says nobody has opened a job, not that
                  nothing is wrong.
                </p>
              )}

              <div className="flex flex-col gap-2.5">
                {(jobs ?? []).map((j) => (
                  <div
                    className="rounded-2xl border border-l-4 border-[#DCE4EE] bg-white p-4"
                    key={j.id}
                    style={{ borderLeftColor: PRIO[j.priority].bar }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[16px] font-bold tracking-[-0.01em] text-[#1B2231]">
                          Lot {j.lot_number ?? "—"} — {j.title}
                        </div>
                        <div className="mt-1 text-[13px] text-[#6C7484]">
                          {j.tenant_name ? `${j.tenant_name} · ` : "Vacant · "}
                          {CAT[j.category] ?? j.category} ·{" "}
                          {STATUS[j.status] ?? j.status}
                        </div>
                        <div className="mt-0.5 text-[12.5px] text-[#8A929E]">
                          Opened {ago(j.opened_at)}
                          {j.assigned_to ? ` · ${j.assigned_to} assigned` : ""}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.04em] ${PRIO[j.priority].chip}`}
                      >
                        {PRIO[j.priority].label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-[13px] leading-relaxed text-[#6C7484]">
                Read only. Zo closes these out on his own screen, and cannot
                mark one done without a photo of the finished work.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}