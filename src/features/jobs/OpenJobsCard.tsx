// src/features/jobs/OpenJobsCard.tsx
// Open work orders, on Raj's cockpit.
//
// Read only, deliberately. Raj cannot reach Zo's Jobs board - that route is
// Zo's - so a button here that Raj could press and Zo would never see would
// be worse than no button. What this card is for is knowing what the
// community is waiting on before somebody phones him about it.

import React from "react";
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

  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/jobs");
        if (res.status === 401) return;

        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("application/json")) {
          throw new Error("The work orders did not come back.");
        }

        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || "Could not load the jobs");

        // Emergencies first, then oldest. A board that buries an emergency
        // under a loose porch step is worse than no board.
        setJobs(
          ((body?.jobs ?? []) as Row[])
            .filter((j) => j.status !== "completed" && j.status !== "cancelled")
            .sort(
              (a, b) =>
                rank[a.priority] - rank[b.priority] ||
                +new Date(a.opened_at) - +new Date(b.opened_at),
            ),
        );
      } catch (err) {
        setProblem(
          err instanceof Error ? err.message : "Could not load the jobs",
        );
      }
    })();
  }, []);

  const emergencies = (jobs ?? []).filter(
    (j) => j.priority === "emergency",
  ).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_8px_20px_rgba(30,58,138,0.08)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-[#E3E5E9] px-5 py-4">
        <h3 className="text-[17px] font-bold tracking-[-0.01em] text-[#1B2231]">
          Open work orders
        </h3>
        <span className="text-[13px] font-semibold text-[#6C7484]">
          {jobs ? `${jobs.length} open` : "…"}
        </span>
      </div>

      {problem && (
        <p className="px-5 py-4 text-[15px] text-[#B91C1C]">{problem}</p>
      )}

      {jobs && emergencies > 0 && (
        <p className="border-b border-[#F0E2C4] bg-[#FFFCF5] px-5 py-3 text-[13.5px] font-semibold text-[#7A4E06]">
          {emergencies === 1
            ? "One emergency is open"
            : `${emergencies} emergencies are open`}{" "}
          — that means no water, no heat, sewage, or a hazard.
        </p>
      )}

      {jobs && jobs.length === 0 && (
        <p className="px-5 py-4 text-[15px] text-[#6C7484]">
          Nothing open. That says nobody has opened a job, not that nothing is
          wrong.
        </p>
      )}

      {(jobs ?? []).map((j) => (
        <div
          className="border-b border-l-4 border-b-[#E3E5E9] px-5 py-4 last:border-b-0"
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
                {CAT[j.category] ?? j.category} · {STATUS[j.status] ?? j.status}
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
  );
}