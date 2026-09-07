import { useMemo, useState } from "react";

/**
 * HtmJobs — Zo's work-order board for the Able OS cockpit (/zo → Jobs tab).
 *
 * Ports the "Jobs" mockup screen: priority-sorted card list, tap a card to
 * expand, close-out fields (what did you fix / parts cost / hours / photo),
 * required photo before a job can be marked Completed, "+" to open a new job.
 *
 * No deps beyond React. Data in via `jobs`; changes out via callbacks so Dane
 * wires them to the existing work_orders schema. Palette values are the
 * mockup's — swap for cockpit tokens.
 */

export type Priority = "emergency" | "urgent" | "routine";
export type JobStatus = "new" | "assigned" | "in_progress" | "completed";
export type Category = "plumbing" | "electrical" | "hvac" | "roof" | "appliance" | "grounds" | "other";

export interface Job {
  id: string;
  lot: number;
  title: string;
  resident?: string;
  category: Category;
  priority: Priority;
  status: JobStatus;
  openedAt: string;          // ISO
  note?: string;             // resident's description
  assignedTo?: string;
  closeout?: { fix: string; partsCost: number; hours: number; photoUrl?: string; completedAt?: string };
}

export interface NewJobInput { lot: number; title: string; resident?: string; category: Category; priority: Priority; note?: string }

interface Props {
  jobs: Job[];
  onCreate: (j: NewJobInput) => Promise<void> | void;
  onSaveCloseout: (id: string, c: Job["closeout"]) => Promise<void> | void;
  onComplete: (id: string) => Promise<void> | void;
  onUploadPhoto: (id: string, file: File) => Promise<string>;   // returns stored URL
  onAssign?: (id: string, who: string) => Promise<void> | void;
  lots?: number[];
}

