// src/features/map/HtmLotMap.tsx
// The Hometown Meadows site plan, traced from the September 2026 drawing and
// ported from Raj's HtmLotMap.tsx.
//
// The geometry is fixed and must not be tidied. Those shapes are the actual
// streets and the boxes sit where the homes sit - Zo navigates by them.
// Only status changes, and it arrives through the `lots` prop, so this screen
// can never become a second opinion about who lives where.

import React from "react";

export type LotStatus =
  | "occupied"
  | "ready"
  | "moving_out"
  | "needs_repair"
  | "full_rehab"
  | "common_area"
  | "verify";

export interface Lot {
  id: number;
  status: LotStatus;
  tenant?: string;
  rent?: number;
  note?: string;
  bed?: number;
  bath?: number;
  sqft?: number;
}

export const STATUS_META: Record<
  LotStatus,
  { label: string; fill: string; stroke: string; text: string }
> = {
  occupied: {
    label: "Occupied",
    fill: "#DCE7F5",
    stroke: "#2A3648",
    text: "#2A3648",
  },
  ready: {
    label: "Ready to rent",
    fill: "#DFF3EA",
    stroke: "#1D8A62",
    text: "#0F5C41",
  },
  moving_out: {
    label: "Moving out",
    fill: "#EDE6F7",
    stroke: "#6B4FB3",
    text: "#3D2A7A",
  },
  needs_repair: {
    label: "Needs repair",
    fill: "#FDEBD3",
    stroke: "#E0891F",
    text: "#7A4508",
  },
  full_rehab: {
    label: "Full rehab",
    fill: "#FBDDD3",
    stroke: "#F0704A",
    text: "#8A2E14",
  },
  common_area: {
    label: "Office / laundry",
    fill: "#EDEFF2",
    stroke: "#8C949E",
    text: "#4A5460",
  },
  // Raj, 5 Sep: not ready, not occupied, until Zo has stood in front of it.
  // The two sources disagree and neither is trusted enough to colour a home.
  verify: {
    label: "Needs checking",
    fill: "#FEF6CE",
    stroke: "#A88300",
    text: "#6B5200",
  },
};

/** Statuses that count as a rentable door. The office is not a door. */
const RENTABLE: LotStatus[] = [
  "occupied",
  "ready",
  "moving_out",
  "needs_repair",
  "full_rehab",
  "verify",
];

/** Lot geometry - fixed. Only status changes. */
const LOT_POSITIONS: Record<number, { x: number; y: number }> = {
  1: { x: 220, y: 160 },
  7: { x: 222, y: 320 },
  2: { x: 310, y: 388 },
  3: { x: 440, y: 395 },
  6: { x: 285, y: 495 },
  8: { x: 345, y: 550 },
  4: { x: 528, y: 538 },
  14: { x: 480, y: 660 },
  15: { x: 378, y: 690 },
  12: { x: 528, y: 798 },
  16: { x: 373, y: 875 },
  13: { x: 520, y: 890 },
  17: { x: 255, y: 1020 },
  23: { x: 630, y: 175 },
  22: { x: 710, y: 160 },
  21: { x: 762, y: 160 },
  24: { x: 630, y: 318 },
  25: { x: 622, y: 455 },
  27: { x: 630, y: 760 },
  28: { x: 640, y: 890 },
  41: { x: 960, y: 160 },
  43: { x: 995, y: 390 },
  44: { x: 885, y: 490 },
  46: { x: 1045, y: 485 },
  33: { x: 382, y: 1035 },
  34: { x: 485, y: 1065 },
  31: { x: 538, y: 1030 },
  35: { x: 608, y: 1065 },
  30: { x: 740, y: 1032 },
  29: { x: 873, y: 1045 },
  39: { x: 388, y: 1168 },
  38: { x: 462, y: 1166 },
  37: { x: 582, y: 1188 },
  36: { x: 657, y: 1150 },
  40: { x: 388, y: 1235 },
};

/**
 * The 1 September 2026 snapshot - status from the hand-drawn site map,
 * bed/bath/sqft from the unit table. Replaced via the `lots` prop.
 * The unit table has no row for 12 or 33-40. Lot 24 is the office, not a door.
 */
