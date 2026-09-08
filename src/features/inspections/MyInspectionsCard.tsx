// src/features/inspections/MyInspectionsCard.tsx
// What Zo has filed.
//
// Before this, an inspection vanished the moment he filed it - the form
// cleared and the only copy lived on Raj's screen. A record you cannot look
// at is a record you cannot check, and the person who wrote it is the one
// most likely to spot a mistake in it.
//
// Reads the same endpoint as Raj's card. That endpoint already returns only
// the caller's own walks unless the caller is Raj, so nothing here decides
// who sees what - which is why nothing here can get that decision wrong.

import React from "react";
import { apiFetch } from "../../lib/apiFetch";

type Row = {
  id: string;
  unit_number: string;
  inspected_at: string;
  status: string;
  occupancy_flagged: boolean;
  notes: string | null;
  est_cost_to_ready: string | number | null;
  days_to_ready: number | null;
  photo_counts: { condition: number; marketing: number };
};

const STATUS_LABEL: Record<string, string> = {
  rent_ready: "Rent ready",
  needs_work: "Needs work",
  full_rehab: "Full rehab",
  occupied: "Occupied",
};

function label(status: string) {
  return STATUS_LABEL[status] ?? String(status).replace(/_/g, " ");
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dollars(value: string | number | null) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function MyInspectionsCard({ reloadKey }: { reloadKey?: number }) {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [problem, setProblem] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/unit-inspections");
        if (res.status === 401) return;

        const type = res.headers.get("content-type") ?? "";
        if (!type.includes("application/json")) {
          throw new Error("Your inspections did not come back.");
        }

        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || "Could not load your inspections");
        }

        setRows((body?.inspections ?? []) as Row[]);
        setProblem("");
      } catch (err) {
        setProblem(
          err instanceof Error
            ? err.message
            : "Could not load your inspections",
        );
      }
    })();
  }, [reloadKey]);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-[#E3E5E9] px-4 py-3.5">
        <h3 className="text-[16px] font-bold tracking-[-0.01em] text-[#1B2231]">
          Inspections you have filed
        </h3>
        <span className="text-[13px] font-semibold text-[#6C7484]">
          {rows ? rows.length : "…"}
        </span>
      </div>

      {problem && (
        <p className="px-4 py-3.5 text-[15px] text-[#B91C1C]">{problem}</p>
      )}

      {rows && rows.length === 0 && (
        <p className="px-4 py-3.5 text-[15px] text-[#6C7484]">
          Nothing filed yet. Once you file one it stays here, so you can check
          what you wrote.
        </p>
      )}

      {(rows ?? []).map((r) => {
        const isOpen = open === r.id;
        const photos = r.photo_counts.condition + r.photo_counts.marketing;
        const cost = dollars(r.est_cost_to_ready);

        return (
          <div className="border-b border-[#E3E5E9] last:border-b-0" key={r.id}>
            <button
              aria-expanded={isOpen}
              className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left"
              onClick={() => setOpen(isOpen ? null : r.id)}
              type="button"
            >
              <div className="min-w-0">
                <div className="text-[16px] font-bold tracking-[-0.01em] text-[#1B2231]">
                  Unit {r.unit_number}
                </div>
                <div className="mt-1 text-[13px] text-[#6C7484]">
                  {label(r.status)} · {when(r.inspected_at)}
                </div>
                <div className="mt-0.5 text-[12.5px] text-[#8A929E]">
                  {photos === 0
                    ? "No photos"
                    : `${photos} photo${photos === 1 ? "" : "s"}`}
                  {cost ? ` · ${cost} to make ready` : ""}
                  {r.days_to_ready ? ` · ${r.days_to_ready} days` : ""}
                </div>
              </div>

              {/* The one thing on this row that changes what anybody does
                  next. It goes to Raj as a notification too. */}
              {r.occupancy_flagged && (
                <span className="shrink-0 rounded-full border border-[#F0E2C4] bg-[#FFF4E5] px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#92600A]">
                  Maybe occupied
                </span>
              )}
            </button>

            {isOpen && (
              <div className="border-t border-[#E3E5E9] px-4 py-3.5">
                {r.notes ? (
                  <p className="text-[13.5px] leading-relaxed text-[#1B2231]">
                    {r.notes}
                  </p>
                ) : (
                  <p className="text-[13.5px] text-[#6C7484]">
                    No notes were written on this one.
                  </p>
                )}
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-[#8A929E]">
                  Filed records cannot be edited. If something on this is wrong,
                  walk the home again and file a new one — the old one stays,
                  which is the point of it.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
