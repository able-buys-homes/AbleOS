// src/features/inspections/UnitInspectionsCard.tsx
// Raj's side of the unit walk. Zo files, Raj reads - no approval chain.
//
// Occupancy-flagged units sort to the top because a unit that is supposedly
// vacant with someone's belongings in it is the highest-signal thing on the page.

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ClipboardCheckIcon,
  DownloadIcon,
  ImageIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { NavCard } from "../../components/NavCard";
import { FilterMenu } from "../../components/FilterMenu";
import { apiFetch } from "../../lib/apiFetch";
import { useNotificationTarget } from "../../lib/useNotificationTarget";

// 5s, matching the notification bell: the bell and the card should not
// disagree about whether a walk exists.
const POLL_MS = 5_000;

// Lifted verbatim from ZoInspect so Raj reads the same words Zo ticked.
const APPLIANCE_LABELS: [string, string][] = [
  ["stove", "Stove / range"],
  ["refrigerator", "Refrigerator"],
  ["dishwasher", "Dishwasher"],
  ["washer_dryer_hookups", "Washer / dryer hookups"],
  ["water_heater", "Water heater"],
  ["hvac", "HVAC or window A/C units"],
];

const SYSTEM_LABELS: [string, string][] = [
  ["power_on", "Power is on at the panel"],
  ["water_on", "Water is on"],
  ["hot_water", "Hot water works"],
  ["toilets", "Every toilet flushes and refills"],
  ["heat", "Heat runs"],
  ["ac", "Air conditioning runs"],
  ["no_leaks", "No leaks under sinks or water heater"],
  ["smoke_detectors", "Smoke detectors tested"],
];

const CONDITION_LABELS: [string, string][] = [
  ["floors", "Floors are solid"],
  ["walls", "Walls and ceilings are clean"],
  ["windows", "Every window opens and locks"],
  ["doors", "Every door latches and locks"],
  ["roof", "No roof leaks"],
  ["skirting", "Skirting intact all the way around"],
  ["steps", "Steps and handrails solid"],
  ["smell", "No smell of mold, smoke, or animals"],
];

const OCCUPANCY_LABELS: Record<string, string> = {
  belongings: "Belongings left behind",
  food: "Food in the fridge or cabinets",
  power_on: "Power still on or meter running",
  water_on: "Water still on",
  mail: "Mail or paperwork left inside",
};

const KEY_LABELS: [string, string][] = [
  ["have_key", "Has a key to this unit"],
  ["no_key", "No key — needs a re-key"],
  ["changed_locks", "Locks changed on the walk"],
];

