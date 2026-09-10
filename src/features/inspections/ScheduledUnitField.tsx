// src/features/inspections/ScheduledUnitField.tsx
// The Unit # field on the Inspect screen.
//
// It lists the homes somebody has scheduled on the Map, whatever their date -
// Zo may walk one early because he is standing next to it, or late because
// the resident was out. Filtering by date would hide the home he is actually
// in front of.
//
// It is not a wall, though. A home that was never scheduled still has to be
// fileable, so there is a way back to a plain box. A dropdown that cannot
// name the home you are standing in is a dead end, and the walk goes
// unrecorded.

import React from "react";
import { apiFetch } from "../../lib/apiFetch";

type Row = { lot_number: string; next_inspection_at: string };

const inputClass =
  "w-full rounded-[10px] border border-[#DCE4EE] bg-white px-3.5 py-2.5 text-[16px] text-[#1B2231]";

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

        // A draft already part-filled for a home that is not on the list
        // must not be silently emptied.
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
    // Only on mount. Re-running this on every keystroke would fight the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Matches the Field component sitting next to it exactly. Any difference in
  // the label and the two inputs start at different heights, which reads as a
  // broken row rather than a deliberate one.
  const label = (
    <span className="mb-1 text-[13px] font-bold uppercase tracking-[0.07em] text-[#7A8AA3]">
      Unit #
    </span>
  );

  if (rows === null) {
    return (
      <div className="flex h-full min-w-0 flex-col">
        {label}
        <input className={inputClass} disabled placeholder="Loading…" />
      </div>
    );
  }

  if (free || rows.length === 0) {
    return (
      <div className="flex h-full min-w-0 flex-col">
        {label}
        <input
          className={inputClass}
          inputMode="numeric"
          onChange={(e) => onChange(e.target.value)}
          placeholder="12"
          type="text"
          value={value}
        />
        {rows.length > 0 && (
          <button
            className="mt-1.5 text-[13px] font-semibold text-[#1E3A8A] underline"
            onClick={() => setFree(false)}
            type="button"
          >
            Pick from the scheduled homes
          </button>
        )}
        {rows.length === 0 && (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#6C7484]">
            No homes are scheduled on the Map. You can still file this one.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {label}
      <select
        className={inputClass}
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
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#6C7484]">
        Scheduled on the Map. Filing one clears its date.
      </p>
    </div>
  );
}
