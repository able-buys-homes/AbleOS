// routes/returned-payments.js
// T-25 Part 3 - a payment that came back (bounced check / failed ACH / card
// reversal). Design agreed 11 Oct 2026, built 15 Oct 2026 (Coco's spec):
//
//   - The original payment is NEVER edited or reversed. Instead two charges are
//     added to the lot's ledger: "returned_payment" (the amount that bounced,
//     owed again) and "returned_payment_fee" ($30, Hometown Meadows only).
//   - One of each per payment, enforced by a unique index on
//     rent_ledger(returned_payment_id, charge_type).
//   - Chargebacks are NEVER charged automatically: Raj gets a review alert.
//   - QuickBooks: nothing here posts to QBO, and qbo-sync skips both charge
//     types. If the bounced payment was already in QBO, Raj is told Sofi must
//     record the bounce there.
//   - Behind a flag: RETURNED_PAYMENTS_ON=true in Vercel, or nothing is written.
//
// GET  /api/returned-payments?payment_id=<uuid>   preview - no writes
// POST /api/returned-payments  { payment_id, kind: "returned"|"chargeback", reason }
// Zo, Raj and Dane only.

import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../lib/apiAuth.js";

const CAN_USE = ["zo", "raj", "dane"];
const HTM = "Hometown Meadows MHP";
// Raj, 11 Oct 2026: $30 for every method, Arkansas (HTM) only. Texas has no
// fee until Lex confirms the limits. Same figure as lib/depositRules.js.
const RETURNED_PAYMENT_FEE_HTM = 30;

let cachedClient = null;
function getClient() {
    if (cachedClient) return cachedClient;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url) throw new Error("SUPABASE_URL is not set");
    if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
    cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return cachedClient;
}

const isUuid = (v) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
const money = (n) => Math.round(Number(n ?? 0) * 100) / 100;

async function loadPayment(supabase, paymentId) {
    const { data: payment, error } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
    if (error) throw error;
    if (!payment) return { problem: [404, "No payment with that id"] };
    if (payment.reverses_id) return { problem: [400, "That row is itself a reversal, not a payment"] };
    if (!(Number(payment.amount) > 0)) return { problem: [400, "That payment has no amount"] };

    const { data: lot, error: lotError } = await supabase
        .from("lots").select("id, lot_number, property").eq("id", payment.lot_id).maybeSingle();
    if (lotError) throw lotError;
    if (!lot) return { problem: [400, "That payment has no lot"] };

    const { data: existing, error: exError } = await supabase
        .from("rent_ledger").select("id, charge_type, amount, created_at").eq("returned_payment_id", paymentId);
    if (exError) throw exError;

    return { payment, lot, existing: existing ?? [] };
}

function plan({ payment, lot }) {
    const isHtm = lot.property === HTM;
    return {
        returned_amount: money(payment.amount),
        fee: isHtm ? RETURNED_PAYMENT_FEE_HTM : 0,
        fee_reason: isHtm ? "Arkansas (HTM) returned-payment fee" : "No fee outside HTM until counsel confirms the limits",
        already_in_quickbooks: Boolean(payment.qbo_payment_id),
    };
}

