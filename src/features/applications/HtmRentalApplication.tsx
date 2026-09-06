import { useState } from "react";

/**
 * HtmRentalApplication — Application for Residency form for the Able OS cockpit.
 *
 * Drop-in for /zo (and public intake if Dane exposes it). No deps beyond React.
 * All fields live in one `app` object; `onSubmit(app)` hands it to Supabase
 * (suggested table: htm_applications, jsonb column `data` + status/lot/created_at).
 *
 * Business rules baked in: $25 fee per adult, $50 pet deposit + $25/mo pet rent
 * per pet, 3x income guideline, Section 8 accepted.
 */

const NAVY = "#2A3648", CORAL = "#F0704A", GRAY = "#5F6B78", LINE = "#C9D0D8", BG = "#F3F5F8";

export type ApplyingFor = "community_home" | "lot_only" | "rent_to_own";

export interface Person { name: string; dob: string; ssnLast4: string; phone: string; email: string; idNumber: string; }
export interface Occupant { name: string; relationship: string; age: string; adultApplied: boolean; }
export interface Residence { address: string; moveIn: string; payment: string; rentOrOwn: "rent" | "own" | ""; reason: string; landlord: string; landlordPhone: string; landlordEmail: string; }
export interface Job { employer: string; position: string; start: string; supervisor: string; income: string; type: "full" | "part" | "self" | ""; }
export interface Income { source: string; amount: string; recipient: string; }
export interface Vehicle { ymm: string; color: string; plate: string; owner: string; }
export interface Pet { type: string; name: string; weight: string; age: string; fixed: boolean; }
export interface OwnHome { ymm: string; size: string; serial: string; lienholder: string; titled: boolean | null; transport: string; insurance: string; }
export interface Reference { name: string; relationship: string; phone: string; }

export interface Application {
  date: string; lot: string; moveIn: string; applyingFor: ApplyingFor | "";
  applicant: Person; coApplicant: Person; coRelationship: string;
  occupants: Occupant[]; current: Residence; previous: Residence;
  job: Job; coJob: Job; otherIncome: Income[];
  vehicles: Vehicle[]; pets: Pet[]; ownHome: OwnHome;
  background: Record<string, boolean | null>; backgroundNote: string;
  references: Reference[]; emergency: Reference;
  source: string; sourceOther: string;
  certify: boolean; signature: string; coSignature: string; signDate: string;
}

const emptyPerson = (): Person => ({ name: "", dob: "", ssnLast4: "", phone: "", email: "", idNumber: "" });
const emptyRes = (): Residence => ({ address: "", moveIn: "", payment: "", rentOrOwn: "", reason: "", landlord: "", landlordPhone: "", landlordEmail: "" });
const emptyJob = (): Job => ({ employer: "", position: "", start: "", supervisor: "", income: "", type: "" });

const BACKGROUND_QS: Array<[string, string]> = [
  ["evicted", "Have you ever been evicted or asked to leave a residence?"],
  ["brokeLease", "Have you ever broken a lease or been sued for unpaid rent?"],
  ["bankruptcy", "Have you ever filed for bankruptcy?"],
  ["felony", "Have you ever been convicted of a felony?"],
  ["courtOrder", "Are you currently subject to a court order or registration requirement that would affect where you may live?"],
  ["smoke", "Do you smoke or vape? (Not permitted inside community-owned homes.)"],
];

export const emptyApplication = (): Application => ({
  date: new Date().toISOString().slice(0, 10), lot: "", moveIn: "", applyingFor: "",
  applicant: emptyPerson(), coApplicant: emptyPerson(), coRelationship: "",
  occupants: [], current: emptyRes(), previous: emptyRes(),
  job: emptyJob(), coJob: emptyJob(), otherIncome: [],
  vehicles: [], pets: [], ownHome: { ymm: "", size: "", serial: "", lienholder: "", titled: null, transport: "", insurance: "" },
  background: Object.fromEntries(BACKGROUND_QS.map(([k]) => [k, null])), backgroundNote: "",
  references: [{ name: "", relationship: "", phone: "" }], emergency: { name: "", relationship: "", phone: "" },
  source: "", sourceOther: "", certify: false, signature: "", coSignature: "", signDate: "",
});

