// src/pages/ZoReturnedPayment.tsx
// T-25 Part 3 (15 Oct 2026): "Payment came back" - Zo's screen for a bounced
// payment. Lot -> recent payments -> preview -> reason -> record.
// The server (routes/returned-payments.js) decides everything that matters:
// the $30 HTM fee, one record per payment, chargebacks only alert Raj, and
// nothing is written while RETURNED_PAYMENTS_ON is off. No QuickBooks.

import React from "react";
import { useNavigate } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ZoScreenHeader } from "../components/ZoScreenHeader";
import { ZoTabBar } from "../components/ZoTabBar";
import { apiFetch } from "../lib/apiFetch";

const inputClass =
  "w-full rounded-[9px] border border-[#D5D8DE] bg-white px-3.5 py-3 text-[16px] text-[#1B2231] focus:border-[#1E3A8A] focus:outline-none";
const labelClass = "mb-1.5 mt-3 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]";
const btn = (navy = false) =>
  `rounded-[9px] px-4 py-3 text-[15px] font-semibold disabled:opacity-40 ${
    navy ? "bg-[#1E3A8A] text-white" : "border border-[#D5D8DE] bg-white text-[#1B2231]"
  }`;

async function json(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Something went wrong");
  return body;
}
const money = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "-";
};
const day = (iso?: string | null) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

type Pay = { id: string; amount: number; received_at: string; method: string | null; already_returned: boolean };

