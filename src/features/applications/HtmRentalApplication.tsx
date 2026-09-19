// src/features/applications/HtmRentalApplication.tsx
// Application for Residency, taken in person by Zo on a phone.
//
// Six steps rather than one long scroll. A thirteen-section form on a phone
// is where people give up, and an application abandoned halfway is a resident
// lost - so each step asks for one kind of thing and will not let you past it
// until that part is answered.
//
// Styling follows the rest of the cockpit: the same tokens as
// /zo/collections and /zo/inspect, so Zo is not switching visual languages
// between screens on the same phone.

import { useState } from "react";

export type ApplyingFor = "community_home" | "lot_only" | "rent_to_own";

export interface Person {
  name: string;
  dob: string;
  ssnLast4: string;
  phone: string;
  email: string;
  idNumber: string;
}
export interface Occupant {
  name: string;
  relationship: string;
  age: string;
  adultApplied: boolean;
}
/** moveOut is optional: applications filed before Sept 2026 never had it. */
export interface Residence {
  address: string;
  moveIn: string;
  moveOut?: string;
  payment: string;
  rentOrOwn: "rent" | "own" | "";
  reason: string;
  landlord: string;
  landlordPhone: string;
  landlordEmail: string;
}
export interface Job {
  employer: string;
  position: string;
  start: string;
  supervisor: string;
  income: string;
  type: "full" | "part" | "self" | "";
}
export interface Income {
  source: string;
  amount: string;
  recipient: string;
}
export interface Vehicle {
  ymm: string;
  color: string;
  plate: string;
  owner: string;
}
export interface Pet {
  type: string;
  name: string;
  weight: string;
  age: string;
  fixed: boolean;
}
export interface OwnHome {
  ymm: string;
  size: string;
  serial: string;
  lienholder: string;
  titled: boolean | null;
  transport: string;
  insurance: string;
}
export interface Reference {
  name: string;
  relationship: string;
  phone: string;
}

export interface Application {
  date: string;
  lot: string;
  moveIn: string;
  applyingFor: ApplyingFor | "";
  applicant: Person;
  coApplicant: Person;
  coRelationship: string;
  occupants: Occupant[];
  current: Residence;
  previous: Residence;
  job: Job;
  coJob: Job;
  otherIncome: Income[];
  vehicles: Vehicle[];
  pets: Pet[];
  ownHome: OwnHome;
  background: Record<string, boolean | null>;
  backgroundNote: string;
  references: Reference[];
  emergency: Reference;
  source: string;
  sourceOther: string;
  certify: boolean;
  signature: string;
  coSignature: string;
  signDate: string;
}

const emptyPerson = (): Person => ({
  name: "",
  dob: "",
  ssnLast4: "",
  phone: "",
  email: "",
  idNumber: "",
});
const emptyRes = (): Residence => ({
  address: "",
  moveIn: "",
  moveOut: "",
  payment: "",
  rentOrOwn: "",
  reason: "",
  landlord: "",
  landlordPhone: "",
  landlordEmail: "",
});
const emptyJob = (): Job => ({
  employer: "",
  position: "",
  start: "",
  supervisor: "",
  income: "",
  type: "",
});

const BACKGROUND_QS: Array<[string, string]> = [
  ["evicted", "Ever evicted or asked to leave a residence?"],
  ["brokeLease", "Ever broken a lease or been sued for unpaid rent?"],
  ["bankruptcy", "Ever filed for bankruptcy?"],
  ["felony", "Ever been convicted of a felony?"],
  [
    "courtOrder",
    "Currently subject to a court order or registration requirement that affects where you may live?",
  ],
  ["smoke", "Do you smoke or vape?"],
];

export const emptyApplication = (): Application => ({
  date: new Date().toISOString().slice(0, 10),
  lot: "",
  moveIn: "",
  applyingFor: "",
  applicant: emptyPerson(),
  coApplicant: emptyPerson(),
  coRelationship: "",
  occupants: [],
  current: emptyRes(),
  previous: emptyRes(),
  job: emptyJob(),
  coJob: emptyJob(),
  otherIncome: [],
  vehicles: [],
  pets: [],
  ownHome: {
    ymm: "",
    size: "",
    serial: "",
    lienholder: "",
    titled: null,
    transport: "",
    insurance: "",
  },
  background: Object.fromEntries(BACKGROUND_QS.map(([k]) => [k, null])),
  backgroundNote: "",
  references: [{ name: "", relationship: "", phone: "" }],
  emergency: { name: "", relationship: "", phone: "" },
  source: "",
  sourceOther: "",
  certify: false,
  signature: "",
  coSignature: "",
  signDate: "",
});

