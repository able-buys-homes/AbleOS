// src/features/inspections/ScheduledUnitField.tsx
// The Unit # field on the Inspect screen.
//
// It lists the homes somebody has scheduled on the Map, whatever their date -
// Zo may walk one early because he is standing next to it, or late because
// the resident was out. Filtering by date would hide the home he is in front
// of.
//
// It is not a wall. A home that was never scheduled still has to be fileable,
// so "Another unit…" drops back to a plain box. A dropdown that cannot name
// the home you are standing in is a dead end, and the walk goes unrecorded.
//
// The markup deliberately mirrors the Field component next to it - same
// wrapper, same label, same input classes including mt-auto. Field pushes its
// input to the bottom of the grid cell, so anything different here and the
// two boxes do not line up.

import React from "react";
import { apiFetch } from "../../lib/apiFetch";

type Row = { lot_number: string; next_inspection_at: string };

const CONTROL =
  "mt-auto w-full min-w-0 appearance-none rounded-xl border border-[#DCE4EE] bg-white px-3 py-3 text-[17px] text-[#0F1E33] placeholder:text-[#A3B0C0] focus:border-[#418BFF] focus:outline-none";

function due(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function ScheduledUnitField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [free, setFree] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/lots");
        if (!res.ok) throw new Error("no");

        const body = await res.json().catch(() => null);

        const scheduled = ((body?.lots ?? []) as any[])
          .filter((l) => l.next_inspection_at)
          .map((l) => ({
            lot_number: String(l.lot_number),
            next_inspection_at: String(l.next_inspection_at),
          }))
          .sort((a, b) =>
            a.next_inspection_at.localeCompare(b.next_inspection_at),
          );

        setRows(scheduled);

        // A draft already part-filled for a home that is not on the list must
        // not be silently emptied.
        if (value && !scheduled.some((r) => r.lot_number === value)) {
          setFree(true);
        }
      } catch {
        // The dropdown is a convenience. If it will not load, the plain box
        // still files the inspection.
        setRows([]);
        setFree(true);
      }
    })();
    // Only on mount. Re-running on every keystroke would fight the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = (
    <span className="mb-1 text-[13px] font-bold uppercase tracking-[0.07em] text-[#7A8AA3]">
      Unit #
    </span>
  );

  if (rows === null) {
    return (
      <label className="flex h-full min-w-0 flex-col">
        {label}
        <input className={CONTROL} disabled placeholder="Loading…" />
      </label>
    );
  }

  if (free || rows.length === 0) {
    return (
      // A div rather than a label, because the way back is a button and a
      // button inside a label steals its own click.
      <div className="flex h-full min-w-0 flex-col">
        {/* The link sits on the label line. Under the input it would make
            this cell taller than the date cell next to it, and the two boxes
            would stop lining up again. */}
        <span className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-bold uppercase tracking-[0.07em] text-[#7A8AA3]">
            Unit #
          </span>
          {rows.length > 0 && (
            <button
              className="text-[12px] font-semibold text-[#1E3A8A] underline"
              onClick={() => setFree(false)}
              type="button"
            >
              Back to list
            </button>
          )}
        </span>
        <input
          className={CONTROL}
          inputMode="numeric"
          onChange={(e) => onChange(e.target.value)}
          placeholder="12"
          type="text"
          value={value}
        />
      </div>
    );
  }

  return (
    <label className="flex h-full min-w-0 flex-col">
      {label}
      <select
        className={CONTROL}
        onChange={(e) => {
          if (e.target.value === "__other") {
            setFree(true);
            onChange("");
            return;
          }
          onChange(e.target.value);
        }}
        value={value}
      >
        <option value="">Pick a home</option>
        {rows.map((r) => (
          <option key={r.lot_number} value={r.lot_number}>
            Lot {r.lot_number} · due {due(r.next_inspection_at)}
          </option>
        ))}
        <option value="__other">Another unit…</option>
      </select>
    </label>
  );
}
