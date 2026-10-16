// routes/qbo-repost.js
// ONE-OFF (16 Oct 2026): re-post October 2026 rent invoices to the LIVE
// QuickBooks company. Approved by Raj (via Coco) and Sofi.
//
// Why: invoices #203-#215 were created Oct 1-4, while the cockpit was still
// connected to the QuickBooks SANDBOX (live connection made Oct 4, live from
// Oct 5). The live books have no October invoices, so the Lot 17 and Lot 44
// card payments sit there "Unapplied".
//
// Scope is fixed below - nothing else can be posted through this route:
//   invoices: Lots 15, 17, 41 (October only), 44
//   apply:    live payment #4 ($750) -> Lot 17 invoice
//             live payment #5 ($650) -> Lot 44 invoice
// Held (NOT here): Lot 8, Lot 41 payment #9, Lots 12/27/43/46/28/16/13, Fox Run.
//
// GET  /api/qbo-repost              dry run - reads only, shows exactly what would happen
// POST /api/qbo-repost  {confirm}   does it. confirm must equal CONFIRM below.
//
// Auth: header "x-repost-key" must equal env QBO_REPOST_KEY (a one-off key;
// delete the env var after use). Every write is checked first:
//   - connection is production AND company id is the live Kubera one
//   - each lot's QuickBooks customer exists in LIVE and its name contains "Lot N"
//   - each charge still carries its old SANDBOX id (so it can't be posted twice)
//   - each payment is the expected amount, for the same customer, still unapplied

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { qbo, qboQuery, getConnection } from "../lib/qbo.js";
import { ensureRentItem } from "../lib/qboLedger.js";

const LIVE_REALM = "9341457938454193";
const CONFIRM = "REPOST-OCT-2026-LIVE";

const PLAN = {
    invoices: [
        { lot: "15", chargeId: "124b8579-a3f2-4c6c-87c9-44102b277bf4", amount: 850, sandboxId: "213" },
        { lot: "17", chargeId: "dc2268fa-416e-495c-aaee-afcffb4ad540", amount: 750, sandboxId: "207" },
        { lot: "41", chargeId: "7d31df32-d1df-436a-9904-8034c3c7392b", amount: 650, sandboxId: "204" },
        { lot: "44", chargeId: "f952e2b4-32a5-4bc7-8edc-f2c97e513b69", amount: 650, sandboxId: "212" },
    ],
    apply: [
        { lot: "17", qboPaymentId: "4", amount: 750 },
        { lot: "44", qboPaymentId: "5", amount: 650 },
    ],
};

let cachedClient = null;
function getClient() {
    if (cachedClient) return cachedClient;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY missing");
    cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return cachedClient;
}

