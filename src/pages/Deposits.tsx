// src/pages/Deposits.tsx
// Security deposits (T-25). One screen, three doors:
//   /zo/deposits      Zo - Hometown Meadows (AR_18-16)
//   /ellery/deposits  Ellery - AHTX (TX_92 / TX_94)
//   /raj/deposits     Raj (and Dane) - both, plus CSV import and cap overrides
// The server decides who may see and do what, and the legal rules live in
// lib/depositRules.js. This screen only collects facts and shows the clock.

import React from "react";
import { useNavigate } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ZoScreenHeader } from "../components/ZoScreenHeader";
import { ZoTabBar } from "../components/ZoTabBar";
import { ElleryTabBar } from "../components/ElleryTabBar";
import { apiFetch } from "../lib/apiFetch";
import { Btn } from "../features/collections/parts";

type Portfolio = "htm" | "ahtx" | "all";

const inputClass =
  "w-full rounded-[9px] border border-[#D5D8DE] bg-white px-3.5 py-3 text-[16px] text-[#1B2231] focus:border-[#1E3A8A] focus:outline-none";
const labelClass = "mb-1.5 mt-3 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]";

const RULE_NAME: Record<string, string> = {
  "AR_18-16": "Arkansas · 60 days",
  TX_92: "Texas house · 30 days",
  TX_94: "Texas lot · 30 days",
};
const STATUS_WORD: Record<string, string> = {
  held: "Held", due: "Refund due", refunded: "Refunded", applied: "Applied to balance",
  partly_refunded: "Partly refunded", returned_mail: "Notice came back",
};