export const DEFAULT_LOTS: Lot[] = [
  { id: 1, status: "occupied", bed: 3, bath: 1 },
  {
    id: 2,
    status: "verify",
    bed: 2,
    bath: 1.5,
    sqft: 840,
    note: "Rent-ready on the June list, but an August account shows a resident. Nobody is shown this home until Zo has confirmed which is true.",
  },
  { id: 3, status: "needs_repair", bed: 2, bath: 1, sqft: 720 },
  { id: 4, status: "occupied", bed: 2, bath: 1, sqft: 720 },
  { id: 6, status: "occupied", bed: 2, bath: 1, sqft: 700 },
  { id: 7, status: "needs_repair", bed: 3, bath: 1.5, sqft: 980 },
  { id: 8, status: "ready", bed: 2, bath: 1, sqft: 700 },
  { id: 12, status: "ready" },
  {
    id: 13,
    status: "moving_out",
    bed: 1,
    bath: 1,
    sqft: 600,
    note: "Marked moving out on the site plan. Confirm the notice is real before this is offered to anyone.",
  },
  { id: 14, status: "occupied", bed: 1, bath: 1 },
  { id: 15, status: "occupied", bed: 2, bath: 1, sqft: 700 },
  { id: 16, status: "occupied", note: "Resident-owned home (lot rent only)" },
  { id: 17, status: "occupied", bed: 3, bath: 2, sqft: 980 },
  { id: 21, status: "needs_repair", bed: 2, bath: 1 },
  { id: 22, status: "ready", bed: 2, bath: 2 },
  { id: 23, status: "occupied", bed: 3, bath: 2, sqft: 1400 },
  {
    id: 24,
    status: "common_area",
    note: "Converted to community office / laundry room",
  },
  { id: 25, status: "needs_repair", bed: 2, bath: 1.5, sqft: 840 },
  { id: 27, status: "occupied", bed: 3, bath: 2, sqft: 980 },
  { id: 28, status: "occupied", bed: 2, bath: 1, sqft: 840 },
  { id: 29, status: "full_rehab", bed: 2, bath: 1, sqft: 780 },
  { id: 30, status: "full_rehab", bed: 2, bath: 1, sqft: 720 },
  { id: 31, status: "occupied", bed: 3, bath: 1, sqft: 840 },
  { id: 33, status: "full_rehab" },
  { id: 34, status: "full_rehab" },
  { id: 35, status: "full_rehab" },
  { id: 36, status: "full_rehab" },
  { id: 37, status: "full_rehab" },
  { id: 38, status: "full_rehab" },
  { id: 39, status: "full_rehab" },
  { id: 40, status: "full_rehab" },
  { id: 41, status: "occupied", bed: 2, bath: 1, sqft: 980 },
  { id: 43, status: "occupied", bed: 2, bath: 1, sqft: 840 },
  { id: 44, status: "occupied", bed: 2, bath: 1, sqft: 720 },
  { id: 46, status: "occupied", bed: 2, bath: 1, sqft: 840 },
];

const STREET_LABELS: Array<[string, number, number, number]> = [
  ["Sitka Dr", 370, 432, 0],
  ["Nome Dr", 572, 330, -90],
  ["Nome Dr", 572, 730, -90],
  ["Yukon St", 868, 290, -90],
  ["Yukon St", 970, 420, 0],
  ["Able Way", 440, 985, 0],
  ["Nome Dr", 740, 985, 0],
  ["Kiana", 487, 1128, 0],
  ["E Kookik", 345, 1075, -90],
  ["Walkway", 445, 830, -90],
  ["Shop", 824, 145, -90],
];

export function lotCounts(lots: Lot[]) {
  const counts = {} as Record<LotStatus, number>;
  (Object.keys(STATUS_META) as LotStatus[]).forEach((key) => (counts[key] = 0));
  lots.forEach((lot) => (counts[lot.status] += 1));
  const doors = lots.filter((lot) => RENTABLE.includes(lot.status)).length;
  const occupancy = doors ? Math.round((counts.occupied / doors) * 100) : 0;
  return { counts, doors, occupancy };
}