export default async function handler(req, res) {
    let caller;
    try {
        caller = await requireUser(req);
    } catch (err) {
        return res.status(err?.status || 401).json({ error: err?.message || "Not authorised" });
    }
    if (!CAN_USE.includes(caller?.profile?.cockpit)) {
        return res.status(403).json({ error: "Not your screen" });
    }

    try {
        const supabase = getClient();

        /* ---- Preview: what would happen. Never writes. ---- */
        /* ---- A lot's recent payments, for Zo's screen. Never writes. ---- */
        if (req.method === "GET" && req.query?.lot) {
            const lotNumber = String(req.query.lot).trim();
            if (!/^\d{1,4}$/.test(lotNumber)) return res.status(400).json({ error: "Which lot?" });
            const { data: lot, error: lotErr } = await supabase
                .from("lots").select("id").eq("property", HTM).eq("lot_number", lotNumber).maybeSingle();
            if (lotErr) throw lotErr;
            if (!lot) return res.status(404).json({ error: "No such lot at Hometown Meadows" });
            const since = new Date(Date.now() - 90 * 86400000).toISOString();
            const { data: pays, error: payErr } = await supabase
                .from("payments").select("id, amount, received_at, method")
                .eq("lot_id", lot.id).is("reverses_id", null).gte("received_at", since)
                .order("received_at", { ascending: false }).limit(50);
            if (payErr) throw payErr;
            const ids = (pays ?? []).map((p) => p.id);
            const { data: returned, error: retErr } = ids.length
                ? await supabase.from("rent_ledger").select("returned_payment_id").in("returned_payment_id", ids)
                : { data: [], error: null };
            if (retErr) throw retErr;
            const done = new Set((returned ?? []).map((r) => r.returned_payment_id));
            return res.status(200).json({
                switched_on: process.env.RETURNED_PAYMENTS_ON === "true",
                payments: (pays ?? []).map((p) => ({ ...p, amount: money(p.amount), already_returned: done.has(p.id) })),
            });
        }

        if (req.method === "GET") {
            const paymentId = String(req.query?.payment_id || "");
            if (!isUuid(paymentId)) return res.status(400).json({ error: "Which payment?" });
            const loaded = await loadPayment(supabase, paymentId);
            if (loaded.problem) return res.status(loaded.problem[0]).json({ error: loaded.problem[1] });
            return res.status(200).json({
                preview: true,
                switched_on: process.env.RETURNED_PAYMENTS_ON === "true",
                lot: loaded.lot.lot_number,
                payment: {
                    amount: money(loaded.payment.amount),
                    received_at: loaded.payment.received_at,
                    method: loaded.payment.method ?? null,
                },
                would_add: plan(loaded),
                already_recorded: loaded.existing,
            });
        }

        if (req.method !== "POST") {
            res.setHeader("Allow", "GET, POST");
            return res.status(405).json({ error: "Method not allowed" });
        }

        /* ---- Record it. ---- */
        if (process.env.RETURNED_PAYMENTS_ON !== "true") {
            return res.status(403).json({ error: "Returned payments are not switched on yet (RETURNED_PAYMENTS_ON)." });
        }

        const paymentId = String(req.body?.payment_id || "");
        const kind = String(req.body?.kind || "");
        const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
        if (!isUuid(paymentId)) return res.status(400).json({ error: "Which payment?" });
        if (!["returned", "chargeback"].includes(kind)) return res.status(400).json({ error: "kind must be returned or chargeback" });
        if (reason.length < 3) return res.status(400).json({ error: "Write why it came back (e.g. NSF, account closed)." });

        const loaded = await loadPayment(supabase, paymentId);
        if (loaded.problem) return res.status(loaded.problem[0]).json({ error: loaded.problem[1] });
        const { payment, lot } = loaded;
        const p = plan(loaded);
        const who = caller.profile.cockpit;

        // Chargebacks are a person's decision, never an automatic charge.
        if (kind === "chargeback") {
            await supabase.from("notifications").insert({
                recipient: "raj",
                type: "chargeback_review",
                title: `Chargeback to review - Lot ${lot.lot_number}`,
                body: `$${p.returned_amount} payment from ${String(payment.received_at).slice(0, 10)} was disputed. Reason: ${reason}. Reported by ${who}. No charge was added.`,
                link: "/raj",
            });
            return res.status(200).json({ ok: true, kind, charged: false, note: "Raj has been asked to review it." });
        }

        const period = `${today().slice(0, 7)}-01`;
        const note = `Payment of ${String(payment.received_at).slice(0, 10)} came back: ${reason} (recorded by ${who})`;
        const rows = [
            {
                lot_id: lot.id, period, charge_type: "returned_payment", amount: p.returned_amount,
                due_date: today(), source: "manual", note, returned_payment_id: payment.id,
            },
        ];
        if (p.fee > 0) {
            rows.push({
                lot_id: lot.id, period, charge_type: "returned_payment_fee", amount: p.fee,
                due_date: today(), source: "manual", note: `Returned-payment fee. ${note}`, returned_payment_id: payment.id,
            });
        }

        const { data: inserted, error: insertError } = await supabase
            .from("rent_ledger").insert(rows).select("id, charge_type, amount");

        if (insertError) {
            if (insertError.code === "23505") {
                return res.status(200).json({ ok: true, already: true, note: "This payment was already recorded as returned." });
            }
            throw insertError;
        }

        await supabase.from("notifications").insert({
            recipient: "raj",
            type: "payment_returned",
            title: `Payment came back - Lot ${lot.lot_number}`,
            body: `$${p.returned_amount} owed again${p.fee ? ` + $${p.fee} fee` : ""}. Reason: ${reason}. Recorded by ${who}.${p.already_in_quickbooks ? " This payment was already in QuickBooks - Sofi must record the bounce there." : ""}`,
            link: "/raj",
        });

        return res.status(201).json({ ok: true, kind, added: inserted, already_in_quickbooks: p.already_in_quickbooks });
    } catch (err) {
        console.error("returned-payments failed:", err?.message ?? err);
        return res.status(500).json({ error: "Could not record that" });
    }
}