function keyMatches(given) {
    const expected = process.env.QBO_REPOST_KEY;
    if (!expected || typeof given !== "string" || !given) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const money = (n) => Math.round(Number(n ?? 0) * 100) / 100;

/** Reads everything and decides, item by item, what would happen. Never writes. */
async function buildPlan(supabase) {
    const problems = [];
    const conn = await getConnection();
    if (!conn) problems.push("QuickBooks is not connected");
    else {
        if (conn.environment !== "production") problems.push(`Connection is ${conn.environment}, not production`);
        if (String(conn.realm_id) !== LIVE_REALM) problems.push(`Connected company ${conn.realm_id} is not the live Kubera company ${LIVE_REALM}`);
    }

    const lotNumbers = [...new Set(PLAN.invoices.map((i) => i.lot))];
    const { data: lots, error: lotErr } = await supabase
        .from("lots").select("id, lot_number, qbo_customer_id")
        .eq("property", "Hometown Meadows MHP").in("lot_number", lotNumbers);
    if (lotErr) throw lotErr;
    const lotByNo = new Map((lots ?? []).map((l) => [l.lot_number, l]));

    const customers = new Map();
    if (!problems.length) {
        for (const n of lotNumbers) {
            const lot = lotByNo.get(n);
            if (!lot?.qbo_customer_id) { customers.set(n, { ok: false, why: "no QuickBooks customer id on the lot" }); continue; }
            const r = await qboQuery(`select Id, DisplayName, Balance from Customer where Id = '${String(lot.qbo_customer_id).replace(/'/g, "")}'`);
            const c = r?.Customer?.[0];
            if (!c) customers.set(n, { ok: false, id: lot.qbo_customer_id, why: "customer id not found in LIVE QuickBooks" });
            else if (!new RegExp(`Lot ${n}(\\b|$)`).test(c.DisplayName)) customers.set(n, { ok: false, id: c.Id, name: c.DisplayName, why: `live customer name does not mention Lot ${n}` });
            else customers.set(n, { ok: true, id: c.Id, name: c.DisplayName, balance: c.Balance });
        }
    }

    const invoices = [];
    for (const item of PLAN.invoices) {
        const { data: charge, error } = await supabase
            .from("rent_ledger").select("id, lot_id, period, charge_type, amount, due_date, qbo_txn_id, note")
            .eq("id", item.chargeId).maybeSingle();
        if (error) throw error;
        const cust = customers.get(item.lot);
        let action = "create invoice";
        let why = null;
        if (!charge) { action = "skip"; why = "charge not found"; }
        else if (money(charge.amount) !== item.amount) { action = "skip"; why = `amount is ${charge.amount}, expected ${item.amount}`; }
        else if (String(charge.qbo_txn_id ?? "") !== item.sandboxId) { action = "skip"; why = `already re-posted or changed (qbo id now ${charge.qbo_txn_id})`; }
        else if (!cust?.ok) { action = "skip"; why = cust?.why ?? "customer check not run"; }
        invoices.push({
            lot: item.lot, amount: item.amount, period: charge?.period, txn_date: charge?.due_date ?? charge?.period,
            sandbox_id: item.sandboxId, customer: cust ?? null, action, why,
        });
    }

    const payments = [];
    if (!problems.length) {
        for (const item of PLAN.apply) {
            const r = await qboQuery(`select * from Payment where Id = '${item.qboPaymentId}'`);
            const p = r?.Payment?.[0];
            const cust = customers.get(item.lot);
            let action = "apply to the new invoice";
            let why = null;
            if (!p) { action = "skip"; why = "payment not found in LIVE QuickBooks"; }
            else if (money(p.TotalAmt) !== item.amount) { action = "skip"; why = `payment is ${p.TotalAmt}, expected ${item.amount}`; }
            else if (!cust?.ok || String(p.CustomerRef?.value) !== String(cust.id)) { action = "skip"; why = `payment belongs to customer ${p?.CustomerRef?.value} (${p?.CustomerRef?.name ?? "?"}), not the lot's customer ${cust?.id}`; }
            else if (money(p.UnappliedAmt) !== item.amount) { action = "skip"; why = `only ${p.UnappliedAmt} is unapplied - already applied?`; }
            payments.push({
                lot: item.lot, qbo_payment_id: item.qboPaymentId, amount: item.amount,
                live_customer: p?.CustomerRef ?? null, unapplied: p?.UnappliedAmt ?? null, action, why,
            });
        }
    }

    return { problems, connection: conn ? { environment: conn.environment, realm_id: conn.realm_id } : null, invoices, payments };
}

export default async function handler(req, res) {
    if (!keyMatches(req.headers["x-repost-key"])) return res.status(401).json({ error: "Not authorised" });

    try {
        const supabase = getClient();
        const plan = await buildPlan(supabase);

        if (req.method === "GET") return res.status(200).json({ dry_run: true, ...plan });

        if (req.method !== "POST") {
            res.setHeader("Allow", "GET, POST");
            return res.status(405).json({ error: "Method not allowed" });
        }
        if (req.body?.confirm !== CONFIRM) return res.status(400).json({ error: `Send {"confirm":"${CONFIRM}"} to post` });
        if (plan.problems.length) return res.status(409).json({ error: "Stopped - connection checks failed", ...plan });

        const itemId = await ensureRentItem();
        const done = { invoices: [], payments: [] };
        const invoiceByLot = new Map();

        for (const inv of plan.invoices) {
            if (inv.action !== "create invoice") { done.invoices.push({ lot: inv.lot, result: "skipped", why: inv.why }); continue; }
            const item = PLAN.invoices.find((i) => i.lot === inv.lot);
            const created = await qbo("/invoice", {
                method: "POST",
                body: {
                    CustomerRef: { value: inv.customer.id },
                    TxnDate: inv.txn_date,
                    DueDate: inv.txn_date,
                    PrivateNote: `Able OS rent_ledger ${item.chargeId} (re-post 16 Oct 2026; replaces sandbox #${item.sandboxId})`,
                    Line: [{
                        DetailType: "SalesItemLineDetail",
                        Amount: inv.amount,
                        Description: `Lot rent - ${inv.period}`,
                        SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: 1, UnitPrice: inv.amount },
                    }],
                },
            });
            const id = created?.Invoice?.Id;
            if (!id) { done.invoices.push({ lot: inv.lot, result: "failed", why: "no invoice id returned" }); continue; }
            invoiceByLot.set(inv.lot, id);
            const { error } = await supabase.from("rent_ledger").update({
                qbo_txn_id: id,
                note: `Re-posted to LIVE QuickBooks 16 Oct 2026 as invoice ${id} (was sandbox #${item.sandboxId}).`,
            }).eq("id", item.chargeId).eq("qbo_txn_id", item.sandboxId);
            if (error) throw error;
            done.invoices.push({ lot: inv.lot, result: "created", qbo_invoice_id: id, doc_number: created.Invoice.DocNumber ?? null, amount: inv.amount, date: inv.txn_date });
        }

        for (const pay of plan.payments) {
            const invoiceId = invoiceByLot.get(pay.lot);
            if (pay.action !== "apply to the new invoice" || !invoiceId) {
                done.payments.push({ lot: pay.lot, qbo_payment_id: pay.qbo_payment_id, result: "skipped", why: pay.why ?? "its invoice was not created" });
                continue;
            }
            const fresh = await qboQuery(`select * from Payment where Id = '${pay.qbo_payment_id}'`);
            const p = fresh?.Payment?.[0];
            await qbo("/payment", {
                method: "POST",
                body: {
                    Id: p.Id,
                    SyncToken: p.SyncToken,
                    sparse: true,
                    CustomerRef: p.CustomerRef,
                    TotalAmt: p.TotalAmt,
                    Line: [{ Amount: pay.amount, LinkedTxn: [{ TxnId: invoiceId, TxnType: "Invoice" }] }],
                },
            });
            done.payments.push({ lot: pay.lot, qbo_payment_id: pay.qbo_payment_id, result: "applied", invoice: invoiceId, amount: pay.amount });
        }

        await supabase.from("notifications").insert({
            recipient: "dane",
            type: "qbo_repost",
            title: "October invoices re-posted to live QuickBooks",
            body: JSON.stringify(done).slice(0, 900),
            link: "/dane",
        });

        return res.status(200).json({ ok: true, done });
    } catch (err) {
        console.error("qbo-repost failed:", err?.message ?? err);
        return res.status(500).json({ error: err?.message ?? "Could not re-post" });
    }
}