export function HtmLotMap({
  lots = DEFAULT_LOTS,
  onSelect,
}: {
  lots?: Lot[];
  onSelect?: (lot: Lot) => void;
}) {
  const [filter, setFilter] = React.useState<LotStatus | null>(null);
  const [selected, setSelected] = React.useState<Lot | null>(null);
  const detailRef = React.useRef<HTMLDivElement>(null);

  const { counts } = lotCounts(lots);

  function pick(lot: Lot) {
    setSelected(lot);
    onSelect?.(lot);
    // The detail sits under the map. On a phone that is off-screen when you
    // tap a lot near the top, so bring it to the eye rather than making Zo
    // hunt for what he just tapped.
    window.setTimeout(
      () =>
        detailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        }),
      50,
    );
  }

  return (
    <div>
      {/* Filters. Scrolls sideways rather than wrapping to three rows and
          pushing the map off the screen. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(Object.keys(STATUS_META) as LotStatus[]).map((key) => {
          const meta = STATUS_META[key];
          const active = filter === key;
          return (
            <button
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                active
                  ? "border-[#1E3A8A] bg-[#1E3A8A] text-white"
                  : "border-[#DCE4EE] bg-white text-[#1B2231]"
              }`}
              key={key}
              onClick={() => setFilter(active ? null : key)}
              type="button"
            >
              <span
                className="h-3 w-3 rounded-[3px] border-2"
                style={{ background: meta.fill, borderColor: meta.stroke }}
              />
              {meta.label}
              <span className={active ? "text-white/70" : "text-[#6C7484]"}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      <svg
        aria-label="Hometown Meadows lot map"
        className="mt-3 block h-auto w-full rounded-2xl border border-[#DCE4EE] bg-white"
        role="img"
        viewBox="150 80 940 1210"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g
          fill="none"
          stroke="#8C949E"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={7}
        >
          <path d="M180,105 L555,105 L555,440 L180,440 Z" />
          <path d="M190,460 L555,460 L555,950 L190,950 Z" />
          <path d="M335,600 L500,650 M340,608 L350,950 M450,650 L450,950" />
          <path d="M190,960 L865,960 M585,100 L585,960 M585,100 L915,97 M850,100 L850,430 L1070,430 M880,120 L935,132" />
          <path d="M200,985 L200,1270 M330,985 L330,1270 L355,1270 M355,1105 L640,1105" />
        </g>
        <ellipse
          cx={850}
          cy={830}
          fill="#C8CFD7"
          opacity={0.6}
          rx={115}
          ry={78}
        />
        <rect
          fill="none"
          height={52}
          stroke="#8C949E"
          strokeWidth={3}
          width={32}
          x={808}
          y={115}
        />

        <g fill="#5F6B78" fontSize={20}>
          {STREET_LABELS.map(([label, x, y, rotation], i) => (
            <text
              key={i}
              textAnchor="middle"
              transform={rotation ? `rotate(${rotation} ${x} ${y})` : undefined}
              x={x}
              y={y}
            >
              {label}
            </text>
          ))}
        </g>

        <g>
          {lots.map((lot) => {
            const pos = LOT_POSITIONS[lot.id];
            if (!pos) return null;
            const meta = STATUS_META[lot.status];
            const dimmed = filter !== null && lot.status !== filter;
            const isSelected = selected?.id === lot.id;
            return (
              <g
                aria-label={`Lot ${lot.id}, ${meta.label}`}
                className="cursor-pointer outline-none"
                key={lot.id}
                onClick={() => pick(lot)}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && pick(lot)
                }
                opacity={dimmed ? 0.15 : 1}
                role="button"
                tabIndex={0}
              >
                <rect
                  fill={meta.fill}
                  height={48}
                  rx={6}
                  stroke={isSelected ? "#1E3A8A" : meta.stroke}
                  strokeWidth={isSelected ? 8 : 3}
                  width={64}
                  x={pos.x - 32}
                  y={pos.y - 24}
                />
                <text
                  fill={meta.text}
                  fontSize={24}
                  fontWeight={600}
                  textAnchor="middle"
                  x={pos.x}
                  y={pos.y + 8}
                >
                  {lot.id}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div ref={detailRef}>
        {selected ? (
          <div className="mt-3 rounded-2xl border border-[#DCE4EE] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-[17px] font-bold tracking-[-0.01em]">
                Lot {selected.id}
              </div>
              <span
                className="shrink-0 rounded-full border-2 px-2.5 py-1 text-[12px] font-bold"
                style={{
                  background: STATUS_META[selected.status].fill,
                  borderColor: STATUS_META[selected.status].stroke,
                  color: STATUS_META[selected.status].text,
                }}
              >
                {STATUS_META[selected.status].label}
              </span>
            </div>

            <dl className="mt-3 text-[14.5px]">
              {selected.bed != null && (
                <Row
                  label="Home"
                  value={`${selected.bed} bd / ${selected.bath} ba${
                    selected.sqft
                      ? ` · ${selected.sqft.toLocaleString()} sq ft`
                      : ""
                  }`}
                />
              )}
              {selected.tenant && (
                <Row label="Resident" value={selected.tenant} />
              )}
              {selected.rent != null && (
                <Row
                  label="Rent"
                  value={`$${selected.rent.toLocaleString()} a month`}
                />
              )}
            </dl>

            {selected.note && (
              <p className="mt-3 border-t border-[#E3E5E9] pt-3 text-[13.5px] text-[#6C7484]">
                {selected.note}
              </p>
            )}

            {selected.bed == null && !selected.note && (
              <p className="mt-3 text-[13.5px] text-[#6C7484]">
                Nothing recorded for this home yet. Walk it and file an
                inspection to fill this in.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[14.5px] text-[#6C7484]">
            Tap any lot to see what is there.
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[#E3E5E9] py-2 first:border-t-0 first:pt-0">
      <dt className="shrink-0 text-[#6C7484]">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