// Unticked is not blank - it means Zo checked and it failed. Shown in red so
// the absent items read as findings rather than as missing data.
function ChecklistBlock({
  title,
  items,
  flags,
  hideUnticked = false,
  extras = [],
}: {
  title: string;
  items: [string, string][];
  flags?: Record<string, boolean | string> | null;
  /** For groups where unticked means "not present" rather than "it failed". */
  hideUnticked?: boolean;
  /** Free-text values stored alongside the flags, e.g. water heater fuel. */
  extras?: [string, unknown][];
}) {
  const map = flags ?? {};
  const shown = hideUnticked  
    ? items.filter(([key]) => Boolean(map[key]))
    : items;

  const filledExtras = extras.filter(([, value]) => Boolean(value));
  if (!shown.length && !filledExtras.length) return null;
  return (
    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
      <p className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
        {title}
      </p>
      <ul className="mt-2 grid gap-1.5">
        {shown.map(([key, label]) => {
          const on = Boolean(map[key]);
          return (
            <li className="flex items-start gap-2 text-[15px]" key={key}>
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-[12px] font-bold ${
                  on
                    ? "border-[#16A34A] bg-[#16A34A] text-white"
                    : "border-[#E4B9B9] bg-[#FDF2F2] text-[#B91C1C]"
                }`}
              >
                {on ? "✓" : "✕"}
              </span>
              <span className={on ? "text-[#3A4A62]" : "text-[#B91C1C]"}>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      {filledExtras.length ? (
        <dl className="mt-3 grid gap-1 border-t border-[#F1F5F9] pt-3">
          {filledExtras.map(([label, value]) => (
            <div className="flex justify-between gap-3 text-[15px]" key={label}>
              <dt className="text-[#7A8AA3]">{label}</dt>
              <dd className="text-right text-[#0F1E33]">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

type Inspection = {
  id: string;
  unit_number: string;
  drive_folder_id?: string | null;
  property: string;
  inspected_at: string;
  status: "rent_ready" | "needs_work" | "not_habitable";
  beds: number | null;
  baths_full: number | null;
  baths_half: number | null;
  approx_sqft: number | null;
  home_width: string | null;
  occupancy_flagged: boolean;
  last_tenant: string | null;
  went_empty_approx: string | null;
  notes: string | null;
  est_cost_to_ready: string | number | null;
  days_to_ready: number | null;
  appliances: Record<string, boolean | string>;
  systems: Record<string, boolean | string>;
  condition: Record<string, boolean | string>;
  occupancy_flags: Record<string, boolean | string>;
  keys: Record<string, boolean | string>;
  photo_counts: { condition: number; marketing: number };
};

type Photo = {
  id: string;
  photo_set: "condition" | "marketing";
  room_tag: string | null;
  caption: string | null;
  url: string | null;
};

const STATUS_LABELS: Record<Inspection["status"], string> = {
  rent_ready: "Rent ready",
  needs_work: "Needs work",
  not_habitable: "Not habitable",
};

const STATUS_STYLES: Record<Inspection["status"], string> = {
  rent_ready: "bg-[#16A34A] text-white",
  needs_work: "bg-[#D97706] text-white",
  not_habitable: "bg-[#DC2626] text-white",
};

type Filter = "all" | Inspection["status"] | "flagged";

function money(value: string | number | null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * "3 bed / 2 full / 1 half" - full and half baths kept apart. A half bath is
 * toilet and sink only, so collapsing them into "2.5 bath" hides what is
 * actually there.
 */
function beds(row: Inspection) {
  const parts: string[] = [];
  if (row.beds !== null) parts.push(`${row.beds} bed`);
  if (row.baths_full) parts.push(`${row.baths_full} full`);
  if (row.baths_half) parts.push(`${row.baths_half} half`);

  const specs = parts.join(" / ");
  const extra: string[] = [];
  if (row.approx_sqft) extra.push(`${row.approx_sqft.toLocaleString()} sq ft`);
  if (row.home_width) extra.push(row.home_width);

  return [specs, ...extra].filter(Boolean).join(" · ");
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/** Unticked systems and condition items are the problems. */
function problems(row: Inspection) {
  const count = (group: Record<string, boolean | string>, expected: number) => {
    const ticked = Object.entries(group).filter(
      ([, v]) => typeof v === "boolean" && v,
    ).length;
    return Math.max(0, expected - ticked);
  };
  return count(row.systems, 8) + count(row.condition, 8);
}

export function UnitInspectionsCard({
  divider = false,
  row = false,
}: {
  divider?: boolean;
  row?: boolean;
}) {
  const [inspections, setInspections] = React.useState<Inspection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/unit-inspections");
      if (res.status === 401) return;

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not load inspections");

      setInspections(Array.isArray(body.inspections) ? body.inspections : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inspections");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Poll while visible so a walk Zo files appears without Raj refreshing.
  // No timer runs on a hidden tab, and returning to the tab refetches at once.
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);

    function handleVisibility() {
      if (!document.hidden) load();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  // A notification deep-links straight to the walk it is about. Held until the
  // list has loaded, otherwise the panel opens onto a row that is not there yet.
  const { clear, target } = useNotificationTarget();

  React.useEffect(() => {
    if (!target.inspection) return;
    if (!inspections.some((r) => r.id === target.inspection)) return;

    setOpen(true);
    setActiveId(target.inspection);
    clear();
  }, [clear, inspections, target.inspection]);

  // Signed photo links expire, so they are fetched when a unit is opened.
  React.useEffect(() => {
    if (!activeId) {
      setPhotos([]);
      return;
    }

    let live = true;
    setPhotosLoading(true);

    apiFetch(`/api/unit-inspections?id=${encodeURIComponent(activeId)}`)
      .then((res) => (res.ok ? res.json() : { photos: [] }))
      .then((body) => {
        if (live) setPhotos(body?.photos ?? []);
      })
      .catch(() => {
        if (live) setPhotos([]);
      })
      .finally(() => {
        if (live) setPhotosLoading(false);
      });

    return () => {
      live = false;
    };
  }, [activeId]);

  const totals = React.useMemo(() => {
    const byStatus = { rent_ready: 0, needs_work: 0, not_habitable: 0 };
    let cost = 0;
    let longest = 0;
    let flagged = 0;

    for (const row of inspections) {
      byStatus[row.status] += 1;
      const c = Number(row.est_cost_to_ready);
      if (Number.isFinite(c)) cost += c;
      if ((row.days_to_ready ?? 0) > longest) longest = row.days_to_ready ?? 0;
      if (row.occupancy_flagged) flagged += 1;
    }

    return { total: inspections.length, byStatus, cost, longest, flagged };
  }, [inspections]);

  const visible = React.useMemo(() => {
    if (filter === "all") return inspections;
    if (filter === "flagged") return inspections.filter((r) => r.occupancy_flagged);
    return inspections.filter((r) => r.status === filter);
  }, [inspections, filter]);

  const active = inspections.find((r) => r.id === activeId) ?? null;

  function exportCsv() {
    const head = [
      "unit", "property", "inspected", "status", "beds", "baths_full",
      "baths_half", "sqft", "width", "cost_to_ready", "days_to_ready",
      "occupancy_flagged", "condition_photos", "marketing_photos", "notes",
    ];

    const escape = (v: unknown) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;

    const rows = inspections.map((r) =>
      [
        r.unit_number, r.property, r.inspected_at, STATUS_LABELS[r.status],
        r.beds, r.baths_full, r.baths_half, r.approx_sqft, r.home_width,
        r.est_cost_to_ready, r.days_to_ready,
        r.occupancy_flagged ? "YES" : "",
        r.photo_counts.condition, r.photo_counts.marketing, r.notes,
      ].map(escape).join(","),
    );

    const blob = new Blob([[head.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unit-inspections-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <NavCard
        icon={<ClipboardCheckIcon aria-hidden="true" size={17} strokeWidth={2.5} />}
        title="Unit inspections"
        subtitle={
          totals.flagged > 0
            ? `${totals.flagged} flagged — someone may be living there`
            : "Vacant units Zo has walked"
        }
        count={loading ? null : totals.total}
        tone={totals.flagged > 0 ? "orange" : "green"}
        variant={row ? "row" : "card"}
        divider={divider}
        onClick={() => setOpen(true)}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-[#1A1A2E]/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:px-4 sm:py-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setOpen(false);
              setActiveId(null);
            }}
          >
            <motion.div
              className="flex h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[#EEF2F6] shadow-[0_20px_40px_rgba(30,58,138,0.18)]"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="shrink-0 border-b border-[#DCE4EE] bg-white px-5 pb-4 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[16px] font-semibold tracking-[0.13em] text-[#5B6B82]">
                      Hometown Meadows
                    </p>
                    <h2 className="mt-1 truncate text-[20px] font-bold text-[#0F1E33]">
                      {active ? `Unit ${active.unit_number}` : "Unit inspections"}
                    </h2>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {!active && inspections.length > 0 && (
                      <button
                        aria-label="Export CSV"
                        className="grid h-8 w-8 place-items-center rounded-full text-[#5B6B82] transition-colors hover:bg-[#F1F5F9]"
                        onClick={exportCsv}
                        type="button"
                      >
                        <DownloadIcon size={16} strokeWidth={2.25} />
                      </button>
                    )}
                    <button
                      aria-label="Close"
                      className="grid h-7 w-7 place-items-center rounded-full text-[#93A3B8] transition-colors hover:bg-[#F1F5F9]"
                      onClick={() => {
                        if (active) setActiveId(null);
                        else setOpen(false);
                      }}
                      type="button"
                    >
                      <XIcon aria-hidden="true" size={16} />
                    </button>
                  </div>
                </div>

                {!active && (
                  <div className="mt-3">
                    <FilterMenu
                      onChange={setFilter}
                      options={[
                        { key: "all", label: "All", count: totals.total },
                        { key: "flagged", label: "Flagged", count: totals.flagged },
                        { key: "rent_ready", label: "Rent ready", count: totals.byStatus.rent_ready },
                        { key: "needs_work", label: "Needs work", count: totals.byStatus.needs_work },
                        { key: "not_habitable", label: "Not habitable", count: totals.byStatus.not_habitable },
                      ]}
                      value={filter}
                    />
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {/* ---- TOTALS ---- */}
                {!active && !loading && inspections.length > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-3">
                      <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                        Vacant walked
                      </p>
                      <p className="mt-1 text-[24px] font-semibold leading-none text-[#0F1E33]">
                        {totals.total}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-3">
                      <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                        Cost to ready
                      </p>
                      <p className="mt-1 text-[24px] font-semibold leading-none text-[#D95717]">
                        {money(totals.cost) ?? "$0"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-3">
                      <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                        Rent ready
                      </p>
                      <p className="mt-1 text-[24px] font-semibold leading-none text-[#16A34A]">
                        {totals.byStatus.rent_ready}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-3">
                      <p className="text-[13px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                        Longest to ready
                      </p>
                      <p className="mt-1 text-[24px] font-semibold leading-none text-[#0F1E33]">
                        {totals.longest ? `${totals.longest}d` : "—"}
                      </p>
                    </div>
                  </div>
                )}

                {loading && (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-[84px] animate-pulse rounded-2xl bg-white" />
                    ))}
                  </div>
                )}

                {!loading && error && (
                  <div className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[16px] text-[#B91C1C]">
                    {error}
                  </div>
                )}

                {!loading && !error && inspections.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-5 py-10 text-center">
                    <p className="text-[18px] font-semibold text-[#526176]">
                      No units walked yet
                    </p>
                    <p className="mt-1 text-[16px] text-[#8291A5]">
                      Inspections appear here as Zo files them.
                    </p>
                  </div>
                )}

                {/* ---- LIST ---- */}
                {!active && !loading && visible.length > 0 && (
                  <div className="space-y-3">
                    {visible.map((r) => (
                      <button
                        className={`flex w-full overflow-hidden rounded-2xl border bg-white text-left transition hover:border-[#B9C7DB] ${
                          r.occupancy_flagged
                            ? "border-[#FDBA74]"
                            : "border-[#DCE4EE]"
                        }`}
                        key={r.id}
                        onClick={() => setActiveId(r.id)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className={`w-1.5 shrink-0 ${
                            r.status === "rent_ready"
                              ? "bg-[#16A34A]"
                              : r.status === "needs_work"
                                ? "bg-[#D97706]"
                                : "bg-[#DC2626]"
                          }`}
                        />
                        <span className="min-w-0 flex-1 px-4 py-3.5">
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[18px] font-semibold text-[#0F1E33]">
                                Unit {r.unit_number}
                              </span>
                              <span className="mt-0.5 block truncate text-[16px] text-[#5A6B85]">
                                {[beds(r), money(r.est_cost_to_ready), r.days_to_ready ? `${r.days_to_ready} days` : null]
                                  .filter(Boolean)
                                  .join(" · ") || "No figures yet"}
                              </span>
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold ${STATUS_STYLES[r.status]}`}
                            >
                              {STATUS_LABELS[r.status]}
                            </span>
                          </span>

                          <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[#7A8AA3]">
                            <span>{when(r.inspected_at)}</span>
                            {problems(r) > 0 && (
                              <span>· {problems(r)} problems</span>
                            )}
                            {(r.photo_counts.condition > 0 ||
                              r.photo_counts.marketing > 0) && (
                              <span className="inline-flex items-center gap-1">
                                ·
                                <ImageIcon aria-hidden="true" size={12} strokeWidth={2.5} />
                                {r.photo_counts.condition}
                                {r.photo_counts.marketing > 0 && (
                                  <span className="font-semibold text-[#16A34A]">
                                    +{r.photo_counts.marketing} mkt
                                  </span>
                                )}
                              </span>
                            )}
                            {r.occupancy_flagged && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF1E9] px-2 py-0.5 font-semibold text-[#8A3A10]">
                                <TriangleAlertIcon aria-hidden="true" size={11} strokeWidth={2.5} />
                                Someone may be living here
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* ---- ONE UNIT ---- */}
                {active && (
                  <div className="space-y-3">
                    {active.occupancy_flagged && (
                      <div className="rounded-2xl border-l-4 border-[#D95717] bg-[#FFF8F4] p-4">
                        <p className="flex items-center gap-2 text-[16px] font-semibold text-[#8A3A10]">
                          <TriangleAlertIcon size={16} strokeWidth={2.5} />
                          Signs someone was living here
                        </p>
                        <ul className="mt-2 space-y-1 text-[15px] text-[#733614]">
                          {Object.entries(active.occupancy_flags)
                            .filter(([, v]) => v === true)
                            .map(([k]) => (
                              <li key={k}>· {OCCUPANCY_LABELS[k] ?? k.replace(/_/g, " ")}</li>
                            ))}
                        </ul>
                      </div>
                    )}

                    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
                      <dl className="space-y-2 text-[16px]">
                        {[
                          ["Status", STATUS_LABELS[active.status]],
                          ["Walked", new Date(active.inspected_at).toLocaleDateString()],
                          ["Unit specs", beds(active)],
                          ["Cost to ready", money(active.est_cost_to_ready)],
                          ["Days to ready", active.days_to_ready],
                          ["Last tenant", active.last_tenant],
                          ["Went empty", active.went_empty_approx],
                        ]
                          .filter(([, v]) => v !== null && v !== undefined && v !== "")
                          .map(([label, value]) => (
                            <div className="flex justify-between gap-4" key={String(label)}>
                              <dt className="text-[#7A8AA3]">{label}</dt>
                              <dd className="text-right font-medium text-[#0F1E33]">
                                {String(value)}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    </div>

                    {active.notes && (
                      <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
                        <p className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                          Work needed
                        </p>
                        <p className="mt-2 whitespace-pre-line text-[16px] leading-relaxed text-[#3A4A62]">
                          {active.notes}
                        </p>
                      </div>
                    )}

                    <ChecklistBlock
                      extras={[
                        ["Water heater", active.appliances?.water_heater_fuel],
                        ["A/C units", active.appliances?.ac_units],
                      ]}
                      flags={active.appliances}
                      hideUnticked
                      items={APPLIANCE_LABELS}
                      title="Appliances that stay"
                    />
                    <ChecklistBlock
                      flags={active.systems}
                      items={SYSTEM_LABELS}
                      title="Systems"
                    />
                    <ChecklistBlock
                      flags={active.condition}
                      items={CONDITION_LABELS}
                      title="Condition"
                    />
                    <ChecklistBlock
                      flags={active.keys}
                      hideUnticked
                      items={KEY_LABELS}
                      title="Keys"
                    />

                    {/* Sets stay visually apart here too. */}
                    {(["condition", "marketing"] as const).map((set) => {
                      const shots = photos.filter((p) => p.photo_set === set);
                      if (!shots.length) return null;

                      return (
                        <div
                          className={`rounded-2xl border-2 bg-white p-4 ${
                            set === "marketing" ? "border-[#16A34A]" : "border-[#DCE4EE]"
                          }`}
                          key={set}
                        >
                          <p
                            className={`text-[14px] font-bold uppercase tracking-wide ${
                              set === "marketing" ? "text-[#0F5C2C]" : "text-[#7A8AA3]"
                            }`}
                          >
                            {set === "marketing"
                              ? `Marketing — ${shots.length}`
                              : `Condition — ${shots.length}`}
                          </p>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {shots.map((p) =>
                              p.url ? (
                                <a
                                  className="overflow-hidden rounded-lg border border-[#DCE4EE]"
                                  href={p.url}
                                  key={p.id}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <img
                                    alt={p.caption ?? set}
                                    className="h-24 w-full object-cover"
                                    src={p.url}
                                  />
                                </a>
                              ) : null,
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Drive holds the same photos, filed under the unit as
                        condition/ and marketing/. Only rendered once the mirror
                        has actually created the folder, so a dead link is
                        impossible. Opening it needs a Google account with
                        access to the shared drive. */}
                    {active.drive_folder_id && (
                      <a
                        className="flex items-center justify-between rounded-2xl border border-[#DCE4EE] bg-white px-4 py-3.5 text-[16px] font-semibold text-[#1E3A8A] active:bg-[#F8FAFC]"
                        href={`https://drive.google.com/drive/folders/${active.drive_folder_id}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span>Open Unit {active.unit_number} in Google Drive</span>
                        <span aria-hidden="true">↗</span>
                      </a>
                    )}

                    {photosLoading && (
                      <p className="text-[15px] text-[#8291A5]">Loading photos…</p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}