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
  CameraIcon,
  CheckIcon,
  LoaderIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
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

const APPLIANCES = [
  ["stove", "Stove / range"],
  ["refrigerator", "Refrigerator"],
  ["dishwasher", "Dishwasher"],
  ["washer_dryer_hookups", "Washer / dryer hookups"],
  ["water_heater", "Water heater"],
  ["hvac", "HVAC or window A/C units"],
] as const;

const SYSTEMS = [
  ["power_on", "Power is on at the panel", ""],
  ["water_on", "Water is on — run every faucet", ""],
  ["hot_water", "Hot water works", ""],
  ["toilets", "Every toilet flushes and refills", ""],
  ["heat", "Heat runs", ""],
  ["ac", "Air conditioning runs", ""],
  ["no_leaks", "No leaks under sinks or at the water heater", ""],
  ["smoke_detectors", "Smoke detectors are there and beep when tested", ""],
] as const;

const CONDITION = [
  ["floors", "Floors are solid", "No soft spots or holes"],
  ["walls", "Walls and ceilings are clean", "No water stains or holes"],
  ["windows", "Every window is there, opens, and locks", ""],
  ["doors", "Every door is there, latches, and locks", ""],
  ["roof", "No roof leaks", "Stains on the ceiling mean a leak"],
  ["skirting", "Skirting is intact all the way around", ""],
  ["steps", "Steps and handrails are solid at both doors", ""],
  ["smell", "No smell of mold, smoke, or animals", ""],
] as const;

// These keys must match the generated occupancy_flagged column in the database.
const OCCUPANCY = [
  ["belongings", "Belongings left behind"],
  ["food", "Food in the fridge or cabinets"],
  ["power_on", "Power still on or meter running"],
  ["water_on", "Water still on"],
  ["mail", "Mail or paperwork left inside"],
] as const;

const KEYS = [
  ["have_key", "I have a key to this unit"],
  ["no_key", "No key — needs a re-key"],
  ["changed_locks", "I changed the locks today"],
] as const;

type Flags = Record<string, boolean>;

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