async function json(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Something went wrong");
  return body;
}
function money(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-";
}
function day(iso?: string | null) {
  if (!iso) return "";
  return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

type Sheet =
  | { kind: "record" }
  | { kind: "moveout" | "deduct" | "mail" | "close"; dep: any }
  | { kind: "returned"; dep: any; mail: any }
  | { kind: "import" }
  | null;

export function Deposits({ portfolio }: { portfolio: Portfolio }) {
  const navigate = useNavigate();
  const [data, setData] = React.useState<{ today: string; deposits: any[]; options?: any } | null>(null);
  const [problem, setProblem] = React.useState("");
  const [note, setNote] = React.useState("");
  const [sheet, setSheet] = React.useState<Sheet>(null);
  const [showClosed, setShowClosed] = React.useState(false);

  const load = React.useCallback(() => {
    apiFetch("/api/deposits")
      .then(json)
      .then((b) => { setData(b); setProblem(""); })
      .catch((e) => setProblem(e.message));
  }, []);
  React.useEffect(load, [load]);

  const all = (data?.deposits ?? []).filter((d) => portfolio === "all" || d.portfolio === portfolio);
  const open = all.filter((d) => !d.closed_on);
  const closed = all.filter((d) => d.closed_on);
  const rank = (d: any) =>
    d.clock?.state === "overdue" ? 0 : d.clock?.state === "due_soon" ? 1 : d.clock?.state === "returned_mail" ? 2 : d.clock?.due_on ? 3 : 4;
  open.sort((a, b) => rank(a) - rank(b) || String(a.clock?.due_on ?? "9999").localeCompare(String(b.clock?.due_on ?? "9999")));
  const overdue = open.filter((d) => d.clock?.state === "overdue").length;
  const dueSoon = open.filter((d) => d.clock?.state === "due_soon").length;

  const title = portfolio === "htm" ? "Hometown Meadows" : portfolio === "ahtx" ? "Able Housing Texas" : "All portfolios";
  const done = (msg: string) => { setSheet(null); setNote(msg); load(); };

  return (
    <MobileScreenShell
      headerContent={
        <ZoScreenHeader
          eyebrow={title}
          stat={data ? `${open.length} open${overdue ? ` · ${overdue} overdue` : ""}${dueSoon ? ` · ${dueSoon} due soon` : ""}` : undefined}
          subtitle="Security deposits and their legal refund deadlines."
          title="Deposits"
        />
      }
    >
      <div className="pb-28 pt-4">
        {problem && (
          <div className="mb-4 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[15px] text-[#B91C1C]" onClick={() => setProblem("")}>{problem}</div>
        )}
        {note && (
          <div className="mb-4 rounded-xl bg-[#E7F6EE] px-4 py-3 text-[15px] text-[#14532D]" onClick={() => setNote("")}>{note}</div>
        )}

        <div className="mb-4 flex flex-wrap gap-2.5">
          <Btn onClick={() => setSheet({ kind: "record" })} variant="navy">Take a deposit</Btn>
          {portfolio === "all" && <Btn onClick={() => setSheet({ kind: "import" })}>Import existing (CSV)</Btn>}
          {portfolio === "all" && <Btn onClick={() => navigate(-1)}>Back</Btn>}
        </div>

        {!data && !problem && <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[15px] text-[#6C7484]">Loading…</div>}

        {data && open.length === 0 && (
          <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[15px] text-[#6C7484]">
            No deposits on file yet. Use "Take a deposit" when a resident pays one{portfolio === "all" ? ", or import the existing list" : ""}.
          </div>
        )}

        {open.map((d) => <DepositCard d={d} key={d.id} onAct={setSheet} showWhere={portfolio === "all"} />)}

        {closed.length > 0 && (
          <div className="mt-6">
            <button className="text-[14px] font-semibold text-[#1E3A8A]" onClick={() => setShowClosed(!showClosed)} type="button">
              {showClosed ? "Hide" : "Show"} closed in the last 90 days ({closed.length})
            </button>
            {showClosed && closed.map((d) => <DepositCard d={d} key={d.id} onAct={setSheet} showWhere={portfolio === "all"} />)}
          </div>
        )}

        <p className="mt-6 text-[12.5px] leading-relaxed text-[#8A929E]">
          Deposits are kept apart from rent: they never show in balances, late fees or QuickBooks. Refund deadlines are worked out from the
          law that applies to each deposit. Research by counsel, reviewed before go-live.
        </p>
      </div>

      {sheet && (
        <ActionSheet
          data={data}
          onCancel={() => setSheet(null)}
          onDone={done}
          portfolio={portfolio}
          sheet={sheet}
        />
      )}

      {portfolio === "htm" && <ZoTabBar />}
      {portfolio === "ahtx" && <ElleryTabBar />}
    </MobileScreenShell>
  );
}

function DepositCard({ d, onAct, showWhere }: { d: any; onAct: (s: Sheet) => void; showWhere: boolean }) {
  const c = d.clock ?? {};
  const late = c.state === "overdue";
  const soon = c.state === "due_soon";
  return (
    <div className={`mb-3 rounded-2xl border bg-white p-4 ${late ? "border-[#FCA5A5]" : "border-[#DCE4EE]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-bold tracking-[-0.01em]">
            {d.where}{showWhere ? ` · ${d.portfolio.toUpperCase()}` : ""}
          </div>
          <div className="mt-0.5 text-[13px] text-[#6C7484]">
            {RULE_NAME[d.jurisdiction_rule] ?? d.jurisdiction_rule} · taken {day(d.received_on)}
            {d.source === "csv_import" ? " · imported" : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[17px] font-bold">{money(d.amount)}</div>
          <div className="text-[12.5px] text-[#6C7484]">{STATUS_WORD[d.status] ?? d.status}</div>
        </div>
      </div>

      {!d.closed_on && c.due_on && (
        <div className={`mt-3 rounded-[9px] px-3.5 py-2.5 text-[14px] font-semibold ${late ? "bg-[#FEF2F2] text-[#B91C1C]" : soon ? "bg-[#FEF3C7] text-[#78350F]" : "bg-[#EEF2FF] text-[#1E3A8A]"}`}>
          Refund due {day(c.due_on)} · {late ? `${-c.days_left} days overdue` : c.days_left === 0 ? "today" : `${c.days_left} days left`}
        </div>
      )}
      {!d.closed_on && !c.due_on && (
        <div className="mt-3 text-[13.5px] text-[#6C7484]">Resident still living there - the refund clock starts at move-out.</div>
      )}
      {(c.warnings ?? []).map((w: string) => (
        <div className="mt-2 text-[13px] font-semibold text-[#B45309]" key={w}>{w}</div>
      ))}
      {d.cap_override_note && <div className="mt-2 text-[12.5px] text-[#6C7484]">Over the 2-month cap - approved by {d.cap_override_by}: {d.cap_override_note}</div>}

      {(d.deductions ?? []).length > 0 && (
        <div className="mt-3 border-t border-[#EEF0F3] pt-2.5">
          {d.deductions.map((x: any) => (
            <div className="flex justify-between py-0.5 text-[13.5px]" key={x.id}>
              <span>{x.description} <span className="text-[#8A929E]">({String(x.kind).replace("_", " ")})</span></span>
              <span>{money(x.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1 text-[13.5px] font-semibold">
            <span>Deductions</span><span>{money(d.deductions_total)}</span>
          </div>
          <div className="flex justify-between text-[13.5px] font-semibold">
            <span>Left to refund</span><span>{money(Number(d.amount) - Number(d.deductions_total || 0))}</span>
          </div>
        </div>
      )}

      {(d.mail ?? []).map((m: any) => (
        <div className="mt-2 flex items-center justify-between gap-2 text-[13px] text-[#6C7484]" key={m.id}>
          <span>Mailed {day(m.sent_on)} · {String(m.method).replace("_", " ")}{m.returned_undeliverable_on ? ` · came back ${day(m.returned_undeliverable_on)}` : ""}</span>
          {!d.closed_on && !m.returned_undeliverable_on && (
            <button className="shrink-0 font-semibold text-[#B45309]" onClick={() => onAct({ kind: "returned", dep: d, mail: m })} type="button">It came back</button>
          )}
        </div>
      ))}

      {d.closed_on ? (
        <div className="mt-3 text-[13.5px] text-[#6C7484]">Closed {day(d.closed_on)}{d.refund_amount != null ? ` · refunded ${money(d.refund_amount)}` : ""}</div>
      ) : (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {!d.surrender_on && <Btn onClick={() => onAct({ kind: "moveout", dep: d })} variant="navy">Record move-out</Btn>}
          {d.surrender_on && <Btn onClick={() => onAct({ kind: "deduct", dep: d })}>Add deduction</Btn>}
          {d.surrender_on && <Btn onClick={() => onAct({ kind: "mail", dep: d })}>Log mailed notice</Btn>}
          {d.surrender_on && <Btn onClick={() => onAct({ kind: "close", dep: d })} variant="navy">Close</Btn>}
        </div>
      )}
    </div>
  );
}

function ActionSheet({ sheet, data, portfolio, onCancel, onDone }: {
  sheet: NonNullable<Sheet>; data: any; portfolio: Portfolio; onCancel: () => void; onDone: (msg: string) => void;
}) {
  const [f, setF] = React.useState<Record<string, any>>(() => {
    const today = todayIso();
    if (sheet.kind === "record") return { portfolio: portfolio === "all" ? "htm" : portfolio, received_on: today, method: "" };
    if (sheet.kind === "moveout") return { surrender_on: today, forwarding_address_received: false };
    if (sheet.kind === "deduct") return { kind: "damage" };
    if (sheet.kind === "mail") return { sent_on: today, method: "first_class" };
    if (sheet.kind === "returned") return { returned_on: today };
    if (sheet.kind === "close") return { outcome: "refunded", refund_amount: "" };
    return { csv: "" };
  });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [needOverride, setNeedOverride] = React.useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const dep = "dep" in sheet ? sheet.dep : null;
  const lots = data?.options?.lots ?? [];
  const units = data?.options?.units ?? [];

  async function post(q: string, body: any, msg: string) {
    setBusy(true);
    setErr("");
    try {
      await json(await apiFetch(`/api/deposits?${q}=1`, { method: "POST", body: JSON.stringify(body) }));
      onDone(msg);
    } catch (e: any) {
      setErr(e.message);
      if (/cap/i.test(e.message) && portfolio === "all") setNeedOverride(true);
    } finally {
      setBusy(false);
    }
  }

  function parseCsv(text: string) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line, i) => {
      const cells = line.split(",").map((c) => c.trim());
      const row: Record<string, string> = {};
      head.forEach((h, j) => { row[h] = cells[j] ?? ""; });
      const lot = lots.find((l: any) => String(l.lot_number) === row.lot_number);
      return {
        portfolio: row.portfolio || (row.lot_number ? "htm" : "ahtx"),
        lot_id: lot?.id ?? (row.lot_number ? `missing-lot-${row.lot_number}` : undefined),
        unit_id: row.unit_id || undefined,
        amount: Number(row.amount),
        received_on: row.received_on,
        monthly_rent: row.monthly_rent ? Number(row.monthly_rent) : undefined,
        jurisdiction_rule: row.jurisdiction_rule || undefined,
        surrender_on: row.surrender_on || undefined,
        override_note: row.override_note || undefined,
        import_ref: `csv row ${i + 2}`,
        note: row.note || undefined,
      };
    });
  }

  const title = {
    record: "Take a deposit", moveout: "Record move-out", deduct: "Add a deduction", mail: "Log the mailed notice",
    returned: "Notice came back", close: "Close this deposit", import: "Import existing deposits",
  }[sheet.kind];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div className="max-h-[90vh] w-full max-w-[460px] overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-[18px] font-bold">{title}</div>
        {dep && <div className="mt-0.5 text-[13.5px] text-[#6C7484]">{dep.where} · {money(dep.amount)}</div>}

        {sheet.kind === "record" && (
          <>
            {portfolio === "all" && (
              <>
                <label className={labelClass}>Portfolio</label>
                <select className={inputClass} onChange={(e) => set("portfolio", e.target.value)} value={f.portfolio}>
                  <option value="htm">Hometown Meadows</option>
                  <option value="ahtx">Able Housing Texas</option>
                </select>
              </>
            )}
            {f.portfolio === "htm" ? (
              <>
                <label className={labelClass}>Lot</label>
                <select className={inputClass} onChange={(e) => set("lot_id", e.target.value)} value={f.lot_id ?? ""}>
                  <option value="">Pick a lot</option>
                  {lots.map((l: any) => <option key={l.id} value={l.id}>Lot {l.lot_number}{l.contract_rent ? ` · ${money(l.contract_rent)}/mo` : ""}</option>)}
                </select>
              </>
            ) : (
              <>
                <label className={labelClass}>Door</label>
                <select className={inputClass} onChange={(e) => set("unit_id", e.target.value)} value={f.unit_id ?? ""}>
                  <option value="">Pick a door</option>
                  {units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </>
            )}
            <label className={labelClass}>Amount</label>
            <input className={inputClass} inputMode="decimal" onChange={(e) => set("amount", e.target.value)} value={f.amount ?? ""} />
            <label className={labelClass}>Monthly rent (for the legal cap)</label>
            <input className={inputClass} inputMode="decimal" onChange={(e) => set("monthly_rent", e.target.value)} placeholder="Leave empty to use the rent on file" value={f.monthly_rent ?? ""} />
            <label className={labelClass}>Received on</label>
            <input className={inputClass} onChange={(e) => set("received_on", e.target.value)} type="date" value={f.received_on} />
            <label className={labelClass}>Paid by</label>
            <select className={inputClass} onChange={(e) => set("method", e.target.value)} value={f.method}>
              <option value="">Pick one</option>
              <option value="cash">Cash</option>
              <option value="money_order">Money order</option>
              <option value="check">Check</option>
              <option value="card">Card</option>
              <option value="ach">Bank transfer</option>
            </select>
            {needOverride && (
              <>
                <label className={labelClass}>Why it is over the cap (Raj / Dane only)</label>
                <input className={inputClass} onChange={(e) => set("override_note", e.target.value)} value={f.override_note ?? ""} />
              </>
            )}
          </>
        )}

        {sheet.kind === "moveout" && (
          <>
            <label className={labelClass}>Move-out / surrender date</label>
            <input className={inputClass} onChange={(e) => set("surrender_on", e.target.value)} type="date" value={f.surrender_on} />
            {dep?.portfolio === "ahtx" && (
              <label className="mt-3 flex items-center gap-2.5 text-[15px]">
                <input checked={f.forwarding_address_received} onChange={(e) => set("forwarding_address_received", e.target.checked)} type="checkbox" />
                We have their forwarding address
              </label>
            )}
            <p className="mt-3 text-[13px] text-[#6C7484]">This starts the legal refund clock.</p>
          </>
        )}

        {sheet.kind === "deduct" && (
          <>
            <label className={labelClass}>What for</label>
            <select className={inputClass} onChange={(e) => set("kind", e.target.value)} value={f.kind}>
              <option value="damage">Damage</option>
              <option value="unpaid_rent">Unpaid rent</option>
              <option value="cleaning">Cleaning</option>
              <option value="other">Other</option>
            </select>
            <label className={labelClass}>Description</label>
            <input className={inputClass} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Broken bedroom window" value={f.description ?? ""} />
            <label className={labelClass}>Amount</label>
            <input className={inputClass} inputMode="decimal" onChange={(e) => set("amount", e.target.value)} value={f.amount ?? ""} />
            <p className="mt-3 text-[13px] text-[#6C7484]">Normal wear and tear can't be deducted.</p>
          </>
        )}

        {sheet.kind === "mail" && (
          <>
            <label className={labelClass}>Mailed on</label>
            <input className={inputClass} onChange={(e) => set("sent_on", e.target.value)} type="date" value={f.sent_on} />
            <label className={labelClass}>Sent to (full address)</label>
            <input className={inputClass} onChange={(e) => set("to_address", e.target.value)} value={f.to_address ?? ""} />
            <label className={labelClass}>How</label>
            <select className={inputClass} onChange={(e) => set("method", e.target.value)} value={f.method}>
              <option value="first_class">First-class mail</option>
              <option value="certified">Certified mail</option>
              <option value="hand">By hand</option>
            </select>
            <label className={labelClass}>Tracking number (optional)</label>
            <input className={inputClass} onChange={(e) => set("tracking", e.target.value)} value={f.tracking ?? ""} />
          </>
        )}

        {sheet.kind === "returned" && (
          <>
            <label className={labelClass}>Came back on</label>
            <input className={inputClass} onChange={(e) => set("returned_on", e.target.value)} type="date" value={f.returned_on} />
          </>
        )}

        {sheet.kind === "close" && (
          <>
            <label className={labelClass}>Outcome</label>
            <select className={inputClass} onChange={(e) => set("outcome", e.target.value)} value={f.outcome}>
              <option value="refunded">Refunded in full</option>
              <option value="partly_refunded">Partly refunded (after deductions)</option>
              <option value="applied">Applied to what they owed (nothing refunded)</option>
            </select>
            {f.outcome !== "applied" && (
              <>
                <label className={labelClass}>Amount refunded</label>
                <input className={inputClass} inputMode="decimal" onChange={(e) => set("refund_amount", e.target.value)}
                  placeholder={dep ? money(Number(dep.amount) - Number(dep.deductions_total || 0)) : ""} value={f.refund_amount} />
              </>
            )}
          </>
        )}

        {sheet.kind === "import" && (
          <>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#6C7484]">
              Paste a CSV with this header line, one deposit per line:<br />
              <code className="text-[12px]">portfolio,lot_number,unit_id,amount,received_on,monthly_rent,jurisdiction_rule,surrender_on,override_note,note</code>
            </p>
            <textarea className={`${inputClass} mt-3 h-40 font-mono text-[13px]`} onChange={(e) => set("csv", e.target.value)} value={f.csv} />
            {f.result && (
              <div className="mt-3 text-[13.5px]">
                {f.result.map((r: any) => (
                  <div className={r.ok ? "text-[#14532D]" : "text-[#B91C1C]"} key={r.row}>Row {r.row}: {r.ok ? "imported" : r.error}</div>
                ))}
              </div>
            )}
          </>
        )}

        {err && <div className="mt-4 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[14px] text-[#B91C1C]">{err}</div>}

        <div className="mt-5 flex gap-2.5 [&>button]:flex-1">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn
            disabled={busy}
            onClick={() => {
              if (sheet.kind === "record") return post("record", { ...f, amount: Number(f.amount), monthly_rent: f.monthly_rent ? Number(f.monthly_rent) : undefined }, "Deposit recorded.");
              if (sheet.kind === "moveout") return post("moveout", { id: dep.id, ...f }, "Move-out recorded. The refund clock has started.");
              if (sheet.kind === "deduct") return post("deduct", { id: dep.id, ...f, amount: Number(f.amount) }, "Deduction added.");
              if (sheet.kind === "mail") return post("mail", { id: dep.id, ...f }, "Mailed notice logged.");
              if (sheet.kind === "returned") return post("returned", { mail_id: (sheet as any).mail.id, returned_on: f.returned_on }, "Marked as came back.");
              if (sheet.kind === "close") return post("close", { id: dep.id, outcome: f.outcome, refund_amount: Number(f.refund_amount) }, "Deposit closed.");
              if (sheet.kind === "import") {
                const rows = parseCsv(f.csv);
                if (!rows.length) return setErr("Paste the header line and at least one deposit.");
                setBusy(true);
                apiFetch("/api/deposits?import=1", { method: "POST", body: JSON.stringify({ rows }) })
                  .then(json)
                  .then((b) => set("result", b.results ?? []))
                  .catch((e) => setErr(e.message))
                  .finally(() => setBusy(false));
              }
            }}
            variant="navy"
          >
            {busy ? "Saving…" : sheet.kind === "import" ? "Import" : "Save"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
