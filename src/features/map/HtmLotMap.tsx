// src/features/map/HtmLotMap.tsx
// The Hometown Meadows site plan, traced from the September 2026 drawing and
// ported from Raj's HtmLotMap.tsx.
//
// The geometry is fixed and must not be tidied. Those shapes are the actual
// streets and the boxes sit where the homes sit - Zo navigates by them.
// Only status changes, and it arrives through the `lots` prop, so this screen
// can never become a second opinion about who lives where.

import React from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/apiFetch";

export type LotStatus =
  | "occupied"
  | "ready"
  | "moving_out"
  | "needs_repair"
  | "full_rehab"
  | "common_area"
  | "verify";

export interface Lot {
  /** The lot number. Drives the geometry, which is fixed. */
  id: number;
  /** The database row. Needed to change anything about the lot. */
  lotId?: string;
  status: LotStatus;
  tenant?: string;
  rent?: number;
  note?: string;
  repairNote?: string;
  /** Who last said this is the status, and when. A status set by the
      1 September site walk is not the same claim as one Zo set today. */
  statusSetBy?: string;
  statusSetAt?: string;
  /** The date somebody intends to walk this home. Not proof they did. */
  nextInspectionAt?: string;
  nextInspectionSetBy?: string;
  /** What this lot owes today, across every month. */
  owed?: number;
  openJobCount?: number;
  topJob?: { id: string; title: string; priority: string };
  monthCharged?: number;
  monthPaid?: number;
  /** Where the rent stands. Only meaningful when the home is occupied. */
  rentState?: "paid" | "on_plan" | "late" | "occupied";
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

/**
 * What a lot is painted. Deliberately not the same list as LotStatus: an
 * occupied home is coloured by where its rent stands, which is a fact about
 * money rather than about the home.
 *
 * The three rent colours stay dark until a rent amount exists for that lot.
 * Painting seventeen occupied homes green today would tell Zo that seventeen
 * people have paid, and not one of them has.
 */
export type Paint =
  | "paid"
  | "on_plan"
  | "late"
  | "occupied"
  | "ready"
  | "moving_out"
  | "needs_repair"
  | "full_rehab"
  | "common_area"
  | "verify";

export const PAINT_META: Record<
  Paint,
  {
    label: string;
    fill: string;
    stroke: string;
    text: string;
    dashed?: boolean;
  }
> = {
  // Rent states. Filled, saturated, and far apart in hue - these are the
  // three that make Zo walk somewhere.
  paid: {
    label: "Occupied · paid",
    fill: "#BBF7D0",
    stroke: "#15803D",
    text: "#14532D",
  },
  on_plan: {
    label: "On a plan",
    fill: "#FDE68A",
    stroke: "#B45309",
    text: "#78350F",
  },
  late: {
    label: "Late",
    fill: "#FECACA",
    stroke: "#DC2626",
    text: "#7F1D1D",
  },
  // Someone lives here and there is nothing to act on. Hollow with a solid
  // outline: solid because it is not empty, hollow because nothing is known.
  occupied: {
    label: "Occupied",
    fill: "#FFFFFF",
    stroke: "#334155",
    text: "#1E293B",
  },
  // Empty homes are dashed. A hollow dashed box reads as "nobody here" from
  // across a gravel driveway in sunlight, which a fill colour does not.
  ready: {
    label: "Ready to rent",
    fill: "#FFFFFF",
    stroke: "#15803D",
    text: "#14532D",
    dashed: true,
  },
  moving_out: {
    label: "Moving out",
    fill: "#FFFFFF",
    stroke: "#B45309",
    text: "#78350F",
    dashed: true,
  },
  // Work states are filled, and orange and indigo rather than another amber
  // and another navy - the first version had these sitting on top of On a
  // plan and Occupied and you could not tell them apart.
  needs_repair: {
    label: "Needs repair",
    fill: "#FED7AA",
    stroke: "#C2410C",
    text: "#7C2D12",
  },
  full_rehab: {
    label: "Full rehab",
    fill: "#C7D2FE",
    stroke: "#4338CA",
    text: "#312E81",
  },
  common_area: {
    label: "Office / laundry",
    fill: "#E5E7EB",
    stroke: "#9CA3AF",
    text: "#4B5563",
  },
  verify: {
    label: "Needs checking",
    fill: "#FEF08A",
    stroke: "#A16207",
    text: "#713F12",
  },
};

function dollars(n: number) {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

/**
 * The rent line on a lot card, in the same words the rent roll uses. If the
 * two screens describe the same resident differently, Zo has to decide which
 * one to believe, and there is no way for him to find out.
 */
function rentLine(lot: Lot) {
  const owed = lot.owed ?? 0;

  if (lot.rentState === "on_plan") return "On a plan";
  if (lot.rentState === "late") return `Late · ${dollars(owed)} owed`;
  if (lot.rentState === "paid") {
    const paid = lot.monthPaid ?? 0;
    if (owed < 0) return `Paid · ${dollars(-owed)} in credit`;
    // "Paid" with no figure is nothing Zo can repeat back to a resident who
    // asks what they paid.
    return paid > 0 ? `Paid · ${dollars(paid)} this month` : "Paid";
  }
  if (owed > 0) return `Due · ${dollars(owed)} owed`;
  return "No rent recorded";
}

function rentTone(lot: Lot) {
  if (lot.rentState === "late") return "text-[#B3261E]";
  if (lot.rentState === "on_plan") return "text-[#8A5A00]";
  if (lot.rentState === "paid") return "text-[#1B7A4B]";
  return undefined;
}

function jobWord(priority: string) {
  if (priority === "emergency") return "Emergency";
  if (priority === "urgent") return "Urgent";
  if (priority === "cosmetic") return "Cosmetic";
  return "Routine";
}

function jobTone(priority: string) {
  if (priority === "emergency") return "text-[#B3261E]";
  if (priority === "urgent") return "text-[#92600A]";
  return undefined;
}

/** An occupied home is painted by its rent. Everything else by its status. */
export function paintOf(lot: Lot): Paint {
  if (lot.status !== "occupied") return lot.status;
  return lot.rentState ?? "occupied";
}

/** Every colour that means somebody lives there. */
export const OCCUPIED_PAINTS: Paint[] = ["paid", "on_plan", "late", "occupied"];

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
  const counts = {} as Record<Paint, number>;
  (Object.keys(PAINT_META) as Paint[]).forEach((key) => (counts[key] = 0));
  lots.forEach((lot) => (counts[paintOf(lot)] += 1));

  const doors = lots.filter((lot) => RENTABLE.includes(lot.status)).length;

  // Occupancy is about homes with someone in them, not about rent. A resident
  // who is late still lives here.
  const occupiedTotal = lots.filter((lot) => lot.status === "occupied").length;
  const occupancy = doors ? Math.round((occupiedTotal / doors) * 100) : 0;

  return { counts, doors, occupancy, occupiedTotal };
}

export function HtmLotMap({
  lots = DEFAULT_LOTS,
  onSelect,
  onChanged,
  selectLot,
}: {
  lots?: Lot[];
  onSelect?: (lot: Lot) => void;
  /** Called after a status or note is saved, so the page can reload. */
  onChanged?: () => void;
  /** A lot number a notification asked for. Selected and scrolled to. */
  selectLot?: number | null;
}) {
  const navigate = useNavigate();
  // "occupied_any" covers all four occupied colours at once, because the
  // Occupied tile means "somebody lives here" - not "somebody lives here and
  // has paid".
  const [filter, setFilter] = React.useState<Paint | "occupied_any" | null>(
    null,
  );
  // The id, not the object. After a save the array is replaced, and a stored
  // object would leave the card showing what the lot used to be.
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draftStatus, setDraftStatus] = React.useState<LotStatus>("verify");
  const [draftName, setDraftName] = React.useState("");
  const [draftRent, setDraftRent] = React.useState("");
  const [draftMoveIn, setDraftMoveIn] = React.useState("");
  const [draftNote, setDraftNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  // Scheduling mode. While it is on, tapping a lot picks it instead of
  // opening it - so the map has to say so in plain words. A screen that
  // silently changes what a tap does is a screen Zo stops trusting.
  const [selecting, setSelecting] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [inspectDate, setInspectDate] = React.useState("");
  const [savingInspect, setSavingInspect] = React.useState(false);

  const detailRef = React.useRef<HTMLDivElement>(null);

  const selected = lots.find((l) => l.id === selectedId) ?? null;

  // The move-in moment: a home that was not occupied is about to be. The rent
  // is asked for here and nowhere else on this screen.
  const movingIn =
    draftStatus === "occupied" && selected?.status !== "occupied";

  // A notification asked for one lot. Select it and bring the card to the
  // eye, exactly as a tap would - arriving with a card open somewhere below
  // the fold is the same as not opening it.
  React.useEffect(() => {
    if (!selectLot) return;
    setSelectedId(selectLot);
    window.setTimeout(
      () =>
        detailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        }),
      80,
    );
  }, [selectLot]);

  function openEditor() {
    if (!selected) return;
    setDraftStatus(selected.status);
    setDraftName(selected.tenant ?? "");
    // Blank on purpose. This is a new tenancy - carrying the last resident's
    // figure forward is how somebody gets charged the wrong rent.
    setDraftRent("");
    // Today by default, because most move-ins are recorded as they happen. Zo
    // can change it, and should if he is catching up on one from Tuesday -
    // this date fixes the resident's due day for the whole tenancy.
    setDraftMoveIn(new Date().toLocaleDateString("en-CA"));
    setDraftNote(selected.repairNote ?? "");
    setProblem("");
    setEditing(true);
  }

  async function saveInspections(date: string | null) {
    if (picked.size === 0) return;

    setSavingInspect(true);
    setProblem("");

    try {
      const res = await apiFetch("/api/lots", {
        method: "PATCH",
        body: JSON.stringify({
          lot_ids: [...picked],
          next_inspection_at: date,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save");

      setPicked(new Set());
      setSelecting(false);
      setInspectDate("");
      onChanged?.();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingInspect(false);
    }
  }

  async function save(patch: {
    home_status?: LotStatus;
    tenant_name?: string;
    repair_note?: string | null;
    contract_rent?: number;
    move_in_on?: string;
  }) {
    if (!selected?.lotId) {
      setProblem(
        "This lot is not in the database, so nothing can be saved against it.",
      );
      return;
    }

    setBusy(true);
    setProblem("");

    try {
      const res = await apiFetch("/api/lots", {
        method: "PATCH",
        body: JSON.stringify({ lot_id: selected.lotId, ...patch }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save");

      setEditing(false);
      onChanged?.();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const { counts } = lotCounts(lots);

  function pick(lot: Lot) {
    if (selecting) {
      // A lot that is not in the database cannot be scheduled, so it cannot
      // be picked either.
      if (!lot.lotId) return;

      // Already booked. Picking it again would quietly replace a walk somebody
      // has already planned, and the second date would look every bit as
      // deliberate as the first. Clearing it is still allowed - that is what
      // the Clear button is for.
      if (lot.nextInspectionAt) {
        setProblem(
          `Lot ${lot.id} already has an inspection scheduled. Clear that date first if it has changed.`,
        );
        return;
      }

      setProblem("");
      const id = lot.lotId;
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }

    setSelectedId(lot.id);
    setEditing(false);
    setProblem("");
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
      {selecting ? (
        <div className="mb-3 rounded-2xl border border-[#1E3A8A] bg-[#EEF3FB] p-4">
          <div className="text-[15px] font-bold text-[#1B2231]">
            Tap the homes you are going to walk
          </div>
          <div className="mt-0.5 text-[13.5px] text-[#4A5464]">
            {picked.size === 0
              ? "None picked yet."
              : `${picked.size} ${picked.size === 1 ? "home" : "homes"} picked.`}
          </div>

          <input
            className="mt-3 w-full rounded-[10px] border border-[#DCE4EE] bg-white px-3.5 py-2.5 text-[16px] text-[#1B2231]"
            onChange={(e) => setInspectDate(e.target.value)}
            type="date"
            value={inspectDate}
          />

          {problem && (
            <p className="mt-2.5 text-[14px] text-[#B91C1C]">{problem}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              className="rounded-[10px] bg-[#1E3A8A] px-3.5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              disabled={savingInspect || picked.size === 0 || !inspectDate}
              onClick={() => saveInspections(inspectDate)}
              type="button"
            >
              {savingInspect ? "Saving…" : "Set the date"}
            </button>
            <button
              className="rounded-[10px] border border-[#DCE4EE] bg-white px-3.5 py-2.5 text-[14px] font-semibold text-[#1B2231] disabled:opacity-50"
              disabled={savingInspect || picked.size === 0}
              onClick={() => saveInspections(null)}
              type="button"
            >
              Clear the date
            </button>
            <button
              className="rounded-[10px] border border-[#DCE4EE] bg-white px-3.5 py-2.5 text-[14px] font-semibold text-[#1B2231]"
              onClick={() => {
                setSelecting(false);
                setPicked(new Set());
                setInspectDate("");
                setProblem("");
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="mb-3 w-full rounded-2xl border border-[#DCE4EE] bg-white px-4 py-3 text-[15px] font-semibold text-[#1E3A8A]"
          onClick={() => setSelecting(true)}
          type="button"
        >
          Schedule inspections
        </button>
      )}

      {/* The three numbers Zo acts on. Tapping one dims the rest of the
          drawing rather than hiding it - he still needs to see where a lot
          sits relative to the park to walk to it. */}
      <div className="mb-3 grid grid-cols-3 gap-2.5">
        <MapTile
          active={filter === "occupied_any"}
          label="Occupied"
          n={counts.paid + counts.on_plan + counts.late + counts.occupied}
          onClick={() =>
            setFilter(filter === "occupied_any" ? null : "occupied_any")
          }
          tone="text-[#1B2231]"
        />
        <MapTile
          active={filter === "ready"}
          label="Ready to rent"
          n={counts.ready}
          onClick={() => setFilter(filter === "ready" ? null : "ready")}
          tone="text-[#0F5C41]"
        />
        <MapTile
          active={filter === "late"}
          label="Late"
          n={counts.late}
          onClick={() => setFilter(filter === "late" ? null : "late")}
          tone="text-[#B3261E]"
        />
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
            const paint = paintOf(lot);
            const meta = PAINT_META[paint];
            const dimmed =
              filter !== null &&
              (filter === "occupied_any"
                ? !OCCUPIED_PAINTS.includes(paint)
                : paint !== filter);
            const isSelected = selectedId === lot.id;
            const isPicked = Boolean(lot.lotId && picked.has(lot.lotId));
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
                  stroke={isSelected || isPicked ? "#1E3A8A" : meta.stroke}
                  strokeDasharray={meta.dashed ? "7 5" : undefined}
                  strokeWidth={isSelected || isPicked ? 8 : 3}
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

      {/* The key, under the drawing it explains - and still the filter, so
          tapping one dims everything else. It wraps into rows now rather than
          scrolling sideways, because down here it is not competing with the
          map for vertical space. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(PAINT_META) as Paint[]).map((key) => {
          const meta = PAINT_META[key];
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
              {/* The swatch has to be the same shape as the box on the map.
                  A solid chip beside a dashed lot is a legend that lies. */}
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-[3px] border-2"
                style={{
                  background: meta.fill,
                  borderColor: meta.stroke,
                  borderStyle: meta.dashed ? "dashed" : "solid",
                }}
              />
              {meta.label}
              <span className={active ? "text-white/70" : "text-[#6C7484]"}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      <div ref={detailRef}>
        {selected ? (
          <div className="mt-3 rounded-2xl border border-[#DCE4EE] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-[17px] font-bold tracking-[-0.01em]">
                Lot {selected.id}
                {selected.status === "occupied" && selected.tenant
                  ? ` — ${selected.tenant}`
                  : ""}
              </div>
              <span
                className="shrink-0 rounded-full border-2 px-2.5 py-1 text-[12px] font-bold"
                style={{
                  background: PAINT_META[paintOf(selected)].fill,
                  borderColor: PAINT_META[paintOf(selected)].stroke,
                  color: PAINT_META[paintOf(selected)].text,
                }}
              >
                {PAINT_META[paintOf(selected)].label}
              </span>
            </div>

            <dl className="mt-3 text-[14.5px]">
              <Row
                label="Home"
                value={[
                  PAINT_META[paintOf(selected)].label,
                  selected.bed != null
                    ? `${selected.bed} bd / ${selected.bath} ba`
                    : null,
                  selected.sqft
                    ? `${selected.sqft.toLocaleString()} sq ft`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />

              {/* Only for a home with somebody in it. An empty lot cannot owe
                  rent, and giving it a rent line invites someone to chase a
                  home nobody lives in. */}
              {selected.status === "occupied" && (
                <Row
                  label="Rent"
                  tone={rentTone(selected)}
                  value={rentLine(selected)}
                />
              )}

              {/* Names the worst one and counts the rest. "Water leak
                  (Emergency)" tells Zo where to walk; "3 jobs" does not. */}
              <Row
                label="Open jobs"
                tone={
                  selected.topJob
                    ? jobTone(selected.topJob.priority)
                    : undefined
                }
                value={
                  selected.topJob
                    ? `${selected.topJob.title} (${jobWord(
                        selected.topJob.priority,
                      )})${
                        (selected.openJobCount ?? 0) > 1
                          ? ` +${(selected.openJobCount ?? 0) - 1} more`
                          : ""
                      }`
                    : "None"
                }
              />

              {/* Always on the card, even with no date. A missing row reads as
                  "inspections do not apply here"; "Not scheduled" reads as
                  something somebody still has to do. */}
              <Row
                label="Next inspection"
                value={
                  selected.nextInspectionAt
                    ? new Date(
                        `${selected.nextInspectionAt}T00:00:00`,
                      ).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "Not scheduled"
                }
              />
            </dl>

            {selected.note && (
              <p className="mt-3 border-t border-[#E3E5E9] pt-3 text-[13.5px] text-[#6C7484]">
                {selected.note}
              </p>
            )}

            {(selected.status === "needs_repair" ||
              selected.status === "full_rehab") && (
              <div className="mt-3 rounded-[9px] border-l-4 border-l-[#D97706] bg-[#FFFCF5] px-3.5 py-3">
                <div className="text-[12px] font-bold uppercase tracking-[0.05em] text-[#7A4E06]">
                  What needs doing
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-[#92600A]">
                  {selected.repairNote || "Nothing written down yet."}
                </p>
              </div>
            )}

            {/* Where this status came from. One carried over from the
                September site walk is a different claim from one Zo set after
                standing in front of the home. */}
            {selected.statusSetBy && (
              <p className="mt-3 text-[12.5px] text-[#8A929E]">
                Set by {selected.statusSetBy}
                {selected.statusSetAt
                  ? ` · ${new Date(selected.statusSetAt).toLocaleDateString(
                      undefined,
                      { day: "numeric", month: "short", year: "numeric" },
                    )}`
                  : ""}
              </p>
            )}

            {problem && (
              <p className="mt-3 text-[14px] text-[#B91C1C]">{problem}</p>
            )}

            {editing ? (
              <div className="mt-3.5 border-t border-[#E3E5E9] pt-3.5">
                <label className="block text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]">
                  What is this lot now
                </label>
                <select
                  className="mt-1.5 w-full rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-2.5 text-[15px] text-[#1B2231]"
                  onChange={(e) => setDraftStatus(e.target.value as LotStatus)}
                  value={draftStatus}
                >
                  {(Object.keys(STATUS_META) as LotStatus[]).map((key) => (
                    <option key={key} value={key}>
                      {STATUS_META[key].label}
                    </option>
                  ))}
                </select>

                {/* A home cannot be occupied by nobody. The server refuses it
                    too - this is just the polite version of the same rule. */}
                {draftStatus === "occupied" && (
                  <>
                    <label className="mt-3 block text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]">
                      Who lives here
                    </label>
                    <input
                      className="mt-1.5 w-full rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-2.5 text-[15px] text-[#1B2231]"
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Full name from the lease"
                      type="text"
                      value={draftName}
                    />

                    {/* Only on the way in. Changing what somebody already pays
                        belongs on the Rent screen, next to the balance it
                        moves - not on a map of the ground. */}
                    {movingIn && (
                      <>
                        <label className="mt-3 block text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]">
                          Move-in date
                        </label>
                        <input
                          className="mt-1.5 block w-full min-w-0 appearance-none rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-2.5 text-[15px] text-[#1B2231]"
                          onChange={(e) => setDraftMoveIn(e.target.value)}
                          type="date"
                          value={draftMoveIn}
                        />
                        <p className="mt-1.5 text-[13px] leading-relaxed text-[#6C7484]">
                          Rent falls due on this day every month.
                        </p>

                        <label className="mt-3 block text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]">
                          Monthly rent
                        </label>
                        <input
                          className="mt-1.5 block w-full min-w-0 appearance-none rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-2.5 text-[15px] text-[#1B2231]"
                          inputMode="decimal"
                          min={0}
                          onChange={(e) => setDraftRent(e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          type="number"
                          value={draftRent}
                        />
                      </>
                    )}
                  </>
                )}

                {(draftStatus === "needs_repair" ||
                  draftStatus === "full_rehab") && (
                  <>
                    <label className="mt-3 block text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]">
                      What needs doing
                    </label>
                    <textarea
                      className="mt-1.5 w-full rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-2.5 text-[15px] leading-relaxed text-[#1B2231]"
                      onChange={(e) => setDraftNote(e.target.value)}
                      placeholder="Back steps rotten, water heater leaking, needs a screen door"
                      rows={4}
                      value={draftNote}
                    />
                  </>
                )}

                <div className="mt-3.5 flex gap-2.5">
                  <button
                    className="flex-1 rounded-[10px] border border-[#DCE4EE] bg-white px-3.5 py-2.5 text-[14px] font-semibold text-[#1B2231]"
                    onClick={() => setEditing(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 rounded-[10px] bg-[#1E3A8A] px-3.5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
                    disabled={
                      busy ||
                      (movingIn && (Number(draftRent) <= 0 || !draftMoveIn))
                    }
                    onClick={() =>
                      save({
                        home_status: draftStatus,
                        tenant_name: draftName.trim() || undefined,
                        repair_note:
                          draftStatus === "needs_repair" ||
                          draftStatus === "full_rehab"
                            ? draftNote.trim() || null
                            : undefined,
                        contract_rent: movingIn
                          ? Number(draftRent)
                          : undefined,
                        move_in_on: movingIn ? draftMoveIn : undefined,
                      })
                    }
                    type="button"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>

                {/* Says why the button is off. A disabled button with no
                    explanation reads as broken. */}
                {movingIn && (Number(draftRent) <= 0 || !draftMoveIn) && (
                  <p className="mt-2.5 text-[13px] leading-relaxed text-[#B91C1C]">
                    Both the move-in date and the monthly rent are needed — Save
                    turns on once they are there.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="mt-3.5 flex flex-wrap gap-2.5 border-t border-[#E3E5E9] pt-3.5">
                {selected.status === "occupied" && (
                  <button
                    className="rounded-[10px] border border-[#DCE4EE] bg-white px-3.5 py-2.5 text-[14px] font-semibold text-[#1B2231]"
                    onClick={() => navigate("/zo/collections")}
                    type="button"
                  >
                    Take payment
                  </button>
                )}
                {/* Jobs exists now, so this goes somewhere real. It lands on
                    the board rather than on this one job — the board sorts
                    emergencies to the top, so it will be the first thing
                    there. Deep-linking to a single job is worth doing later. */}
                <button
                  className="rounded-[10px] border border-[#DCE4EE] bg-whit e px-3.5 py-2.5 text-[14px] font-semibold text-[#1B2231]"
                  onClick={() => navigate("/zo/jobs")}
                  type="button"
                >
                  {selected.topJob ? "Open the job" : "New job"}
                </button>
              </div>

              {/* Secondary on purpose. The mock's card has two buttons, and
                  these are not what Zo reaches for standing at a door - but
                  dropping them would take away the only way to correct a
                  status or file an inspection from here. */}
              <div className="mt-3 flex flex-wrap gap-4">
                <button
                  className="text-[13.5px] font-semibold text-[#1E3A8A] underline"
                  onClick={openEditor}
                  type="button"
                >
                  Change the status
                </button>
                {selected.status !== "common_area" && (
                  <button
                    className="text-[13.5px] font-semibold text-[#1E3A8A] underline"
                    onClick={() => navigate("/zo/inspect")}
                    type="button"
                  >
                    Open in Inspect
                  </button>
                )}
                </div>
              </>
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

function MapTile({
  n,
  label,
  tone,
  active,
  onClick,
}: {
  n: number;
  label: string;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-2xl border p-4 text-left ${
        active ? "border-[#1E3A8A] bg-[#EEF3FB]" : "border-[#DCE4EE] bg-white"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className={`text-[26px] font-bold leading-tight ${tone}`}>{n}</div>
      <div className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#6C7484]">
        {label}
      </div>
    </button>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  /** Colour carries the urgency here, so it has to survive sunlight. */
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[#E3E5E9] py-2 first:border-t-0 first:pt-0">
      <dt className="shrink-0 text-[#6C7484]">{label}</dt>
      <dd className={`text-right font-semibold ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