const C = {
  navy: "#1E2A44", rust: "#9A3B1F", rustLight: "#B8552E", cream: "#F4EEDF", card: "#EFE6D0",
  ink: "#2B2B2B", muted: "#6B6558", line: "#D9CFB8", white: "#FFFFFF", amber: "#C7862C",
};
const PRIO: Record<Priority, { label: string; bg: string }> = {
  emergency: { label: "EMERGENCY", bg: C.rust },
  urgent: { label: "URGENT", bg: C.rustLight },
  routine: { label: "ROUTINE", bg: C.muted },
};
const STATUS: Record<JobStatus, string> = { new: "New", assigned: "Assigned", in_progress: "In progress", completed: "Completed" };
const CAT: Record<Category, string> = { plumbing: "Plumbing", electrical: "Electrical", hvac: "Heat / AC", roof: "Roof", appliance: "Appliance", grounds: "Grounds", other: "Other" };
const rank: Record<Priority, number> = { emergency: 0, urgent: 1, routine: 2 };

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "14px 12px", fontSize: 16, border: `1px solid ${C.line}`, borderRadius: 12, background: C.white, color: C.ink, fontFamily: "inherit" };
const label: React.CSSProperties = { display: "block", fontWeight: 600, fontSize: 15, margin: "14px 0 6px", color: C.ink };
const Badge = ({ p }: { p: Priority }) => (
  <span style={{ background: PRIO[p].bg, color: C.white, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{PRIO[p].label}</span>
);

export default function HtmJobs({ jobs, onCreate, onSaveCloseout, onComplete, onUploadPhoto, lots }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Record<string, Partial<NonNullable<Job["closeout"]>>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(
    () => jobs.filter((j) => showDone || j.status !== "completed").sort((a, b) => rank[a.priority] - rank[b.priority] || +new Date(a.openedAt) - +new Date(b.openedAt)),
    [jobs, showDone]
  );
  const openCount = jobs.filter((j) => j.status !== "completed").length;

  const d = (id: string) => draft[id] ?? jobs.find((j) => j.id === id)?.closeout ?? {};
  const setD = (id: string, patch: Partial<NonNullable<Job["closeout"]>>) => setDraft((s) => ({ ...s, [id]: { ...d(id), ...patch } }));

  const save = async (id: string) => {
    const c = d(id);
    setBusy(id); setErr(null);
    try { await onSaveCloseout(id, { fix: c.fix ?? "", partsCost: Number(c.partsCost ?? 0), hours: Number(c.hours ?? 0), photoUrl: c.photoUrl }); }
    catch (e: any) { setErr(e?.message || "Couldn't save."); } finally { setBusy(null); }
  };
  const complete = async (id: string) => {
    const c = d(id);
    if (!c.fix) return setErr("Say what you fixed — a sentence is enough.");
    if (!c.photoUrl) return setErr("Add a photo of the finished work before marking it done.");
    setBusy(id); setErr(null);
    try { await save(id); await onComplete(id); setOpen(null); }
    catch (e: any) { setErr(e?.message || "Couldn't complete."); } finally { setBusy(null); }
  };
  const photo = async (id: string, f?: File) => {
    if (!f) return;
    setBusy(id); setErr(null);
    try { const url = await onUploadPhoto(id, f); setD(id, { photoUrl: url }); }
    catch (e: any) { setErr(e?.message || "Photo didn't upload."); } finally { setBusy(null); }
  };

  return (
    <div style={{ background: C.cream, minHeight: "100%", fontFamily: "inherit", color: C.ink, position: "relative", paddingBottom: 96 }}>
      <header style={{ background: C.navy, color: C.white, padding: "14px 18px 12px" }}>
        <div style={{ fontSize: 11, letterSpacing: 1.5, opacity: 0.8 }}>ZO · HOMETOWN MEADOWS</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "2px 0 0" }}>Jobs</h1>
          <span style={{ fontSize: 13, opacity: 0.85 }}>{openCount} open</span>
        </div>
      </header>

      {err && <div role="alert" style={{ margin: "12px 16px 0", background: "#F6D9CE", color: C.rust, padding: "10px 12px", borderRadius: 10, fontSize: 14 }}>{err}</div>}

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {list.length === 0 && <p style={{ textAlign: "center", color: C.muted, marginTop: 40 }}>No open jobs. Nice.</p>}
        {list.map((j) => {
          const isOpen = open === j.id;
          const c = d(j.id);
          const done = j.status === "completed";
          return (
            <article key={j.id} style={{ background: C.card, borderRadius: 14, borderLeft: `5px solid ${done ? C.muted : PRIO[j.priority].bg}`, overflow: "hidden", opacity: done ? 0.7 : 1 }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : j.id)} aria-expanded={isOpen} style={{ all: "unset", display: "block", width: "100%", boxSizing: "border-box", padding: "16px 18px 14px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>Lot {j.lot} — {j.title}</div>
                  {!done && <Badge p={j.priority} />}
                </div>
                <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>
                  {j.resident ? `${j.resident} · ` : ""}{CAT[j.category]} · {STATUS[j.status]}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                  Opened {ago(j.openedAt)}{j.assignedTo ? ` · ${j.assignedTo} assigned` : ""}
                </div>
              </button>

              {isOpen && !done && (
                <div style={{ borderTop: `1px solid ${C.line}`, padding: "12px 18px 18px" }}>
                  {j.note && <p style={{ fontSize: 14, color: C.ink, margin: "4px 0 6px", lineHeight: 1.45 }}>{j.note}</p>}

                  <label style={label}>What did you fix?</label>
                  <textarea style={{ ...field, minHeight: 84 }} placeholder="A sentence is enough" value={c.fix ?? ""} onChange={(e) => setD(j.id, { fix: e.target.value })} />

                  <label style={label}>What did parts cost?</label>
                  <input style={field} type="number" inputMode="decimal" min={0} step="0.01" placeholder="$0.00" value={c.partsCost ?? ""} onChange={(e) => setD(j.id, { partsCost: e.target.value === "" ? undefined : Number(e.target.value) })} />

                  <label style={label}>How many hours?</label>
                  <input style={field} type="number" inputMode="decimal" min={0} step="0.25" placeholder="0.0" value={c.hours ?? ""} onChange={(e) => setD(j.id, { hours: e.target.value === "" ? undefined : Number(e.target.value) })} />

                  <label style={label}>Photo of the finished work <span style={{ color: C.rust }}>*</span></label>
                  <label style={{ ...field, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                    <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => photo(j.id, e.target.files?.[0])} />
                    {c.photoUrl ? <img src={c.photoUrl} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} /> : <span style={{ fontSize: 28 }}>📷</span>}
                    <span style={{ color: c.photoUrl ? C.ink : C.muted }}>{c.photoUrl ? "Photo attached — tap to replace" : "Take a photo"}</span>
                  </label>

                  <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                    <button type="button" disabled={busy === j.id} onClick={() => save(j.id)} style={{ flex: 1, padding: 14, fontSize: 15, fontWeight: 600, borderRadius: 12, border: `1px solid ${C.line}`, background: C.white, color: C.ink }}>Save for later</button>
                    <button type="button" disabled={busy === j.id} onClick={() => complete(j.id)} style={{ flex: 1, padding: 14, fontSize: 15, fontWeight: 700, borderRadius: 12, border: "none", background: C.rust, color: C.white, opacity: busy === j.id ? 0.6 : 1 }}>Mark done ✓</button>
                  </div>
                </div>
              )}
              {isOpen && done && j.closeout && (
                <div style={{ borderTop: `1px solid ${C.line}`, padding: "12px 18px 16px", fontSize: 14, color: C.muted }}>
                  <div><b style={{ color: C.ink }}>Fixed:</b> {j.closeout.fix}</div>
                  <div>Parts ${j.closeout.partsCost.toFixed(2)} · {j.closeout.hours} hr{j.closeout.completedAt ? ` · closed ${ago(j.closeout.completedAt)}` : ""}</div>
                  {j.closeout.photoUrl && <img src={j.closeout.photoUrl} alt="" style={{ marginTop: 8, width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10 }} />}
                </div>
              )}
            </article>
          );
        })}
        <button type="button" onClick={() => setShowDone((s) => !s)} style={{ all: "unset", cursor: "pointer", textAlign: "center", fontSize: 13, color: C.muted, padding: 10, textDecoration: "underline" }}>
          {showDone ? "Hide completed" : `Show completed (${jobs.length - openCount})`}
        </button>
      </div>

      <button type="button" aria-label="New job" onClick={() => setCreating(true)} style={{ position: "fixed", right: 20, bottom: 96, width: 60, height: 60, borderRadius: "50%", background: C.rust, color: C.white, fontSize: 32, lineHeight: "60px", border: "none", boxShadow: "0 6px 16px rgba(0,0,0,.25)", cursor: "pointer" }}>+</button>

      {creating && <NewJobSheet lots={lots} onClose={() => setCreating(false)} onCreate={async (j) => { await onCreate(j); setCreating(false); }} />}
    </div>
  );
}

function NewJobSheet({ lots, onClose, onCreate }: { lots?: number[]; onClose: () => void; onCreate: (j: NewJobInput) => Promise<void> | void }) {
  const [j, setJ] = useState<NewJobInput>({ lot: lots?.[0] ?? 1, title: "", category: "plumbing", priority: "routine", resident: "", note: "" });
  const [busy, setBusy] = useState(false);
  const ok = j.title.trim().length > 2 && j.lot > 0;
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(30,42,68,.55)", display: "flex", alignItems: "flex-end", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.cream, width: "100%", borderRadius: "20px 20px 0 0", padding: "18px 18px 28px", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>New job</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ all: "unset", fontSize: 22, padding: 6, cursor: "pointer", color: C.muted }}>✕</button>
        </div>

        <label style={label}>Which lot?</label>
        {lots ? (
          <select style={field} value={j.lot} onChange={(e) => setJ({ ...j, lot: Number(e.target.value) })}>{lots.map((l) => <option key={l} value={l}>Lot {l}</option>)}</select>
        ) : <input style={field} type="number" inputMode="numeric" value={j.lot} onChange={(e) => setJ({ ...j, lot: Number(e.target.value) })} />}

        <label style={label}>What's wrong?</label>
        <input style={field} placeholder="No hot water" value={j.title} onChange={(e) => setJ({ ...j, title: e.target.value })} />

        <label style={label}>Resident (optional)</label>
        <input style={field} placeholder="Name" value={j.resident} onChange={(e) => setJ({ ...j, resident: e.target.value })} />

        <label style={label}>Type</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(Object.keys(CAT) as Category[]).map((k) => (
            <button key={k} type="button" onClick={() => setJ({ ...j, category: k })} style={{ padding: "10px 14px", borderRadius: 999, fontSize: 14, border: `1px solid ${j.category === k ? C.navy : C.line}`, background: j.category === k ? C.navy : C.white, color: j.category === k ? C.white : C.ink }}>{CAT[k]}</button>
          ))}
        </div>

        <label style={label}>How urgent?</label>
        <div style={{ display: "flex", gap: 8 }}>
          {(["emergency", "urgent", "routine"] as Priority[]).map((p) => (
            <button key={p} type="button" onClick={() => setJ({ ...j, priority: p })} style={{ flex: 1, padding: "12px 6px", borderRadius: 12, fontSize: 13, fontWeight: 700, letterSpacing: 0.4, border: `2px solid ${j.priority === p ? PRIO[p].bg : C.line}`, background: j.priority === p ? PRIO[p].bg : C.white, color: j.priority === p ? C.white : C.ink }}>{PRIO[p].label}</button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0" }}>Emergency = no water, no heat in winter, sewage, fire or electrical hazard. Emergency and Urgent send Zo a push notification.</p>

        <label style={label}>Details (optional)</label>
        <textarea style={{ ...field, minHeight: 80 }} placeholder="Anything the person fixing it should know" value={j.note} onChange={(e) => setJ({ ...j, note: e.target.value })} />

        <button type="button" disabled={!ok || busy} onClick={async () => { setBusy(true); try { await onCreate(j); } finally { setBusy(false); } }} style={{ width: "100%", marginTop: 20, padding: 16, fontSize: 16, fontWeight: 700, borderRadius: 12, border: "none", background: ok ? C.rust : C.line, color: C.white }}>
          {busy ? "Opening…" : "Open job"}
        </button>
      </div>
    </div>
  );
}