export function ZoReturnedPayment() {
  const navigate = useNavigate();
  const [lot, setLot] = React.useState("");
  const [list, setList] = React.useState<{ switched_on: boolean; payments: Pay[] } | null>(null);
  const [picked, setPicked] = React.useState<Pay | null>(null);
  const [preview, setPreview] = React.useState<any>(null);
  const [reason, setReason] = React.useState("");
  const [confirming, setConfirming] = React.useState<"returned" | "chargeback" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const [done, setDone] = React.useState("");

  const findPayments = async () => {
    setProblem(""); setDone(""); setPicked(null); setPreview(null); setList(null);
    const n = lot.trim();
    if (!/^\d+$/.test(n)) { setProblem("Type the lot number, like 12."); return; }
    try {
      setList(await json(await apiFetch(`/api/returned-payments?lot=${encodeURIComponent(n)}`)));
    } catch (e: any) { setProblem(e.message); }
  };

  const pick = async (p: Pay) => {
    setPicked(p); setPreview(null); setConfirming(null); setProblem(""); setDone("");
    try {
      setPreview(await json(await apiFetch(`/api/returned-payments?payment_id=${p.id}`)));
    } catch (e: any) { setProblem(e.message); }
  };

  const record = async (kind: "returned" | "chargeback") => {
    if (!picked) return;
    setBusy(true); setProblem("");
    try {
      const b = await json(await apiFetch("/api/returned-payments", {
        method: "POST",
        body: JSON.stringify({ payment_id: picked.id, kind, reason }),
      }));
      setDone(
        kind === "chargeback"
          ? "Raj has been asked to review the chargeback. No charge was added."
          : b.already
            ? "This payment was already recorded as returned. Nothing new was added."
            : `Recorded. ${money(preview?.would_add?.returned_amount)} is owed again${preview?.would_add?.fee ? ` plus the ${money(preview.would_add.fee)} fee` : ""}. Raj has been told.`,
      );
      setConfirming(null);
      await findPayments();
    } catch (e: any) { setProblem(e.message); }
    finally { setBusy(false); }
  };

  const on = Boolean(list?.switched_on ?? preview?.switched_on);

  return (
    <MobileScreenShell
      headerContent={
        <ZoScreenHeader
          eyebrow="Hometown Meadows MHP"
          subtitle="A check bounced, a bank payment failed, or a card was disputed."
          title="Payment came back"
        />
      }
    >
      <div className="pb-28 pt-2">
        {list && !on && (
          <p className="mt-3 rounded-xl border border-[#F1C98A] bg-[#FFF6E5] px-4 py-3 text-[15px] font-semibold text-[#7A4B00]">
            Not switched on yet. You can look, but nothing can be recorded until Raj turns this on.
          </p>
        )}
        {problem && <p className="mt-3 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[15px] text-[#B91C1C]">{problem}</p>}
        {done && <p className="mt-3 rounded-xl bg-[#EAF7EF] px-4 py-3 text-[15px] font-semibold text-[#14532D]">{done}</p>}

        <section className="mt-4 rounded-2xl border border-[#DCE4EE] bg-white p-4">
          <label className={labelClass} htmlFor="rp-lot">Lot number</label>
          <div className="flex gap-2.5">
            <input className={inputClass} id="rp-lot" inputMode="numeric" onChange={(e) => setLot(e.target.value)} placeholder="e.g. 12" value={lot} />
            <button className={btn(true)} onClick={findPayments} type="button">Find</button>
          </div>
        </section>

        {list && (
          <section className="mt-4 rounded-2xl border border-[#DCE4EE] bg-white">
            <h2 className="px-4 pt-4 text-[13px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">Payments in the last 90 days</h2>
            {list.payments.length === 0 && <p className="px-4 py-4 text-[15px] text-[#6C7484]">No payments found for this lot.</p>}
            <div className="divide-y divide-[#EEF1F5]">
              {list.payments.map((p) => (
                <button
                  className={`flex w-full items-center justify-between px-4 py-3.5 text-left ${picked?.id === p.id ? "bg-[#EEF4FF]" : ""}`}
                  key={p.id}
                  onClick={() => pick(p)}
                  type="button"
                >
                  <span className="text-[16px] font-semibold text-[#1A1A2E]">{money(p.amount)} · {day(p.received_at)}</span>
                  <span className="text-[13px] text-[#6C7484]">{p.already_returned ? "Already returned" : p.method ?? ""}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {picked && preview && (
          <section className="mt-4 rounded-2xl border border-[#DCE4EE] bg-white p-4">
            <p className="text-[16px] text-[#1A1A2E]">
              If this payment came back, <b>{money(preview.would_add.returned_amount)}</b> is owed again
              {preview.would_add.fee ? <> plus a <b>{money(preview.would_add.fee)}</b> returned-payment fee.</> : <>. No fee ({preview.would_add.fee_reason}).</>}
            </p>
            {preview.would_add.already_in_quickbooks && (
              <p className="mt-2 text-[14px] text-[#7A4B00]">This payment is already in QuickBooks - Sofi will record the bounce there. Nothing here posts to QuickBooks.</p>
            )}
            {preview.already_recorded?.length > 0 && (
              <p className="mt-2 text-[14px] font-semibold text-[#14532D]">Already recorded as returned.</p>
            )}

            <label className={labelClass} htmlFor="rp-reason">Why did it come back?</label>
            <input className={inputClass} id="rp-reason" maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. NSF - insufficient funds" value={reason} />

            {!confirming ? (
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button className={btn(true)} disabled={!on || reason.trim().length < 3 || preview.already_recorded?.length > 0} onClick={() => setConfirming("returned")} type="button">
                  Record returned payment
                </button>
                <button className={btn()} disabled={!on || reason.trim().length < 3} onClick={() => setConfirming("chargeback")} type="button">
                  It was a card dispute (tell Raj)
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-[#F1C98A] bg-[#FFF6E5] p-3">
                <p className="text-[15px] font-semibold text-[#7A4B00]">
                  {confirming === "chargeback"
                    ? "Send this dispute to Raj for review? No charge will be added."
                    : `Add ${money(preview.would_add.returned_amount)}${preview.would_add.fee ? ` + ${money(preview.would_add.fee)} fee` : ""} to Lot ${preview.lot}? This can't be undone here.`}
                </p>
                <div className="mt-3 flex gap-2.5">
                  <button className={btn(true)} disabled={busy || !on} onClick={() => record(confirming)} type="button">{busy ? "Saving..." : "Yes, record it"}</button>
                  <button className={btn()} disabled={busy} onClick={() => setConfirming(null)} type="button">Cancel</button>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="mt-4">
          <button className={btn()} onClick={() => navigate("/zo/collections")} type="button">Back to Rent</button>
        </div>
      </div>
      <ZoTabBar />
    </MobileScreenShell>
  );
}
