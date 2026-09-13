// src/features/applicants/parts.tsx
// The repeated pieces of Ellery's applicant pipeline, in cockpit tokens.
//
// Layout is taken from the walkthrough mock; the palette, type and spacing are
// the ones already used on Zo's and Raj's screens, so nobody is learning a
// second visual language to do the same job.

import React from "react";

export type Stage =
  | "received"
  | "fee_paid"
  | "screening"
  | "result"
  | "notified";

export type Applicant = {
  id: string;
  portfolio: "ahtx" | "htm";
  name: string;
  property_label: string | null;
  lot_id: string | null;
  application_id: string | null;
  came_in_by: string | null;
  arrived_at: string;
  fee_amount: string | number | null;
  fee_paid_on: string | null;
  screening_ordered_on: string | null;
  screening_result: string | null;
  decision: "approved" | "conditions" | "denied" | null;
  decision_on: string | null;
  decision_note: string | null;
  notified_on: string | null;
  who_else_knows: string | null;
  notes: string | null;
  /** Worked out by the server from the dates, never stored. */
  stage: Stage;
  bucket: "turn" | "report" | "fee" | "decided" | "done";
};

/** "2026-09-03" -> "Sept 3". A hyphenated date is something you decode. */
export function when(iso?: string | null) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** Which book of business. Said on every card, because the paperwork differs. */
export function PortfolioTag({ of }: { of: Applicant["portfolio"] }) {
  const ahtx = of === "ahtx";
  return (
    <span
      className={`inline-block shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.05em] ${
        ahtx ? "bg-[#EAF1F8] text-[#2A5B8C]" : "bg-[#F2F4F7] text-[#6C7484]"
      }`}
    >
      {ahtx ? "AHTX" : "HTM"}
    </span>
  );
}

/**
 * The pill on the right of a card. A decided applicant shows the decision
 * rather than the stage - "notified" says what we did, and what Ellery needs
 * to see is what was decided.
 */
export function statusPill(a: Applicant) {
  if (a.decision === "approved")
    return { label: "Approved", className: "bg-[#EAF6EE] text-[#166534]" };
  if (a.decision === "conditions")
    return { label: "Conditions", className: "bg-[#FDF4E0] text-[#92600A]" };
  if (a.decision === "denied")
    return { label: "Declined", className: "bg-[#FBEDEA] text-[#A83A2A]" };
  if (a.stage === "screening")
    return { label: "Screening", className: "bg-[#EAF1F8] text-[#2A5B8C]" };
  if (a.stage === "fee_paid")
    return { label: "Fee paid", className: "bg-[#FDF4E0] text-[#92600A]" };
  return { label: "Received", className: "bg-[#EEF0F3] text-[#6C7484]" };
}

export function Pill({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.05em] ${className}`}
    >
      {children}
    </span>
  );
}

const STEPS: Array<{ key: Stage; label: string }> = [
  { key: "received", label: "Received" },
  { key: "fee_paid", label: "Fee paid" },
  { key: "screening", label: "Screening" },
  { key: "result", label: "Result" },
  { key: "notified", label: "Notified" },
];

/**
 * Where this person is, and how far there is to go. Steps already passed are
 * filled; the one they are on is outlined. Nothing here is clickable - it
 * reports, it does not act.
 */
export function StageStrip({ stage }: { stage: Stage }) {
  const at = STEPS.findIndex((s) => s.key === stage);

  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {STEPS.map((step, i) => {
        const done = i < at;
        const here = i === at;

        return (
          <span
            className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.05em] ${
              done
                ? "border-[#BFE3CD] bg-[#EAF6EE] text-[#166534]"
                : here
                  ? "border-[#1E3A8A] bg-[#1E3A8A] text-white"
                  : "border-[#E3E5E9] bg-white text-[#A3B0C0]"
            }`}
            key={step.key}
          >
            {step.label}
          </span>
        );
      })}
    </div>
  );
}

/** One line per applicant. Tapping opens the detail. */
export function ApplicantCard({
  applicant,
  onOpen,
  selected = false,
}: {
  applicant: Applicant;
  onOpen: () => void;
  selected?: boolean;
}) {
  const pill = statusPill(applicant);

  const line = [
    applicant.property_label,
    applicant.came_in_by,
    applicant.fee_paid_on ? `fee paid ${when(applicant.fee_paid_on)}` : "",
    applicant.screening_ordered_on && !applicant.screening_result
      ? `ordered ${when(applicant.screening_ordered_on)}`
      : "",
    applicant.decision_on ? `decided ${when(applicant.decision_on)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      className={`w-full rounded-2xl border bg-white px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(30,58,138,0.04)] transition-colors ${
        selected
          ? "border-[#1E3A8A] ring-1 ring-[#1E3A8A]"
          : "border-[#DCE4EE] hover:border-[#B7C7DC]"
      } ${
        // The one pile that is hers. Everything else is waiting on somebody
        // else, and the header says so in words - this says it at a glance.
        applicant.bucket === "turn" ? "border-l-4 border-l-[#D97706]" : ""
      }`}
      onClick={onOpen}
      type="button"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PortfolioTag of={applicant.portfolio} />
            <span className="min-w-0 truncate text-[16px] font-bold tracking-[-0.01em] text-[#0F1E33]">
              {applicant.name}
            </span>
          </div>
          {line && (
            <p className="mt-1 text-[13px] leading-snug text-[#6C7484]">
              {line}
            </p>
          )}
        </div>
        <Pill className={pill.className}>{pill.label}</Pill>
      </div>
    </button>
  );
}