/* ---------- tiny UI primitives ---------- */
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 10px", fontSize: 15, border: `1px solid ${LINE}`, borderRadius: 8, background: "#fff", color: NAVY, fontFamily: "inherit" };
const Field = ({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) => (
  <label style={{ display: "block", flex: 1, minWidth: 140 }}>
    <span style={{ display: "block", fontSize: 12, color: GRAY, marginBottom: 4 }}>{label}</span>
    <input style={inputStyle} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  </label>
);
const Row = ({ children }: { children: React.ReactNode }) => <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>{children}</div>;
const Section = ({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) => (
  <section style={{ marginBottom: 22 }}>
    <h3 style={{ background: NAVY, color: "#fff", fontSize: 13, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", padding: "7px 12px", borderRadius: 6, margin: "0 0 10px" }}>{n}. {title}</h3>
    {hint && <p style={{ fontSize: 13, color: GRAY, margin: "0 0 10px" }}>{hint}</p>}
    {children}
  </section>
);
const AddBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button type="button" onClick={onClick} style={{ fontSize: 13, padding: "6px 12px", border: `1px dashed ${LINE}`, borderRadius: 8, background: "transparent", color: NAVY, cursor: "pointer" }}>+ {label}</button>
);
const RemoveBtn = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} aria-label="Remove" style={{ alignSelf: "flex-end", fontSize: 13, padding: "9px 10px", border: `1px solid ${LINE}`, borderRadius: 8, background: "#fff", color: GRAY, cursor: "pointer" }}>✕</button>
);
const Radio = ({ name, value, current, onChange, label }: { name: string; value: string; current: string; onChange: (v: string) => void; label: string }) => (
  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, marginRight: 14, marginBottom: 6 }}>
    <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} /> {label}
  </label>
);
const YesNo = ({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) => (
  <span style={{ display: "inline-flex", gap: 10, whiteSpace: "nowrap" }}>
    <label style={{ fontSize: 14 }}><input type="radio" checked={value === true} onChange={() => onChange(true)} /> Yes</label>
    <label style={{ fontSize: 14 }}><input type="radio" checked={value === false} onChange={() => onChange(false)} /> No</label>
  </span>
);

const PersonFields = ({ p, set }: { p: Person; set: (p: Person) => void }) => (
  <>
    <Row>
      <Field label="Full legal name" value={p.name} onChange={(v) => set({ ...p, name: v })} />
      <Field label="Date of birth" type="date" value={p.dob} onChange={(v) => set({ ...p, dob: v })} />
      <Field label="SSN / ITIN (last 4)" value={p.ssnLast4} onChange={(v) => set({ ...p, ssnLast4: v.replace(/\D/g, "").slice(0, 4) })} />
    </Row>
    <Row>
      <Field label="Phone" type="tel" value={p.phone} onChange={(v) => set({ ...p, phone: v })} />
      <Field label="Email" type="email" value={p.email} onChange={(v) => set({ ...p, email: v })} />
      <Field label="Driver's license / ID # and state" value={p.idNumber} onChange={(v) => set({ ...p, idNumber: v })} />
    </Row>
  </>
);
const ResidenceFields = ({ r, set, prev }: { r: Residence; set: (r: Residence) => void; prev?: boolean }) => (
  <>
    <Row><Field label={prev ? "Street address, City / State / ZIP" : "Street address, City / State / ZIP"} value={r.address} onChange={(v) => set({ ...r, address: v })} /></Row>
    <Row>
      <Field label={prev ? "Dates (from – to)" : "Move-in date"} value={r.moveIn} onChange={(v) => set({ ...r, moveIn: v })} />
      <Field label="Monthly payment" value={r.payment} onChange={(v) => set({ ...r, payment: v })} />
      <div style={{ flex: 1, minWidth: 140 }}>
        <span style={{ display: "block", fontSize: 12, color: GRAY, marginBottom: 8 }}>Rent or own</span>
        <Radio name={prev ? "prevRO" : "curRO"} value="rent" current={r.rentOrOwn} onChange={(v) => set({ ...r, rentOrOwn: v as "rent" })} label="Rent" />
        <Radio name={prev ? "prevRO" : "curRO"} value="own" current={r.rentOrOwn} onChange={(v) => set({ ...r, rentOrOwn: v as "own" })} label="Own" />
      </div>
    </Row>
    {!prev && <Row><Field label="Reason for leaving" value={r.reason} onChange={(v) => set({ ...r, reason: v })} /></Row>}
    <Row>
      <Field label="Landlord / mortgage company" value={r.landlord} onChange={(v) => set({ ...r, landlord: v })} />
      <Field label="Landlord phone" type="tel" value={r.landlordPhone} onChange={(v) => set({ ...r, landlordPhone: v })} />
      <Field label="Landlord email" type="email" value={r.landlordEmail} onChange={(v) => set({ ...r, landlordEmail: v })} />
    </Row>
  </>
);
const JobFields = ({ j, set, id }: { j: Job; set: (j: Job) => void; id: string }) => (
  <>
    <Row>
      <Field label="Employer" value={j.employer} onChange={(v) => set({ ...j, employer: v })} />
      <Field label="Position" value={j.position} onChange={(v) => set({ ...j, position: v })} />
      <Field label="Start date" value={j.start} onChange={(v) => set({ ...j, start: v })} />
    </Row>
    <Row>
      <Field label="Supervisor name & phone" value={j.supervisor} onChange={(v) => set({ ...j, supervisor: v })} />
      <Field label="Gross monthly income ($)" value={j.income} onChange={(v) => set({ ...j, income: v })} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <span style={{ display: "block", fontSize: 12, color: GRAY, marginBottom: 8 }}>Type</span>
        <Radio name={id} value="full" current={j.type} onChange={(v) => set({ ...j, type: v as "full" })} label="Full-time" />
        <Radio name={id} value="part" current={j.type} onChange={(v) => set({ ...j, type: v as "part" })} label="Part-time" />
        <Radio name={id} value="self" current={j.type} onChange={(v) => set({ ...j, type: v as "self" })} label="Self-employed" />
      </div>
    </Row>
  </>
);

/* ---------- main component ---------- */
interface Props {
  initial?: Application;
  lots?: Array<{ id: number; label?: string }>;   // available lots for the dropdown
  onSubmit: (app: Application) => Promise<void> | void;
  onSaveDraft?: (app: Application) => Promise<void> | void;
}

export default function HtmRentalApplication({ initial, lots, onSubmit, onSaveDraft }: Props) {
  const [app, setApp] = useState<Application>(initial ?? emptyApplication());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const up = <K extends keyof Application>(k: K, v: Application[K]) => setApp((a) => ({ ...a, [k]: v }));

  const adults = 1 + (app.coApplicant.name ? 1 : 0) + app.occupants.filter((o) => Number(o.age) >= 18).length;
  const fee = adults * 25;
  const petDeposit = app.pets.length * 50, petRent = app.pets.length * 25;
  const income = Number(app.job.income || 0) + Number(app.coJob.income || 0) + app.otherIncome.reduce((s, i) => s + Number(i.amount || 0), 0);

  const validate = (): string | null => {
    if (!app.applyingFor) return "Select what you're applying for.";
    if (!app.applicant.name || !app.applicant.phone) return "Applicant name and phone are required.";
    if (!app.applicant.dob) return "Applicant date of birth is required.";
    if (!app.current.address) return "Current address is required.";
    if (!app.job.employer && app.otherIncome.length === 0) return "Add employment or another income source.";
    if (!app.emergency.name || !app.emergency.phone) return "Emergency contact is required.";
    if (Object.values(app.background).some((v) => v === null)) return "Answer every background question.";
    if (!app.certify || !app.signature) return "Check the certification box and type your name to sign.";
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { setError(err); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setError(null); setBusy(true);
    try { await onSubmit({ ...app, signDate: new Date().toISOString() }); setDone(true); }
    catch (e: any) { setError(e?.message || "Could not submit. Try again."); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "inherit", color: NAVY, textAlign: "center" }}>
      <h2 style={{ fontSize: 22 }}>Thank you, {app.applicant.name.split(" ")[0]}!</h2>
      <p style={{ color: GRAY }}>Your application for Hometown Meadows has been received. We'll review it within 2–3 business days and call you at {app.applicant.phone}. Your ${fee} application fee is due at the community office.</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 14px 40px", fontFamily: "inherit", color: NAVY }}>
      <header style={{ borderBottom: `3px solid ${CORAL}`, paddingBottom: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 24, fontWeight: 700 }}>HOMETOWN MEADOWS</div>
        <div style={{ fontSize: 14, color: CORAL }}>A Family Community · Nashville, Arkansas</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: "12px 0 4px" }}>Application for Residency</h2>
        <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>Each adult 18+ who will live in the home must submit their own application. $25 non-refundable fee per adult.</p>
      </header>

      {error && <div role="alert" style={{ background: "#FBDDD3", border: `1px solid ${CORAL}`, color: "#8A2E14", padding: "10px 12px", borderRadius: 8, marginBottom: 14, fontSize: 14 }}>{error}</div>}

      <Row>
        <Field label="Date" type="date" value={app.date} onChange={(v) => up("date", v)} />
        <label style={{ display: "block", flex: 1, minWidth: 140 }}>
          <span style={{ display: "block", fontSize: 12, color: GRAY, marginBottom: 4 }}>Home / Lot #</span>
          {lots ? (
            <select style={inputStyle} value={app.lot} onChange={(e) => up("lot", e.target.value)}>
              <option value="">Any available</option>
              {lots.map((l) => <option key={l.id} value={String(l.id)}>Lot {l.id}{l.label ? ` — ${l.label}` : ""}</option>)}
            </select>
          ) : <input style={inputStyle} value={app.lot} onChange={(e) => up("lot", e.target.value)} />}
        </label>
        <Field label="Requested move-in date" type="date" value={app.moveIn} onChange={(v) => up("moveIn", v)} />
      </Row>
      <div style={{ marginBottom: 18 }}>
        <span style={{ fontSize: 14, fontWeight: 600, marginRight: 10 }}>I am applying to:</span>
        <Radio name="af" value="community_home" current={app.applyingFor} onChange={(v) => up("applyingFor", v as ApplyingFor)} label="Rent a community-owned home" />
        <Radio name="af" value="lot_only" current={app.applyingFor} onChange={(v) => up("applyingFor", v as ApplyingFor)} label="Rent a lot for my own home" />
        <Radio name="af" value="rent_to_own" current={app.applyingFor} onChange={(v) => up("applyingFor", v as ApplyingFor)} label="Rent-to-own" />
      </div>

      <Section n={1} title="Applicant"><PersonFields p={app.applicant} set={(p) => up("applicant", p)} /></Section>

      <Section n={2} title="Co-Applicant" hint="Leave blank if applying alone.">
        <PersonFields p={app.coApplicant} set={(p) => up("coApplicant", p)} />
        <Row><Field label="Relationship to applicant" value={app.coRelationship} onChange={(v) => up("coRelationship", v)} /></Row>
      </Section>

      <Section n={3} title="Everyone who will live in the home" hint="List all other occupants, including children.">
        {app.occupants.map((o, i) => (
          <Row key={i}>
            <Field label="Full name" value={o.name} onChange={(v) => up("occupants", app.occupants.map((x, j) => j === i ? { ...x, name: v } : x))} />
            <Field label="Relationship" value={o.relationship} onChange={(v) => up("occupants", app.occupants.map((x, j) => j === i ? { ...x, relationship: v } : x))} />
            <Field label="Age" value={o.age} onChange={(v) => up("occupants", app.occupants.map((x, j) => j === i ? { ...x, age: v } : x))} />
            <RemoveBtn onClick={() => up("occupants", app.occupants.filter((_, j) => j !== i))} />
          </Row>
        ))}
        <AddBtn label="Add occupant" onClick={() => up("occupants", [...app.occupants, { name: "", relationship: "", age: "", adultApplied: false }])} />
      </Section>

      <Section n={4} title="Current address"><ResidenceFields r={app.current} set={(r) => up("current", r)} /></Section>
      <Section n={5} title="Previous address" hint="If less than 3 years at your current address."><ResidenceFields prev r={app.previous} set={(r) => up("previous", r)} /></Section>

      <Section n={6} title="Employment & income" hint="Proof required: two recent pay stubs, a benefit award letter, or three months of bank statements.">
        <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>Applicant</p>
        <JobFields id="j1" j={app.job} set={(j) => up("job", j)} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>Co-applicant</p>
        <JobFields id="j2" j={app.coJob} set={(j) => up("coJob", j)} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: "8px 0" }}>Other income (SSI, SSDI, child support, retirement, VA, housing assistance)</p>
        {app.otherIncome.map((o, i) => (
          <Row key={i}>
            <Field label="Source" value={o.source} onChange={(v) => up("otherIncome", app.otherIncome.map((x, j) => j === i ? { ...x, source: v } : x))} />
            <Field label="Monthly amount ($)" value={o.amount} onChange={(v) => up("otherIncome", app.otherIncome.map((x, j) => j === i ? { ...x, amount: v } : x))} />
            <Field label="Recipient" value={o.recipient} onChange={(v) => up("otherIncome", app.otherIncome.map((x, j) => j === i ? { ...x, recipient: v } : x))} />
            <RemoveBtn onClick={() => up("otherIncome", app.otherIncome.filter((_, j) => j !== i))} />
          </Row>
        ))}
        <AddBtn label="Add income source" onClick={() => up("otherIncome", [...app.otherIncome, { source: "", amount: "", recipient: "" }])} />
        {income > 0 && <p style={{ fontSize: 13, color: GRAY, marginTop: 10 }}>Total monthly household income: <b style={{ color: NAVY }}>${income.toLocaleString()}</b> · supports rent up to about ${Math.floor(income / 3).toLocaleString()}/mo</p>}
      </Section>

      <Section n={7} title="Vehicles" hint="All vehicles kept in the community must be registered, insured, and operable.">
        {app.vehicles.map((v, i) => (
          <Row key={i}>
            <Field label="Year / Make / Model" value={v.ymm} onChange={(x) => up("vehicles", app.vehicles.map((y, j) => j === i ? { ...y, ymm: x } : y))} />
            <Field label="Color" value={v.color} onChange={(x) => up("vehicles", app.vehicles.map((y, j) => j === i ? { ...y, color: x } : y))} />
            <Field label="Plate # / State" value={v.plate} onChange={(x) => up("vehicles", app.vehicles.map((y, j) => j === i ? { ...y, plate: x } : y))} />
            <RemoveBtn onClick={() => up("vehicles", app.vehicles.filter((_, j) => j !== i))} />
          </Row>
        ))}
        <AddBtn label="Add vehicle" onClick={() => up("vehicles", [...app.vehicles, { ymm: "", color: "", plate: "", owner: "" }])} />
      </Section>

      <Section n={8} title="Pets" hint="Pets require written approval before move-in. $50 deposit and $25/month pet rent per pet.">
        {app.pets.map((p, i) => (
          <Row key={i}>
            <Field label="Type / Breed" value={p.type} onChange={(x) => up("pets", app.pets.map((y, j) => j === i ? { ...y, type: x } : y))} />
            <Field label="Name" value={p.name} onChange={(x) => up("pets", app.pets.map((y, j) => j === i ? { ...y, name: x } : y))} />
            <Field label="Weight (lb)" value={p.weight} onChange={(x) => up("pets", app.pets.map((y, j) => j === i ? { ...y, weight: x } : y))} />
            <label style={{ alignSelf: "flex-end", fontSize: 13, whiteSpace: "nowrap", paddingBottom: 10 }}><input type="checkbox" checked={p.fixed} onChange={(e) => up("pets", app.pets.map((y, j) => j === i ? { ...y, fixed: e.target.checked } : y))} /> Spayed/neutered</label>
            <RemoveBtn onClick={() => up("pets", app.pets.filter((_, j) => j !== i))} />
          </Row>
        ))}
        <AddBtn label="Add pet" onClick={() => up("pets", [...app.pets, { type: "", name: "", weight: "", age: "", fixed: false }])} />
        {app.pets.length > 0 && <p style={{ fontSize: 13, color: GRAY, marginTop: 10 }}>{app.pets.length} pet{app.pets.length > 1 ? "s" : ""}: <b style={{ color: NAVY }}>${petDeposit}</b> deposit + <b style={{ color: NAVY }}>${petRent}/mo</b> pet rent</p>}
      </Section>

      {app.applyingFor !== "community_home" && (
        <Section n={9} title="Your home" hint="If bringing or buying your own manufactured home.">
          <Row>
            <Field label="Year / Make / Model" value={app.ownHome.ymm} onChange={(v) => up("ownHome", { ...app.ownHome, ymm: v })} />
            <Field label="Size (e.g., 14×70)" value={app.ownHome.size} onChange={(v) => up("ownHome", { ...app.ownHome, size: v })} />
            <Field label="Serial / VIN #" value={app.ownHome.serial} onChange={(v) => up("ownHome", { ...app.ownHome, serial: v })} />
          </Row>
          <Row>
            <Field label="Lienholder (if financed)" value={app.ownHome.lienholder} onChange={(v) => up("ownHome", { ...app.ownHome, lienholder: v })} />
            <div style={{ flex: 1, minWidth: 180 }}><span style={{ display: "block", fontSize: 12, color: GRAY, marginBottom: 8 }}>Titled in your name?</span><YesNo value={app.ownHome.titled} onChange={(v) => up("ownHome", { ...app.ownHome, titled: v })} /></div>
          </Row>
          <Row>
            <Field label="Transport / set-up company" value={app.ownHome.transport} onChange={(v) => up("ownHome", { ...app.ownHome, transport: v })} />
            <Field label="Insurance carrier" value={app.ownHome.insurance} onChange={(v) => up("ownHome", { ...app.ownHome, insurance: v })} />
          </Row>
        </Section>
      )}

      <Section n={10} title="Background" hint="A “yes” does not automatically disqualify you. Please explain so we can review fairly.">
        {BACKGROUND_QS.map(([k, q]) => (
          <div key={k} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10, fontSize: 14 }}>
            <YesNo value={app.background[k]} onChange={(v) => up("background", { ...app.background, [k]: v })} />
            <span>{q}</span>
          </div>
        ))}
        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: 12, color: GRAY, marginBottom: 4 }}>Explanation (if any)</span>
          <textarea style={{ ...inputStyle, minHeight: 70 }} value={app.backgroundNote} onChange={(e) => up("backgroundNote", e.target.value)} />
        </label>
      </Section>

      <Section n={11} title="References & emergency contact">
        {app.references.map((r, i) => (
          <Row key={i}>
            <Field label="Reference name" value={r.name} onChange={(v) => up("references", app.references.map((x, j) => j === i ? { ...x, name: v } : x))} />
            <Field label="Relationship" value={r.relationship} onChange={(v) => up("references", app.references.map((x, j) => j === i ? { ...x, relationship: v } : x))} />
            <Field label="Phone" type="tel" value={r.phone} onChange={(v) => up("references", app.references.map((x, j) => j === i ? { ...x, phone: v } : x))} />
            {app.references.length > 1 && <RemoveBtn onClick={() => up("references", app.references.filter((_, j) => j !== i))} />}
          </Row>
        ))}
        <AddBtn label="Add reference" onClick={() => up("references", [...app.references, { name: "", relationship: "", phone: "" }])} />
        <p style={{ fontSize: 14, fontWeight: 600, margin: "14px 0 8px" }}>Emergency contact (someone not living with you)</p>
        <Row>
          <Field label="Name" value={app.emergency.name} onChange={(v) => up("emergency", { ...app.emergency, name: v })} />
          <Field label="Relationship" value={app.emergency.relationship} onChange={(v) => up("emergency", { ...app.emergency, relationship: v })} />
          <Field label="Phone" type="tel" value={app.emergency.phone} onChange={(v) => up("emergency", { ...app.emergency, phone: v })} />
        </Row>
      </Section>

      <Section n={12} title="How did you hear about us?">
        {["Facebook", "Drove by", "Current resident", "Zillow / online", "Other"].map((s) => (
          <Radio key={s} name="src" value={s} current={app.source} onChange={(v) => up("source", v)} label={s} />
        ))}
        {(app.source === "Current resident" || app.source === "Other") && <Row><Field label={app.source === "Other" ? "Please specify" : "Resident's name"} value={app.sourceOther} onChange={(v) => up("sourceOther", v)} /></Row>}
      </Section>

      <Section n={13} title="Authorization & agreement">
        <ul style={{ fontSize: 13, color: NAVY, paddingLeft: 18, margin: "0 0 12px", lineHeight: 1.5 }}>
          <li>Everything in this application is true and complete. False or missing information is grounds for denial or termination of residency.</li>
          <li>I authorize Hometown Meadows and its agents to obtain my consumer credit report, criminal background, eviction history, and to verify my employment, income, and rental history.</li>
          <li>The non-refundable application fee is $25 per adult applicant (<b>${fee}</b> for this application).</li>
          <li>Approval is based on income (generally 3× monthly rent), rental history, background, and credit. Hometown Meadows does not discriminate on the basis of race, color, religion, sex, national origin, familial status, disability, or any other protected class.</li>
          <li>A home is reserved only when a deposit is paid and a residency agreement is signed.</li>
        </ul>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, marginBottom: 12 }}>
          <input type="checkbox" checked={app.certify} onChange={(e) => up("certify", e.target.checked)} style={{ marginTop: 3 }} />
          <span>I have read and agree to the above.</span>
        </label>
        <Row>
          <Field label="Applicant — type full name to sign" value={app.signature} onChange={(v) => up("signature", v)} />
          <Field label="Co-applicant — type full name to sign" value={app.coSignature} onChange={(v) => up("coSignature", v)} />
        </Row>
      </Section>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", background: BG, padding: 12, borderRadius: 10 }}>
        {onSaveDraft && <button type="button" disabled={busy} onClick={() => onSaveDraft(app)} style={{ fontSize: 14, padding: "10px 16px", border: `1px solid ${LINE}`, borderRadius: 8, background: "#fff", color: NAVY, cursor: "pointer" }}>Save draft</button>}
        <button type="button" disabled={busy} onClick={submit} style={{ fontSize: 14, fontWeight: 600, padding: "10px 18px", border: "none", borderRadius: 8, background: CORAL, color: "#fff", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Submitting…" : "Submit application"}</button>
      </div>
      <p style={{ fontSize: 12, color: GRAY, textAlign: "center", marginTop: 14 }}>Questions? Call the community office at (870) 557-5751.</p>
    </div>
  );
}
