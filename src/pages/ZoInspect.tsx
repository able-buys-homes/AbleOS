// src/pages/ZoInspect.tsx
// Zo walks a vacant unit on his phone and files the record. Labels are lifted
// verbatim from the standalone HTML - they are written for someone standing in
// an empty unit, not for a desktop.
//
// Two photo sets are kept structurally apart. A construction photo in the
// marketing set is how a job site ends up on Zillow.

import React from "react";
import { Link } from "react-router-dom";
import {
  LoaderIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ZoScreenHeader } from "../components/ZoScreenHeader";
import { ScheduledUnitField } from "../features/inspections/ScheduledUnitField";
import { UnitInspectionsCard } from "../features/inspections/UnitInspectionsCard";
import { ZoTabBar } from "../components/ZoTabBar";
import { apiFetch } from "../lib/apiFetch";
import { useAuth } from "../lib/AuthProvider";

const DRAFT_KEY = "zo-unit-inspection-draft";

const STATUSES = [
  {
    key: "rent_ready",
    label: "RENT READY",
    hint: "Someone could move in today",
  },
  {
    key: "needs_work",
    label: "NEEDS WORK",
    hint: "Anything at all missing — list it below",
  },
  {
    key: "not_habitable",
    label: "NOT HABITABLE",
    hint: "Do not show it to anyone",
  },
] as const;

// Dev #54 (12 Oct 2026): the checklists (appliances, systems, condition,
// occupancy signs, keys) were replaced by a short form - Zo found them
// overwhelming. Old inspections keep what they recorded. "Anyone living
// there?" still sets occupancy_flags.belongings, a key the database's
// occupancy_flagged column reads, so Raj's flag keeps working.
const STATUS_WORD: Record<string, string> = {
  rent_ready: "Rent ready",
  needs_work: "Needs work",
  not_habitable: "Not habitable",
};

type Flags = Record<string, boolean>;

// Dev #54b (13 Oct 2026): "What needs fixing" is a list. Zo types one thing
// and its cost, taps Add, repeats, then files. Bedrooms, bathrooms, the
// occupancy question, ready-by date and photos were taken off the form.
type FixItem = { text: string; cost: number | null };

/** "$1,200.50" / "1200" -> 1200.5. Blank -> null. Anything else -> NaN. */
function toCost(raw: string): number | null {
  const s = raw.replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

function usd(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

type Draft = {
  unit_number: string;
  inspected_at: string;
  status: string;
  beds: string;
  baths_full: string;
  baths_half: string;
  approx_sqft: string;
  home_width: string;
  water_heater_fuel: string;
  ac_units: string;
  appliances: Flags;
  systems: Flags;
  condition: Flags;
  occupancy_flags: Flags;
  keys: Flags;
  last_tenant: string;
  went_empty_approx: string;
  notes: string;
  est_cost_to_ready: string;
  days_to_ready: string;
  ready_by: string;
  fix_items: FixItem[];
};

function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyDraft(): Draft {
  return {
    unit_number: "",
    inspected_at: today(),
    status: "",
    beds: "",
    baths_full: "",
    baths_half: "",
    approx_sqft: "",
    home_width: "",
    water_heater_fuel: "",
    ac_units: "",
    appliances: {},
    systems: {},
    condition: {},
    occupancy_flags: {},
    keys: {},
    last_tenant: "",
    went_empty_approx: "",
    notes: "",
    est_cost_to_ready: "",
    days_to_ready: "",
    ready_by: "",
    fix_items: [],
  };
}

type Queued = {
  id: string;
  file: File;
  set: "condition" | "marketing";
  state: "waiting" | "uploading" | "done" | "failed";
  error?: string;
};

/**
 * Park signal will not move a 4MB photo. Resize and re-encode before upload.
 * If anything fails, send the original rather than losing the photo.
 */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));

    if (scale === 1 && file.size < 900_000) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.72),
    );
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

/* ---------- small building blocks ---------- */
// Defined at module scope on purpose. Nested inside ZoInspect these were a new
// component type on every render, so React unmounted and remounted the subtree
// each keystroke - the input lost focus and the phone keyboard closed.
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white">
      <h2 className="bg-[#1E3A8A] px-4 py-3 text-[15px] font-bold uppercase tracking-[0.08em] text-white">
        {title}
      </h2>
      <div className="divide-y divide-[#F1F5F9]">{children}</div>
    </section>
  );
}

/**
 * Today at the park, not in UTC. Late evening in Arkansas is already tomorrow
 * in UTC, which would refuse a date the person can see on their own calendar.
 */
const parkToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mode,
  max,
  min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mode?: "numeric" | "decimal";
  max?: string;
  min?: string;
}) {
  return (
    <label className="flex h-full min-w-0 flex-col">
      <span className="mb-1 text-[13px] font-bold uppercase tracking-[0.07em] text-[#7A8AA3]">
        {label}
      </span>
      <input
        className="mt-auto w-full min-w-0 appearance-none rounded-xl border border-[#DCE4EE] bg-white px-3 py-3 text-[17px] text-[#0F1E33] placeholder:text-[#A3B0C0] focus:border-[#418BFF] focus:outline-none [&::-webkit-date-and-time-value]:w-full [&::-webkit-date-and-time-value]:text-left"
        inputMode={mode}
        max={max}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

export function ZoInspect() {
  const { profile } = useAuth();

  const [draft, setDraft] = React.useState<Draft>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return emptyDraft();
      const d: Draft = { ...emptyDraft(), ...JSON.parse(saved) };
      if (!Array.isArray(d.fix_items)) d.fix_items = [];
      if (!d.unit_number) d.inspected_at = today();
      return d;
    } catch {
      return emptyDraft();
    }
  });

  const [queue, setQueue] = React.useState<Queued[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const [filedId, setFiledId] = React.useState<string | null>(null);

  const [newText, setNewText] = React.useState("");
  const [newCost, setNewCost] = React.useState("");
  const newTextInput = React.useRef<HTMLInputElement>(null);

  // Saved on every keystroke. If he backgrounds the app or loses signal
  // mid-unit, the walk is not lost.
  React.useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // A full storage quota must never block the walk.
    }
  }, [draft]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function addItem() {
    const text = newText.trim();
    if (!text) {
      setProblem("Type what needs fixing first.");
      return;
    }
    const cost = toCost(newCost);
    if (Number.isNaN(cost)) {
      setProblem("Cost must be a number, like 150.");
      return;
    }
    setProblem("");
    setDraft((d) => ({
      ...d,
      fix_items: [...d.fix_items, { text: text.slice(0, 300), cost }],
    }));
    setNewText("");
    setNewCost("");
    newTextInput.current?.focus();
  }

  function removeItem(index: number) {
    setDraft((d) => ({
      ...d,
      fix_items: d.fix_items.filter((_, i) => i !== index),
    }));
  }

  async function uploadOne(inspectionId: string, item: Queued) {
    setQueue((q) =>
      q.map((p) => (p.id === item.id ? { ...p, state: "uploading" } : p)),
    );

    try {
      const file = await shrink(item.file);

      const res = await apiFetch("/api/unit-inspections?photo=1", {
        method: "POST",
        body: JSON.stringify({
          inspection_id: inspectionId,
          photo_set: item.set,
          mime_type: file.type,
          size_bytes: file.size,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not start the upload");

      const put = await fetch(body.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      // Copy into Drive on the server's bandwidth, not the phone's. Fire and
      // forget - Supabase already has it, and a Drive failure must never hold
      // up the walk.
      apiFetch("/api/unit-inspection-drive", {
        method: "POST",
        body: JSON.stringify({ photo_id: body.id }),
      }).catch(() => {
        // Recorded server-side in drive_error. Nothing for Zo to do about it.
      });

      setQueue((q) =>
        q.map((p) => (p.id === item.id ? { ...p, state: "done" } : p)),
      );
    } catch (err) {
      // Never silently dropped. It stays on screen, marked failed, re-tappable.
      setQueue((q) =>
        q.map((p) =>
          p.id === item.id
            ? {
                ...p,
                state: "failed",
                error: err instanceof Error ? err.message : "Failed",
              }
            : p,
        ),
      );
    }
  }

  async function uploadPending(inspectionId: string) {
    const pending = queue.filter((p) => p.state !== "done");
    for (const item of pending) {
      // One at a time: parallel uploads on a weak signal fail more, not less.
      await uploadOne(inspectionId, item);
    }
  }

  async function submit() {
    if (!draft.unit_number.trim()) {
      setProblem("Put the unit number in.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!draft.status) {
      setProblem("Pick a status.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const items = [...draft.fix_items];
    if (newText.trim()) {
      const cost = toCost(newCost);
      if (Number.isNaN(cost)) {
        setProblem("Cost must be a number, like 150.");
        return;
      }
      items.push({ text: newText.trim().slice(0, 300), cost });
      setDraft((d) => ({ ...d, fix_items: items }));
      setNewText("");
      setNewCost("");
    }

    if (draft.status !== "rent_ready" && items.length === 0) {
      setProblem("Add at least one thing that needs fixing.");
      return;
    }

    setSaving(true);
    setProblem("");

    try {
      const res = await apiFetch("/api/unit-inspections", {
        method: "POST",
        body: JSON.stringify({
          unit_number: draft.unit_number,
          inspected_at: draft.inspected_at,
          status: draft.status,
          fix_items: items,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not file it");

      const id = body.inspection.id as string;
      setFiledId(id);

      // The record is filed before a single photo moves. A photo is not
      // required to submit - if the unit has no power, it still gets filed.
      await uploadPending(id);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not file it");
    } finally {
      setSaving(false);
    }
  }

  function startNextUnit() {
    setDraft(emptyDraft());
    setNewText("");
    setNewCost("");
    setQueue([]);
    setFiledId(null);
    setProblem("");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* nothing to do */
    }
    window.scrollTo({ top: 0 });
  }

  const totalCost = draft.fix_items.reduce((sum, it) => sum + (it.cost ?? 0), 0);
  const failedPhotos = queue.filter((p) => p.state === "failed").length;
  const doneCount = queue.filter((p) => p.state === "done").length;
  const uploadsRunning = queue.some(
    (p) => p.state === "uploading" || p.state === "waiting",
  );

  if (filedId) {
    return (
      <MobileScreenShell
        headerContent={
          <>
            <ZoScreenHeader
              back={
                <Link aria-label="Back to your cockpit" to="/zo">
                  <img
                    alt="Able Buys Homes"
                    className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain shadow-sm"
                    src="/able-logo.png"
                  />
                </Link>
              }
              eyebrow="Hometown Meadows MHP"
              subtitle="The record is saved. Nothing on it can be edited now."
              title={`Unit ${draft.unit_number} filed`}
            />
          </>
        }
      >
        <div className="pt-4">
          <div className="rounded-2xl border border-[#C9E9E1] bg-[#F1FCF8] p-5 text-center">
            <p className="text-[18px] font-semibold text-[#0F5C2C]">
              Record saved
            </p>
            <p className="mt-1 text-[16px] text-[#3A4A62]">
              {queue.length === 0
                ? "No photos on this one."
                : `${queue.filter((p) => p.state === "done").length} of ${queue.length} photos uploaded.`}
            </p>
          </div>

          {failedPhotos > 0 && (
            <div className="mt-3 rounded-2xl border border-[#FECACA] bg-[#FFF8F4] p-4">
              <p className="text-[16px] font-semibold text-[#B91C1C]">
                {failedPhotos} photo{failedPhotos === 1 ? "" : "s"} did not
                upload
              </p>
              <p className="mt-1 text-[15px] text-[#733614]">
                The record is filed either way. Tap retry when you have signal.
              </p>
              <button
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D95717] px-4 py-3 text-[17px] font-semibold text-white"
                onClick={() => uploadPending(filedId)}
                type="button"
              >
                <RotateCcwIcon size={16} strokeWidth={2.5} />
                Retry the failed photos
              </button>
            </div>
          )}

          {/* Held shut while photos are still moving, so he cannot walk away
              mid-upload. Released once they have all settled - a permanently
              failed photo must never trap him on this screen. */}
          <button
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E3A8A] px-4 py-4 text-[18px] font-semibold text-white disabled:opacity-50"
            disabled={uploadsRunning}
            onClick={startNextUnit}
            type="button"
          >
            {uploadsRunning ? (
              <>
                <LoaderIcon className="animate-spin" size={16} strokeWidth={2.5} />
                Uploading {doneCount} of {queue.length}…
              </>
            ) : (
              "Start the next unit"
            )}
          </button>
        </div>
      </MobileScreenShell>
    );
  }

  /* ---------- the form ---------- */

  return (
    <MobileScreenShell
      headerContent={
        <>
          <ZoScreenHeader
            eyebrow="Hometown Meadows MHP"
            subtitle="A few quick answers. Write what needs fixing in your own words."
            title="Unit Inspection"
          />
        </>
      }
    >
      <div className="pb-32">
        {problem ? (
          <p className="mt-4 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[16px] font-medium text-[#B91C1C]">
            {problem}
          </p>
        ) : null}

        {/* History first, then the form for a new one. It is the same card
            Raj has, reading the same endpoint - which returns only the
            caller's own walks unless the caller is Raj. One description of an
            inspection rather than two that can drift apart. */}
        <div className="mt-4">
          <UnitInspectionsCard mine />
        </div>

        <section className="mt-4 rounded-2xl border border-[#DCE4EE] bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <ScheduledUnitField
              onChange={(v) => set("unit_number", v)}
              value={draft.unit_number}
            />
            <Field
              label="Date"
              // An inspection is a record of a walk that happened. It cannot
              // have happened tomorrow.
              max={parkToday()}
              onChange={(v) => set("inspected_at", v)}  
              type="date"
              value={draft.inspected_at}
            />
          </div>
        </section>

        <Section title="The unit">
          <div className="space-y-3 p-4">
            <label className="flex flex-col">
              <span className="mb-1 text-[13px] font-bold uppercase tracking-[0.07em] text-[#7A8AA3]">Status</span>
              <select
                className="w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-3 text-[17px] text-[#0F1E33] focus:border-[#418BFF] focus:outline-none"
                onChange={(e) => set("status", e.target.value)}
                value={draft.status}
              >
                <option value="">Pick one</option>
                {STATUSES.map((st) => (
                  <option key={st.key} value={st.key}>
                    {STATUS_WORD[st.key]} - {st.hint}
                  </option>
                ))}
              </select>
            </label>

          </div>
        </Section>

        <Section title="What needs fixing?">
          <div className="space-y-3 p-4">
            {draft.fix_items.length > 0 && (
              <ul className="space-y-2">
                {draft.fix_items.map((it, i) => (
                  <li
                    className="flex items-start gap-3 rounded-xl border border-[#DCE4EE] bg-[#F8FAFC] px-3 py-2.5"
                    key={`${i}-${it.text}`}
                  >
                    <span className="shrink-0 text-[15px] font-bold text-[#7A8AA3]">{i + 1}.</span>
                    <span className="min-w-0 flex-1 break-words text-[16px] text-[#0F1E33]">{it.text}</span>
                    <span className="shrink-0 text-[16px] font-semibold text-[#0F1E33]">
                      {it.cost === null ? "-" : usd(it.cost)}
                    </span>
                    <button
                      aria-label={`Remove ${it.text}`}
                      className="shrink-0 pt-0.5 text-[#A3B0C0] hover:text-[#DC2626]"
                      onClick={() => removeItem(i)}
                      type="button"
                    >
                      <XIcon size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <label className="flex flex-col">
              <span className="mb-1 text-[13px] font-bold uppercase tracking-[0.07em] text-[#7A8AA3]">
                What&apos;s wrong
              </span>
              <input
                className="w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-3 text-[17px] text-[#0F1E33] placeholder:text-[#A3B0C0] focus:border-[#418BFF] focus:outline-none"
                maxLength={300}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                }}
                placeholder="e.g. Back door won't lock"
                ref={newTextInput}
                value={newText}
              />
            </label>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <Field
                  label="Cost to fix $"
                  mode="decimal"
                  onChange={setNewCost}
                  placeholder="e.g. 150"
                  value={newCost}
                />
              </div>
              <button
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#1E3A8A] px-5 py-3 text-[17px] font-semibold text-white"
                onClick={addItem}
                type="button"
              >
                <PlusIcon size={18} strokeWidth={2.5} />
                Add
              </button>
            </div>

            {draft.fix_items.length > 0 && (
              <p className="flex justify-between rounded-xl bg-[#EEF4FF] px-3 py-2.5 text-[16px] font-semibold text-[#1E3A8A]">
                <span>
                  {draft.fix_items.length} item{draft.fix_items.length === 1 ? "" : "s"}
                </span>
                <span>Total {usd(totalCost)}</span>
              </p>
            )}
            <p className="text-[15px] text-[#8291A5]">
              Filed as {profile?.full_name ?? "you"}.
            </p>
          </div>
        </Section>

      </div>

      {/* Sticky footer, same as the standalone form */}
      {/* Clears the action bar, which now sits above the tab bar rather than
          on the floor of the screen. */}
      <div aria-hidden="true" className="h-[78px]" />

      <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-40 border-t border-[#DCE4EE] bg-white px-4 pb-3 pt-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[#1A1A2E]">
              {draft.unit_number ? `Unit ${draft.unit_number}` : "No unit yet"}
            </p>
            <p className="text-[13px] text-[#8291A5]">
              {draft.status ? STATUS_WORD[draft.status] : "No status yet"}
              {draft.fix_items.length > 0 ? ` · ${draft.fix_items.length} to fix · ${usd(totalCost)}` : ""}
            </p>
          </div>
          <button
            className="shrink-0 rounded-xl bg-[#D95717] px-6 py-3.5 text-[17px] font-semibold text-white disabled:opacity-60"
            disabled={saving}
            onClick={submit}
            type="button"
          >
            {saving ? "Filing…" : "File this unit"}
          </button>
        </div>
      </div>

      <ZoTabBar />
    </MobileScreenShell>
  );
}