/* ---------------- cockpit-styled controls ---------------- */

// 16px on inputs, because anything smaller makes iOS zoom the page on focus
// and Zo loses his place.
const INPUT =
  "w-full min-h-[46px] rounded-xl border border-[#DCE4EE] bg-white px-3.5 py-2.5 text-[16px] text-[#0F1E33] placeholder:text-[#9AA4B4] focus:border-[#1E3A8A] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/15";

const LABEL =
  "mb-1.5 block text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[#6C7484]";

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "block w-full" : "block min-w-[150px] flex-1"}>
      <span className={LABEL}>{label}</span>
      <input
        className={INPUT}
        inputMode={type === "tel" ? "tel" : undefined}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="mb-3.5 flex flex-wrap gap-3">{children}</div>;
}

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_1px_2px_rgba(30,58,138,0.04)]">
      <div className="border-b border-[#EEF0F3] px-4 py-3">
        <h2 className="text-[15.5px] font-bold tracking-[-0.01em] text-[#0F1E33]">
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[13px] text-[#6C7484]">{hint}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * Segmented buttons rather than radio dots. A radio dot is a four-millimetre
 * target on a phone; this is the whole row.
 */
function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="w-full">
      {label && <span className={LABEL}>{label}</span>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              className={`min-h-[44px] rounded-xl border px-3.5 py-2 text-[14.5px] font-semibold ${
                on
                  ? "border-[#1E3A8A] bg-[#1E3A8A] text-white"
                  : "border-[#DCE4EE] bg-white text-[#1B2231]"
              }`}
              key={o.value}
              onClick={() => onChange(o.value)}
              type="button"
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YesNo({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex shrink-0 gap-2">
      {[
        { v: true, label: "Yes" },
        { v: false, label: "No" },
      ].map((o) => {
        const on = value === o.v;
        return (
          <button
            className={`min-h-[42px] w-[68px] rounded-xl border text-[14.5px] font-semibold ${
              on
                ? "border-[#1E3A8A] bg-[#1E3A8A] text-white"
                : "border-[#DCE4EE] bg-white text-[#1B2231]"
            }`}
            key={o.label}
            onClick={() => onChange(o.v)}
            type="button"
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      className="min-h-[44px] w-full rounded-xl border border-dashed border-[#C3CDDC] bg-[#F7F9FC] px-3.5 py-2.5 text-[14.5px] font-semibold text-[#1E3A8A]"
      onClick={onClick}
      type="button"
    >
      + {label}
    </button>
  );
}

function RepeatCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 rounded-xl border border-[#DCE4EE] bg-[#FBFCFE] p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-[#6C7484]">
          {title}
        </span>
        <button
          className="min-h-[36px] rounded-lg border border-[#DCE4EE] bg-white px-3 text-[13px] font-semibold text-[#B4462B]"
          onClick={onRemove}
          type="button"
        >
          Remove
        </button>
      </div>
      {children}
    </div>
  );
}

/* ---------------- shared field groups ---------------- */

function PersonFields({ p, set }: { p: Person; set: (p: Person) => void }) {
  return (
    <>
      <Row>
        <Field
          label="Full legal name"
          onChange={(v) => set({ ...p, name: v })}
          value={p.name}
          wide
        />
      </Row>
      <Row>
        <Field
          label="Date of birth"
          onChange={(v) => set({ ...p, dob: v })}
          type="date"
          value={p.dob}
        />
        <Field
          label="SSN / ITIN last 4"
          onChange={(v) =>
            set({ ...p, ssnLast4: v.replace(/\D/g, "").slice(0, 4) })
          }
          value={p.ssnLast4}
        />
      </Row>
      <Row>
        <Field
          label="Phone"
          onChange={(v) => set({ ...p, phone: v })}
          type="tel"
          value={p.phone}
        />
        <Field
          label="Email"
          onChange={(v) => set({ ...p, email: v })}
          type="email"
          value={p.email}
        />
      </Row>
      <Row>
        <Field
          label="Driver's licence / ID and state"
          onChange={(v) => set({ ...p, idNumber: v })}
          value={p.idNumber}
          wide
        />
      </Row>
    </>
  );
}

function ResidenceFields({
  r,
  set,
  prev,
}: {
  r: Residence;
  set: (r: Residence) => void;
  prev?: boolean;
}) {
  return (
    <>
      <Row>
        <Field
          label="Street, city, state, ZIP"
          onChange={(v) => set({ ...r, address: v })}
          value={r.address}
          wide
        />
      </Row>
      <Row>
        <Field
          label="Moved in"
          onChange={(v) => set({ ...r, moveIn: v })}
          type="date"
          value={r.moveIn}
        />
        {/* A previous address is a span, not a moment, so it needs two dates. */}
        {prev ? (
          <Field
            label="Moved out"
            onChange={(v) => set({ ...r, moveOut: v })}
            type="date"
            value={r.moveOut || ""}
          />
        ) : (
          <Field
            label="Monthly payment"
            onChange={(v) => set({ ...r, payment: v })}
            value={r.payment}
          />
        )}
      </Row>
      {prev && (
        <Row>
          <Field
            label="Monthly payment"
            onChange={(v) => set({ ...r, payment: v })}
            value={r.payment}
          />
        </Row>
      )}
      <div className="mb-3.5">
        <Choice
          label="Rent or own"
          onChange={(v) => set({ ...r, rentOrOwn: v as "rent" | "own" })}
          options={[
            { value: "rent", label: "Rent" },
            { value: "own", label: "Own" },
          ]}
          value={r.rentOrOwn}
        />
      </div>
      {!prev && (
        <Row>
          <Field
            label="Reason for leaving"
            onChange={(v) => set({ ...r, reason: v })}
            value={r.reason}
            wide
          />
        </Row>
      )}
      <Row>
        <Field
          label="Landlord or mortgage company"
          onChange={(v) => set({ ...r, landlord: v })}
          value={r.landlord}
          wide
        />
      </Row>
      <Row>
        <Field
          label="Landlord phone"
          onChange={(v) => set({ ...r, landlordPhone: v })}
          type="tel"
          value={r.landlordPhone}
        />
        <Field
          label="Landlord email"
          onChange={(v) => set({ ...r, landlordEmail: v })}
          type="email"
          value={r.landlordEmail}
        />
      </Row>
    </>
  );
}

function JobFields({ j, set }: { j: Job; set: (j: Job) => void }) {
  return (
    <>
      <Row>
        <Field
          label="Employer"
          onChange={(v) => set({ ...j, employer: v })}
          value={j.employer}
          wide
        />
      </Row>
      <Row>
        <Field
          label="Position"
          onChange={(v) => set({ ...j, position: v })}
          value={j.position}
        />
        <Field
          label="Start date"
          onChange={(v) => set({ ...j, start: v })}
          type="date"
          value={j.start}
        />
      </Row>
      <Row>
        <Field
          label="Supervisor name and phone"
          onChange={(v) => set({ ...j, supervisor: v })}
          value={j.supervisor}
          wide
        />
      </Row>
      <Row>
        <Field
          label="Gross monthly income"
          onChange={(v) => set({ ...j, income: v })}
          placeholder="$"
          value={j.income}
          wide
        />
      </Row>
      <Choice
        label="Type"
        onChange={(v) => set({ ...j, type: v as Job["type"] })}
        options={[
          { value: "full", label: "Full-time" },
          { value: "part", label: "Part-time" },
          { value: "self", label: "Self-employed" },
        ]}
        value={j.type}
      />
    </>
  );
}

/* ---------------- steps ---------------- */

const STEPS = [
  "About you",
  "Address",
  "Income",
  "Household",
  "Background",
  "Review",
];

/** What has to be answered before this step can be left. Mirrors validate(). */
function stepProblem(step: number, app: Application): string | null {
  if (step === 0) {
    if (!app.applyingFor) return "Choose what they are applying for.";
    if (!app.applicant.name.trim()) return "Enter the applicant's full name.";
    if (!app.applicant.dob) return "Enter the applicant's date of birth.";
    if (!app.applicant.phone.trim()) return "Enter the applicant's phone.";
    return null;
  }
  if (step === 1) {
    if (!app.current.address.trim()) return "Enter the current address.";
    return null;
  }
  if (step === 2) {
    if (!app.job.employer.trim() && app.otherIncome.length === 0) {
      return "Add an employer, or at least one other income source.";
    }
    return null;
  }
  if (step === 4) {
    if (Object.values(app.background).some((v) => v === null)) {
      return "Answer every background question.";
    }
    if (!app.emergency.name.trim() || !app.emergency.phone.trim()) {
      return "Enter an emergency contact name and phone.";
    }
    return null;
  }
  return null;
}

/** A failed submit lands on the step that holds the problem. */
function stepForError(message: string): number {
  const m = message.toLowerCase();
  if (m.includes("current address")) return 1;
  if (m.includes("employment") || m.includes("income source")) return 2;
  if (m.includes("emergency") || m.includes("background")) return 4;
  if (m.includes("certif") || m.includes("sign")) return 5;
  return 0;
}

/* ---------------- main component ---------------- */

interface Props {
  initial?: Application;
  lots?: Array<{ id: number; label?: string }>;
  onSubmit: (app: Application) => Promise<void> | void;
  onSaveDraft?: (app: Application) => Promise<void> | void;
}

export default function HtmRentalApplication({
  initial,
  lots,
  onSubmit,
  onSaveDraft,
}: Props) {
  const [app, setApp] = useState<Application>(initial ?? emptyApplication());
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const up = <K extends keyof Application>(k: K, v: Application[K]) =>
    setApp((a) => ({ ...a, [k]: v }));

  const adults =
    1 +
    (app.coApplicant.name ? 1 : 0) +
    app.occupants.filter((o) => Number(o.age) >= 18).length;
  const fee = adults * 25;
  const petDeposit = app.pets.length * 50;
  const petRent = app.pets.length * 25;
  const income =
    Number(app.job.income || 0) +
    Number(app.coJob.income || 0) +
    app.otherIncome.reduce((s, i) => s + Number(i.amount || 0), 0);

  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const goNext = () => {
    const problem = stepProblem(step, app);
    if (problem) {
      setError(problem);
      toTop();
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    toTop();
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
    toTop();
  };

  const validate = (): string | null => {
    if (!app.applyingFor) return "Choose what they are applying for.";
    if (!app.applicant.name || !app.applicant.phone)
      return "Applicant name and phone are required.";
    if (!app.applicant.dob) return "Applicant date of birth is required.";
    if (!app.current.address) return "Current address is required.";
    if (!app.job.employer && app.otherIncome.length === 0)
      return "Add employment or another income source.";
    if (!app.emergency.name || !app.emergency.phone)
      return "Emergency contact is required.";
    if (Object.values(app.background).some((v) => v === null))
      return "Answer every background question.";
    if (!app.certify || !app.signature)
      return "Tick the certification and type a name to sign.";
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      setStep(stepForError(err));
      toTop();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ ...app, signDate: new Date().toISOString() });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="px-4 py-10 text-center">
        <div className="mx-auto max-w-[420px] rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(30,58,138,0.04)]">
          <h2 className="text-[20px] font-bold tracking-[-0.01em] text-[#0F1E33]">
            Application taken
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[#6C7484]">
            {app.applicant.name.split(" ")[0] || "The applicant"} is in the
            system. The office will review within two to three business days and
            call {app.applicant.phone}.
          </p>
          <p className="mt-3 text-[15px] font-semibold text-[#0F1E33]">
            ${fee} fee due at the office
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* Where they are, and how much is left. */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-[#DCE4EE] bg-[#F7F9FC]/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-bold tracking-[-0.01em] text-[#0F1E33]">
            {STEPS[step]}
          </span>
          <span className="text-[12.5px] font-semibold uppercase tracking-[0.06em] text-[#6C7484]">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {STEPS.map((s, i) => (
            <span
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? "bg-[#1E3A8A]" : "bg-[#DCE4EE]"
              }`}
              key={s}
            />
          ))}
        </div>
      </div>

      {error && (
        <div
          className="mb-4 rounded-2xl border border-[#B4462B] border-l-4 bg-[#FBEDEA] px-4 py-3 text-[14.5px] text-[#8A2E14]"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* ---- Step 0: about you ---- */}
      {step === 0 && (
        <>
          <Block title="This application">
            <Row>
              <Field
                label="Date"
                onChange={(v) => up("date", v)}
                type="date"
                value={app.date}
              />
              <Field
                label="Requested move-in"
                onChange={(v) => up("moveIn", v)}
                type="date"
                value={app.moveIn}
              />
            </Row>
            <Row>
              <label className="block w-full">
                <span className={LABEL}>Home or lot</span>
                {lots ? (
                  <select
                    className={INPUT}
                    onChange={(e) => up("lot", e.target.value)}
                    value={app.lot}
                  >
                    <option value="">Any available</option>
                    {lots.map((l) => (
                      <option key={l.id} value={String(l.id)}>
                        Lot {l.id}
                        {l.label ? ` — ${l.label}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={INPUT}
                    onChange={(e) => up("lot", e.target.value)}
                    placeholder="Any available"
                    value={app.lot}
                  />
                )}
              </label>
            </Row>
            <Choice
              label="Applying for"
              onChange={(v) => up("applyingFor", v as ApplyingFor)}
              options={[
                { value: "community_home", label: "Community home" },
                { value: "lot_only", label: "Lot only" },
                { value: "rent_to_own", label: "Rent to own" },
              ]}
              value={app.applyingFor}
            />
          </Block>

          <Block title="Applicant">
            <PersonFields p={app.applicant} set={(p) => up("applicant", p)} />
          </Block>

          <Block title="Co-applicant" hint="Leave blank if applying alone.">
            <PersonFields
              p={app.coApplicant}
              set={(p) => up("coApplicant", p)}
            />
            <Row>
              <Field
                label="Relationship to applicant"
                onChange={(v) => up("coRelationship", v)}
                value={app.coRelationship}
                wide
              />
            </Row>
          </Block>
        </>
      )}

      {/* ---- Step 1: address history ---- */}
      {step === 1 && (
        <>
          <Block title="Current address">
            <ResidenceFields r={app.current} set={(r) => up("current", r)} />
          </Block>
          <Block
            hint="Only if less than three years at the current address."
            title="Previous address"
          >
            <ResidenceFields
              prev
              r={app.previous}
              set={(r) => up("previous", r)}
            />
          </Block>
        </>
      )}

      {/* ---- Step 2: income ---- */}
      {step === 2 && (
        <>
          <Block
            hint="Two recent pay stubs, a benefit award letter, or three months of bank statements."
            title="Applicant employment"
          >
            <JobFields j={app.job} set={(j) => up("job", j)} />
          </Block>

          <Block title="Co-applicant employment">
            <JobFields j={app.coJob} set={(j) => up("coJob", j)} />
          </Block>

          <Block
            hint="SSI, SSDI, child support, retirement, VA, housing assistance."
            title="Other income"
          >
            {app.otherIncome.map((o, i) => (
              <RepeatCard
                key={i}
                onRemove={() =>
                  up(
                    "otherIncome",
                    app.otherIncome.filter((_, j) => j !== i),
                  )
                }
                title={`Source ${i + 1}`}
              >
                <Row>
                  <Field
                    label="Source"
                    onChange={(v) =>
                      up(
                        "otherIncome",
                        app.otherIncome.map((x, j) =>
                          j === i ? { ...x, source: v } : x,
                        ),
                      )
                    }
                    value={o.source}
                    wide
                  />
                </Row>
                <Row>
                  <Field
                    label="Monthly amount"
                    onChange={(v) =>
                      up(
                        "otherIncome",
                        app.otherIncome.map((x, j) =>
                          j === i ? { ...x, amount: v } : x,
                        ),
                      )
                    }
                    placeholder="$"
                    value={o.amount}
                  />
                  <Field
                    label="Who receives it"
                    onChange={(v) =>
                      up(
                        "otherIncome",
                        app.otherIncome.map((x, j) =>
                          j === i ? { ...x, recipient: v } : x,
                        ),
                      )
                    }
                    value={o.recipient}
                  />
                </Row>
              </RepeatCard>
            ))}
            <AddBtn
              label="Add income source"
              onClick={() =>
                up("otherIncome", [
                  ...app.otherIncome,
                  { source: "", amount: "", recipient: "" },
                ])
              }
            />
            {income > 0 && (
              <p className="mt-3 text-[14px] text-[#6C7484]">
                Household income{" "}
                <b className="text-[#0F1E33]">${income.toLocaleString()}</b> a
                month, which supports rent up to about{" "}
                <b className="text-[#0F1E33]">
                  ${Math.floor(income / 3).toLocaleString()}
                </b>
                .
              </p>
            )}
          </Block>
        </>
      )}

      {/* ---- Step 3: household ---- */}
      {step === 3 && (
        <>
          <Block hint="Everyone else, including children." title="Occupants">
            {app.occupants.map((o, i) => (
              <RepeatCard
                key={i}
                onRemove={() =>
                  up(
                    "occupants",
                    app.occupants.filter((_, j) => j !== i),
                  )
                }
                title={`Occupant ${i + 1}`}
              >
                <Row>
                  <Field
                    label="Full name"
                    onChange={(v) =>
                      up(
                        "occupants",
                        app.occupants.map((x, j) =>
                          j === i ? { ...x, name: v } : x,
                        ),
                      )
                    }
                    value={o.name}
                    wide
                  />
                </Row>
                <Row>
                  <Field
                    label="Relationship"
                    onChange={(v) =>
                      up(
                        "occupants",
                        app.occupants.map((x, j) =>
                          j === i ? { ...x, relationship: v } : x,
                        ),
                      )
                    }
                    value={o.relationship}
                  />
                  <Field
                    label="Age"
                    onChange={(v) =>
                      up(
                        "occupants",
                        app.occupants.map((x, j) =>
                          j === i ? { ...x, age: v } : x,
                        ),
                      )
                    }
                    value={o.age}
                  />
                </Row>
              </RepeatCard>
            ))}
            <AddBtn
              label="Add occupant"
              onClick={() =>
                up("occupants", [
                  ...app.occupants,
                  { name: "", relationship: "", age: "", adultApplied: false },
                ])
              }
            />
          </Block>

          <Block
            hint="Anything kept here must be registered, insured and running."
            title="Vehicles"
          >
            {app.vehicles.map((v, i) => (
              <RepeatCard
                key={i}
                onRemove={() =>
                  up(
                    "vehicles",
                    app.vehicles.filter((_, j) => j !== i),
                  )
                }
                title={`Vehicle ${i + 1}`}
              >
                <Row>
                  <Field
                    label="Year, make, model"
                    onChange={(x) =>
                      up(
                        "vehicles",
                        app.vehicles.map((y, j) =>
                          j === i ? { ...y, ymm: x } : y,
                        ),
                      )
                    }
                    value={v.ymm}
                    wide
                  />
                </Row>
                <Row>
                  <Field
                    label="Colour"
                    onChange={(x) =>
                      up(
                        "vehicles",
                        app.vehicles.map((y, j) =>
                          j === i ? { ...y, color: x } : y,
                        ),
                      )
                    }
                    value={v.color}
                  />
                  <Field
                    label="Plate and state"
                    onChange={(x) =>
                      up(
                        "vehicles",
                        app.vehicles.map((y, j) =>
                          j === i ? { ...y, plate: x } : y,
                        ),
                      )
                    }
                    value={v.plate}
                  />
                </Row>
              </RepeatCard>
            ))}
            <AddBtn
              label="Add vehicle"
              onClick={() =>
                up("vehicles", [
                  ...app.vehicles,
                  { ymm: "", color: "", plate: "", owner: "" },
                ])
              }
            />
          </Block>

          <Block
            hint="Written approval before move-in. $50 deposit and $25 a month each."
            title="Pets"
          >
            {app.pets.map((p, i) => (
              <RepeatCard
                key={i}
                onRemove={() =>
                  up(
                    "pets",
                    app.pets.filter((_, j) => j !== i),
                  )
                }
                title={`Pet ${i + 1}`}
              >
                <Row>
                  <Field
                    label="Type or breed"
                    onChange={(x) =>
                      up(
                        "pets",
                        app.pets.map((y, j) =>
                          j === i ? { ...y, type: x } : y,
                        ),
                      )
                    }
                    value={p.type}
                  />
                  <Field
                    label="Name"
                    onChange={(x) =>
                      up(
                        "pets",
                        app.pets.map((y, j) =>
                          j === i ? { ...y, name: x } : y,
                        ),
                      )
                    }
                    value={p.name}
                  />
                </Row>
                <Row>
                  <Field
                    label="Weight (lb)"
                    onChange={(x) =>
                      up(
                        "pets",
                        app.pets.map((y, j) =>
                          j === i ? { ...y, weight: x } : y,
                        ),
                      )
                    }
                    value={p.weight}
                  />
                  <div className="min-w-[150px] flex-1">
                    <span className={LABEL}>Spayed or neutered</span>
                    <YesNo
                      onChange={(v) =>
                        up(
                          "pets",
                          app.pets.map((y, j) =>
                            j === i ? { ...y, fixed: v } : y,
                          ),
                        )
                      }
                      value={p.fixed}
                    />
                  </div>
                </Row>
              </RepeatCard>
            ))}
            <AddBtn
              label="Add pet"
              onClick={() =>
                up("pets", [
                  ...app.pets,
                  { type: "", name: "", weight: "", age: "", fixed: false },
                ])
              }
            />
            {app.pets.length > 0 && (
              <p className="mt-3 text-[14px] text-[#6C7484]">
                {app.pets.length} pet{app.pets.length > 1 ? "s" : ""}:{" "}
                <b className="text-[#0F1E33]">${petDeposit}</b> deposit and{" "}
                <b className="text-[#0F1E33]">${petRent}</b> a month.
              </p>
            )}
          </Block>

          {app.applyingFor !== "community_home" && (
            <Block
              hint="If they are bringing or buying their own home."
              title="Their home"
            >
              <Row>
                <Field
                  label="Year, make, model"
                  onChange={(v) => up("ownHome", { ...app.ownHome, ymm: v })}
                  value={app.ownHome.ymm}
                  wide
                />
              </Row>
              <Row>
                <Field
                  label="Size"
                  onChange={(v) => up("ownHome", { ...app.ownHome, size: v })}
                  placeholder="14 x 70"
                  value={app.ownHome.size}
                />
                <Field
                  label="Serial or VIN"
                  onChange={(v) => up("ownHome", { ...app.ownHome, serial: v })}
                  value={app.ownHome.serial}
                />
              </Row>
              <Row>
                <Field
                  label="Lienholder, if financed"
                  onChange={(v) =>
                    up("ownHome", { ...app.ownHome, lienholder: v })
                  }
                  value={app.ownHome.lienholder}
                  wide
                />
              </Row>
              <div className="mb-3.5">
                <span className={LABEL}>Titled in their name</span>
                <YesNo
                  onChange={(v) => up("ownHome", { ...app.ownHome, titled: v })}
                  value={app.ownHome.titled}
                />
              </div>
              <Row>
                <Field
                  label="Transport or set-up company"
                  onChange={(v) =>
                    up("ownHome", { ...app.ownHome, transport: v })
                  }
                  value={app.ownHome.transport}
                />
                <Field
                  label="Insurance carrier"
                  onChange={(v) =>
                    up("ownHome", { ...app.ownHome, insurance: v })
                  }
                  value={app.ownHome.insurance}
                />
              </Row>
            </Block>
          )}
        </>
      )}

      {/* ---- Step 4: background ---- */}
      {step === 4 && (
        <>
          <Block
            hint="A yes does not disqualify anyone. It is asked so the office can review fairly."
            title="Background"
          >
            {BACKGROUND_QS.map(([k, q]) => (
              <div
                className="mb-4 border-b border-[#F1F5F9] pb-4 last:mb-0 last:border-0 last:pb-0"
                key={k}
              >
                <p className="mb-2.5 text-[15px] leading-snug text-[#1B2231]">
                  {q}
                </p>
                <YesNo
                  onChange={(v) =>
                    up("background", { ...app.background, [k]: v })
                  }
                  value={app.background[k]}
                />
              </div>
            ))}
          </Block>

          <Block title="Anything to explain">
            <textarea
              className={`${INPUT} min-h-[110px] resize-y`}
              onChange={(e) => up("backgroundNote", e.target.value)}
              value={app.backgroundNote}
            />
          </Block>

          <Block title="References">
            {app.references.map((r, i) => (
              <RepeatCard
                key={i}
                onRemove={() =>
                  up(
                    "references",
                    app.references.filter((_, j) => j !== i),
                  )
                }
                title={`Reference ${i + 1}`}
              >
                <Row>
                  <Field
                    label="Name"
                    onChange={(v) =>
                      up(
                        "references",
                        app.references.map((x, j) =>
                          j === i ? { ...x, name: v } : x,
                        ),
                      )
                    }
                    value={r.name}
                    wide
                  />
                </Row>
                <Row>
                  <Field
                    label="Relationship"
                    onChange={(v) =>
                      up(
                        "references",
                        app.references.map((x, j) =>
                          j === i ? { ...x, relationship: v } : x,
                        ),
                      )
                    }
                    value={r.relationship}
                  />
                  <Field
                    label="Phone"
                    onChange={(v) =>
                      up(
                        "references",
                        app.references.map((x, j) =>
                          j === i ? { ...x, phone: v } : x,
                        ),
                      )
                    }
                    type="tel"
                    value={r.phone}
                  />
                </Row>
              </RepeatCard>
            ))}
            <AddBtn
              label="Add reference"
              onClick={() =>
                up("references", [
                  ...app.references,
                  { name: "", relationship: "", phone: "" },
                ])
              }
            />
          </Block>

          <Block
            hint="Someone who does not live with them."
            title="Emergency contact"
          >
            <Row>
              <Field
                label="Name"
                onChange={(v) => up("emergency", { ...app.emergency, name: v })}
                value={app.emergency.name}
                wide
              />
            </Row>
            <Row>
              <Field
                label="Relationship"
                onChange={(v) =>
                  up("emergency", { ...app.emergency, relationship: v })
                }
                value={app.emergency.relationship}
              />
              <Field
                label="Phone"
                onChange={(v) =>
                  up("emergency", { ...app.emergency, phone: v })
                }
                type="tel"
                value={app.emergency.phone}
              />
            </Row>
          </Block>

          <Block title="How they heard about us">
            <Choice
              onChange={(v) => up("source", v)}
              options={[
                "Facebook",
                "Drove by",
                "Current resident",
                "Zillow or online",
                "Other",
              ].map((s) => ({ value: s, label: s }))}
              value={app.source}
            />
            {(app.source === "Current resident" || app.source === "Other") && (
              <div className="mt-3.5">
                <Field
                  label={
                    app.source === "Other" ? "Please say" : "Resident's name"
                  }
                  onChange={(v) => up("sourceOther", v)}
                  value={app.sourceOther}
                  wide
                />
              </div>
            )}
          </Block>
        </>
      )}

      {/* ---- Step 5: review and sign ---- */}
      {step === 5 && (
        <>
          <Block title="What was entered">
            <dl className="space-y-2 text-[15px]">
              {(
                [
                  ["Applicant", app.applicant.name || "Not given"],
                  ["Phone", app.applicant.phone || "Not given"],
                  [
                    "Applying for",
                    {
                      community_home: "Community home",
                      lot_only: "Lot only",
                      rent_to_own: "Rent to own",
                      "": "Not chosen",
                    }[app.applyingFor],
                  ],
                  ["Lot", app.lot || "Any available"],
                  ["Move-in", app.moveIn || "Not given"],
                  ["Current address", app.current.address || "Not given"],
                  ["Adults", String(adults)],
                  ["Occupants", String(app.occupants.length)],
                  ["Pets", String(app.pets.length)],
                  [
                    "Monthly income",
                    income > 0 ? `$${income.toLocaleString()}` : "Not given",
                  ],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <div className="flex justify-between gap-4" key={label}>
                  <dt className="shrink-0 text-[#6C7484]">{label}</dt>
                  <dd className="min-w-0 break-words text-right font-semibold text-[#0F1E33]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Block>

          <Block title="Fees">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] text-[#6C7484]">
                Application, {adults} adult{adults > 1 ? "s" : ""}
              </span>
              <span className="text-[19px] font-bold text-[#0F1E33]">
                ${fee}
              </span>
            </div>
            {app.pets.length > 0 && (
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-[15px] text-[#6C7484]">Pet deposit</span>
                <span className="text-[15px] font-semibold text-[#0F1E33]">
                  ${petDeposit} and ${petRent} a month
                </span>
              </div>
            )}
          </Block>

          <Block title="Authorisation">
            <ul className="mb-4 list-disc space-y-2 pl-5 text-[14.5px] leading-relaxed text-[#1B2231]">
              <li>
                Everything here is true and complete. False or missing
                information is grounds for denial or termination of residency.
              </li>
              <li>
                Hometown Meadows and its agents may obtain a consumer credit
                report, criminal background and eviction history, and verify
                employment, income and rental history.
              </li>
              <li>
                The application fee is $25 per adult and is not refundable.
              </li>
              <li>
                Approval is based on income, generally three times the monthly
                rent, along with rental history, background and credit. Hometown
                Meadows does not discriminate on the basis of race, colour,
                religion, sex, national origin, familial status, disability, or
                any other protected class.
              </li>
              <li>
                A home is reserved only when a deposit is paid and a residency
                agreement is signed.
              </li>
            </ul>

            <label className="mb-4 flex items-start gap-3 text-[15px] text-[#1B2231]">
              <input
                checked={app.certify}
                className="mt-1 h-5 w-5 shrink-0"
                onChange={(e) => up("certify", e.target.checked)}
                type="checkbox"
              />
              <span>They have read and agree to the above.</span>
            </label>

            <Row>
              <Field
                label="Applicant — type full name to sign"
                onChange={(v) => up("signature", v)}
                value={app.signature}
                wide
              />
            </Row>
            <Row>
              <Field
                label="Co-applicant — type full name to sign"
                onChange={(v) => up("coSignature", v)}
                value={app.coSignature}
                wide
              />
            </Row>
          </Block>
        </>
      )}

      {/* Sticky, because on a phone the buttons are otherwise a scroll away. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#DCE4EE] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[640px] items-center gap-2.5">
          {step > 0 && (
            <button
              className="min-h-[48px] rounded-xl border border-[#D5D8DE] bg-white px-4 text-[15px] font-semibold text-[#1B2231]"
              onClick={goBack}
              type="button"
            >
              Back
            </button>
          )}

          {onSaveDraft && (
            <button
              className="min-h-[48px] rounded-xl border border-[#EEF0F3] bg-[#EEF0F3] px-4 text-[15px] font-semibold text-[#1E3A8A] disabled:opacity-45"
              disabled={busy}
              onClick={() => onSaveDraft(app)}
              type="button"
            >
              Save
            </button>
          )}

          {step < STEPS.length - 1 ? (
            <button
              className="min-h-[48px] flex-1 rounded-xl border border-[#1E3A8A] bg-[#1E3A8A] text-[15.5px] font-semibold text-white"
              onClick={goNext}
              type="button"
            >
              Next
            </button>
          ) : (
            <button
              className="min-h-[48px] flex-1 rounded-xl border border-[#B4462B] bg-[#B4462B] text-[15.5px] font-semibold text-white disabled:opacity-45"
              disabled={busy}
              onClick={submit}
              type="button"
            >
              {busy ? "Submitting…" : "Submit application"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