function Check({
  on,
  label,
  hint,
  onClick,
}: {
  on: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-start gap-3 px-4 py-3.5 text-left active:bg-[#F8FAFC]"
      onClick={onClick}
      type="button"
    >
      <span
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${
          on
            ? "border-[#16A34A] bg-[#16A34A] text-white"
            : "border-[#CBD5E1] bg-white"
        }`}
      >
        {on && <CheckIcon size={15} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] leading-snug text-[#1A1A2E]">
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-[14px] text-[#8291A5]">
            {hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mode?: "numeric" | "decimal";
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[13px] font-bold uppercase tracking-[0.07em] text-[#7A8AA3]">
        {label}
      </span>
      <input
        className="mt-1 w-full min-w-0 appearance-none rounded-xl border border-[#DCE4EE] bg-white px-3 py-3 text-[17px] text-[#0F1E33] placeholder:text-[#A3B0C0] focus:border-[#418BFF] focus:outline-none [&::-webkit-date-and-time-value]:w-full [&::-webkit-date-and-time-value]:text-left"
        inputMode={mode}
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
      return saved ? { ...emptyDraft(), ...JSON.parse(saved) } : emptyDraft();
    } catch {
      return emptyDraft();
    }
  });

  const [queue, setQueue] = React.useState<Queued[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const [filedId, setFiledId] = React.useState<string | null>(null);

  const conditionInput = React.useRef<HTMLInputElement>(null);
  const marketingInput = React.useRef<HTMLInputElement>(null);

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

  function toggle(group: keyof Draft, key: string) {
    setDraft((d) => {
      const current = d[group] as Flags;
      return { ...d, [group]: { ...current, [key]: !current[key] } };
    });
  }

  function addPhotos(
    files: FileList | null,
    photoSet: "condition" | "marketing",
  ) {
    if (!files?.length) return;
    setQueue((q) => [
      ...q,
      ...Array.from(files).map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        set: photoSet,
        state: "waiting" as const,
      })),
    ]);
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

    setSaving(true);
    setProblem("");

    try {
      const res = await apiFetch("/api/unit-inspections", {
        method: "POST",
        body: JSON.stringify({
          unit_number: draft.unit_number,
          inspected_at: draft.inspected_at,
          status: draft.status,
          beds: draft.beds,
          baths_full: draft.baths_full,
          baths_half: draft.baths_half,
          approx_sqft: draft.approx_sqft,
          home_width: draft.home_width,
          appliances: {
            ...draft.appliances,
            water_heater_fuel: draft.water_heater_fuel,
            ac_units: draft.ac_units,
          },
          systems: draft.systems,
          condition: draft.condition,
          occupancy_flags: draft.occupancy_flags,
          keys: draft.keys,
          last_tenant: draft.last_tenant,
          went_empty_approx: draft.went_empty_approx,
          notes: draft.notes,
          est_cost_to_ready: draft.est_cost_to_ready,
          days_to_ready: draft.days_to_ready,
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

  const checkedCount =
    Object.values(draft.appliances).filter(Boolean).length +
    Object.values(draft.systems).filter(Boolean).length +
    Object.values(draft.condition).filter(Boolean).length +
    Object.values(draft.keys).filter(Boolean).length;

  const occupied = Object.values(draft.occupancy_flags).some(Boolean);
  const pendingPhotos = queue.filter((p) => p.state !== "done").length;
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
            <div className="flex items-center justify-between">
              <Link aria-label="Back to your cockpit" to="/zo">
                <img
                  alt="Able Buys Homes"
                  className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain"
                  src="/able-logo.png"
                />
              </Link>
              <UserMenu />
            </div>
            <h1 className="mt-6 text-[30px] font-semibold leading-tight tracking-[-0.04em]">
              Unit {draft.unit_number} filed
            </h1>
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
          <div className="flex items-center justify-between">
            <img
              alt="Able Buys Homes"
              className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain"
              src="/able-logo.png"
            />
            <div className="flex items-center gap-3">
              <nav
                aria-label="Workspace pages"
                className="flex items-center gap-1 rounded-full bg-white/15 p-1"
              >
                <Link
                  className="rounded-full px-3 py-2 text-[16px] font-medium text-white/80 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
                  to="/zo"
                >
                  Cockpit
                </Link>
                <span
                  aria-current="page"
                  className="rounded-full bg-white px-3 py-2 text-[16px] font-medium text-[#1E3A8A]"
                >
                  Inspect
                </span>
              </nav>
              <UserMenu />
            </div>
          </div>
          <h1 className="mt-6 text-[30px] font-semibold leading-tight tracking-[-0.04em]">
            Unit Inspection
          </h1>
          <p className="mt-1 text-[16px] font-medium text-white/85">
            Hometown Meadows MHP · 121 Smith Lane, Nashville AR
          </p>
        </>
      }
    >
      <div className="pb-32">
        {problem ? (
          <p className="mt-4 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[16px] font-medium text-[#B91C1C]">
            {problem}
          </p>
        ) : null}

        <section className="mt-4 rounded-2xl border border-[#DCE4EE] bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Unit #"
              onChange={(v) => set("unit_number", v)}
              placeholder="12"
              value={draft.unit_number}
            />
            <Field
              label="Date"
              onChange={(v) => set("inspected_at", v)}
              type="date"
              value={draft.inspected_at}
            />
          </div>
          <p className="mt-2 text-[14px] text-[#8291A5]">
            Saved on this phone. Closing the page won&apos;t lose it.
          </p>
        </section>

        <Section title="Status — pick one">
          {STATUSES.map((s) => (
            <button
              className="flex w-full items-start gap-3 px-4 py-4 text-left active:bg-[#F8FAFC]"
              key={s.key}
              onClick={() => set("status", s.key)}
              type="button"
            >
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                  draft.status === s.key
                    ? "border-[#1E3A8A] bg-[#1E3A8A]"
                    : "border-[#CBD5E1] bg-white"
                }`}
              >
                {draft.status === s.key && (
                  <span className="h-2 w-2 rounded-full bg-white" />
                )}
              </span>
              <span>
                <span className="block text-[17px] font-bold text-[#1A1A2E]">
                  {s.label}
                </span>
                <span className="mt-0.5 block text-[15px] text-[#8291A5]">
                  {s.hint}
                </span>
              </span>
            </button>
          ))}
        </Section>

        <Section title="Unit specs — walk it, don't guess">
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-3 gap-2">
              <Field
                label="Bedrooms"
                mode="numeric"
                onChange={(v) => set("beds", v)}
                value={draft.beds}
              />
              <Field
                label="Full baths"
                mode="numeric"
                onChange={(v) => set("baths_full", v)}
                value={draft.baths_full}
              />
              <Field
                label="Half baths"
                mode="numeric"
                onChange={(v) => set("baths_half", v)}
                value={draft.baths_half}
              />
            </div>

            <p className="border-l-4 border-[#D95717] bg-[#FFF8F4] px-3 py-2.5 text-[15px] leading-snug text-[#733614]">
              A room only counts as a bedroom if it has a closet and a window. A
              half bath is toilet and sink only — no shower or tub.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Approx. sq ft"
                mode="numeric"
                onChange={(v) => set("approx_sqft", v)}
                value={draft.approx_sqft}
              />
              <Field
                label="Single or double wide"
                onChange={(v) => set("home_width", v)}
                value={draft.home_width}
              />
            </div>
          </div>
        </Section>

        <Section title="Appliances that stay">
          {APPLIANCES.map(([key, label]) => (
            <Check
              key={key}
              label={label}
              on={Boolean(draft.appliances[key])}
              onClick={() => toggle("appliances", key)}
            />
          ))}
          <div className="grid grid-cols-2 gap-3 p-4">
            <Field
              label="Water heater — gas or electric"
              onChange={(v) => set("water_heater_fuel", v)}
              value={draft.water_heater_fuel}
            />
            <Field
              label="How many A/C units"
              mode="numeric"
              onChange={(v) => set("ac_units", v)}
              value={draft.ac_units}
            />
          </div>
        </Section>

        <Section title="Systems — test them, don't assume">
          {SYSTEMS.map(([key, label, hint]) => (
            <Check
              hint={hint}
              key={key}
              label={label}
              on={Boolean(draft.systems[key])}
              onClick={() => toggle("systems", key)}
            />
          ))}
        </Section>

        <Section title="Condition">
          {CONDITION.map(([key, label, hint]) => (
            <Check
              hint={hint}
              key={key}
              label={label}
              on={Boolean(draft.condition[key])}
              onClick={() => toggle("condition", key)}
            />
          ))}
        </Section>

        <Section title="Signs someone was living here">
          {OCCUPANCY.map(([key, label]) => (
            <Check
              key={key}
              label={label}
              on={Boolean(draft.occupancy_flags[key])}
              onClick={() => toggle("occupancy_flags", key)}
            />
          ))}
          <div className="p-4">
            {/* Always visible - he needs this before he touches anything, not
                after. Emphasised once something is actually ticked. */}
            <p
              className={`mb-3 flex items-start gap-2 rounded-xl border-l-4 px-3 py-2.5 text-[15px] font-medium leading-snug ${
                occupied
                  ? "border-[#D95717] bg-[#FFE9DC] text-[#8A3A10]"
                  : "border-[#D95717] bg-[#FFF8F4] text-[#733614]"
              }`}
            >
                <TriangleAlertIcon
                  className="mt-0.5 shrink-0"
                  size={16}
                  strokeWidth={2.5}
                />
                If you check anything above: take a picture of it, leave
                everything exactly where it is, and text Raj before anyone else
                goes in. Do not clean the unit out.
            </p>
            <div className="space-y-3">
              <Field
                label="Last tenant, if you know"
                onChange={(v) => set("last_tenant", v)}
                value={draft.last_tenant}
              />
              <Field
                label="About when it went empty"
                onChange={(v) => set("went_empty_approx", v)}
                placeholder="e.g. sometime in June"
                value={draft.went_empty_approx}
              />
            </div>
          </div>
        </Section>

        <Section title="Keys">
          {KEYS.map(([key, label]) => (
            <Check
              key={key}
              label={label}
              on={Boolean(draft.keys[key])}
              onClick={() => toggle("keys", key)}
            />
          ))}
        </Section>

        {/* Two sets, two buttons, two colours. Not a dropdown he can miss. */}
        <Section title="Photos — two separate sets">
          <div className="space-y-4 p-4">
            <div className="rounded-2xl border-2 border-[#1E3A8A] p-4">
              <p className="text-[14px] font-bold uppercase tracking-wide text-[#1E3A8A]">
                Set 1 — Condition. Every unit.
              </p>
              <p className="mt-1 text-[15px] text-[#5B6B82]">
                Don&apos;t stage it. Show the damage. Internal only.
              </p>
              <input
                accept="image/*"
                className="hidden"
                multiple
                onChange={(e) => addPhotos(e.target.files, "condition")}
                ref={conditionInput}
                type="file"
              />
              <button
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1E3A8A] px-4 py-4 text-[17px] font-semibold text-white"
                onClick={() => conditionInput.current?.click()}
                type="button"
              >
                <CameraIcon size={18} strokeWidth={2.5} />
                Add condition photos
              </button>
            </div>

            <div className="rounded-2xl border-2 border-[#16A34A] bg-[#F1FCF8] p-4">
              <p className="text-[14px] font-bold uppercase tracking-wide text-[#0F5C2C]">
                Set 2 — Marketing. Rent ready only.
              </p>
              <p className="mt-1 text-[15px] text-[#3A4A62]">
                Lights on, blinds open, floors clear, nobody in shot. These get
                posted publicly.
              </p>
              <input
                accept="image/*"
                className="hidden"
                multiple
                onChange={(e) => addPhotos(e.target.files, "marketing")}
                ref={marketingInput}
                type="file"
              />
              <button
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-4 text-[17px] font-semibold text-white"
                onClick={() => marketingInput.current?.click()}
                type="button"
              >
                <CameraIcon size={18} strokeWidth={2.5} />
                Add marketing photos
              </button>
            </div>

            {queue.length > 0 && (
              <ul className="space-y-1.5">
                {queue.map((p) => (
                  <li
                    className="flex items-center gap-2.5 rounded-xl border border-[#DCE4EE] px-3 py-2.5"
                    key={p.id}
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold uppercase ${
                        p.set === "marketing"
                          ? "bg-[#16A34A] text-white"
                          : "bg-[#1E3A8A] text-white"
                      }`}
                    >
                      {p.set}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] text-[#1A1A2E]">
                      {p.file.name}
                    </span>
                    {p.state === "uploading" && (
                      <LoaderIcon
                        className="animate-spin shrink-0 text-[#418BFF]"
                        size={16}
                      />
                    )}
                    {p.state === "done" && (
                      <CheckIcon
                        className="shrink-0 text-[#16A34A]"
                        size={16}
                        strokeWidth={3}
                      />
                    )}
                    {p.state === "failed" && (
                      <span className="shrink-0 text-[13px] font-semibold text-[#DC2626]">
                        failed
                      </span>
                    )}
                    {p.state === "waiting" && (
                      <button
                        aria-label="Remove"
                        className="shrink-0 text-[#A3B0C0]"
                        onClick={() =>
                          setQueue((q) => q.filter((x) => x.id !== p.id))
                        }
                        type="button"
                      >
                        <XIcon size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[14px] text-[#8291A5]">
              Photos upload after you file. A photo is not required — if you
              can&apos;t get a usable shot, still file the record.
            </p>
          </div>
        </Section>

        <Section title="Work needed & notes">
          <div className="space-y-3 p-4">
            <label className="block">
              <textarea
                className="w-full rounded-xl border border-[#DCE4EE] px-3 py-3 text-[17px] text-[#0F1E33] placeholder:text-[#A3B0C0] focus:border-[#418BFF] focus:outline-none"
                onChange={(e) => set("notes", e.target.value)}
                placeholder="What needs doing before someone can move in?"
                rows={4}
                value={draft.notes}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Cost to make ready $"
                mode="decimal"
                onChange={(v) => set("est_cost_to_ready", v)}
                value={draft.est_cost_to_ready}
              />
              <Field
                label="Days to make ready"
                mode="numeric"
                onChange={(v) => set("days_to_ready", v)}
                value={draft.days_to_ready}
              />
            </div>
            <p className="text-[15px] text-[#8291A5]">
              Filed as {profile?.full_name ?? "you"}.
            </p>
          </div>
        </Section>
      </div>

      {/* Sticky footer, same as the standalone form */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#DCE4EE] bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-[#1A1A2E]">
              {draft.unit_number ? `Unit ${draft.unit_number}` : "No unit yet"}
            </p>
            <p className="text-[13px] text-[#8291A5]">
              {checkedCount} boxes checked
              {pendingPhotos > 0 ? ` · ${pendingPhotos} photos queued` : ""}
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
    </MobileScreenShell>
  );
}
