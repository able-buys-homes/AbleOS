// routes/qbo-sync.js
// Brings QuickBooks up to date with the rent ledger.
//
// POST /api/qbo-sync   { limit }
//
// QuickBooks is a mirror, not the record. Nothing here is allowed to block a
// payment being taken or recorded - if Intuit is down, or a token has expired,
// or somebody deleted an income account, the ledger carries on and this catches
// up on the next run. That is why posting is a separate endpoint rather than
// something bolted onto the moment a resident pays.
//
// Everything is keyed on whether a row already carries a QuickBooks id, so
// running it twice, or ten times, posts nothing twice.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { postCharge, postPayment, debugPaymentMethod } from "../lib/qboLedger.js";

const CHARGE_LABEL = {
    rent: "Lot rent",
    late_fee: "Late fee",
    utility: "Utilities",
    other: "Charge",
};

let cachedClient = null;

function getClient() {
    if (cachedClient) return cachedClient;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY missing");

    cachedClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return cachedClient;
}

function secretMatches(header, secret) {
    const a = Buffer.from(String(header ?? ""));
    const b = Buffer.from(`Bearer ${secret}`);

    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/**
 * One notification per six hours, however many times this runs in between.
 *
 * The sync runs hourly. Without the window, a QuickBooks outage over a weekend
 * would put forty identical notices on Raj's desk and bury everything else,
 * which is the same as telling him nothing.
 */
async function notifyOnce(supabase, title, body) {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    const { data: recent } = await supabase
        .from("notifications")
        .select("id")
        .eq("recipient", "raj")
        .eq("type", "qbo_sync_failed")
        .gte("created_at", since)
        .limit(1);

    if (recent?.length) return false;

    await supabase.from("notifications").insert({
        recipient: "raj",
        type: "qbo_sync_failed",
        title,
        body: String(body ?? "").slice(0, 500),
        // Raj cannot open Zo's screens. A notification that lands on a locked
        // page is worse than one with no link at all.
        link: "/raj",
    });

    return true;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const secret = process.env.N8N_SHARED_SECRET;
    if (!secret) return res.status(500).json({ error: "N8N_SHARED_SECRET is not set" });
    if (!secretMatches(req.headers.authorization, secret)) {
        return res.status(401).json({ error: "Not authorised" });
    }

    // Temporary diagnostic. Remove once the payment method question is settled.
    if (req.body?.debug_method) {
        try {
            const info = await debugPaymentMethod(String(req.body.debug_method));
            return res.status(200).json({ ok: true, debug: info });
        } catch (err) {
            return res.status(500).json({ error: err?.message ?? String(err) });
        }
    }

    const limit = Math.min(Math.max(Number(req.body?.limit) || 50, 1), 200);
    const supabase = getClient();

    const result = {
        invoices: { posted: 0, failed: 0 },
        payments: { posted: 0, failed: 0 },
        errors: [],
    };

    try {
        /* ---- Charges first. A payment cannot be applied to an invoice that
                does not exist yet, so the order here is not cosmetic. ---- */
        const { data: charges, error: chargesError } = await supabase
            .from("rent_ledger")
            .select("id, lot_id, period, charge_type, amount, due_date, qbo_txn_id")
            .is("qbo_txn_id", null)
            .gt("amount", 0)
            .order("due_date", { ascending: true })
            .limit(limit);

        if (chargesError) throw new Error(chargesError.message);

        const { data: payments, error: paymentsError } = await supabase
            .from("payments")
            .select(
                "id, lot_id, amount, received_at, method, receipt_number, reverses_id, qbo_payment_id",
            )
            .is("qbo_payment_id", null)
            .is("reverses_id", null)
            .gt("amount", 0)
            .order("received_at", { ascending: true })
            .limit(limit);

        if (paymentsError) throw new Error(paymentsError.message);

        // A payment that has since been reversed never belonged in the books.
        const { data: reversals, error: reversalsError } = await supabase
            .from("payments")
            .select("reverses_id")
            .not("reverses_id", "is", null);

        if (reversalsError) throw new Error(reversalsError.message);

        const reversed = new Set((reversals ?? []).map((r) => r.reverses_id));

        const lotIds = [
            ...new Set([
                ...(charges ?? []).map((c) => c.lot_id),
                ...(payments ?? []).map((p) => p.lot_id),
            ]),
        ];

        if (!lotIds.length) return res.status(200).json({ ok: true, ...result });

        const { data: lots, error: lotsError } = await supabase
            .from("lots")
            .select("id, lot_number, property, tenant_name, qbo_customer_id")
            .in("id", lotIds);

        if (lotsError) throw new Error(lotsError.message);

        const lotById = new Map((lots ?? []).map((l) => [l.id, l]));

        for (const charge of charges ?? []) {
            const lot = lotById.get(charge.lot_id);
            if (!lot) continue;

            try {
                await postCharge(charge, lot, CHARGE_LABEL[charge.charge_type] ?? "Charge");
                // The lot now carries a customer id; reuse it rather than
                // looking it up again on the next row.
                lot.qbo_customer_id = lot.qbo_customer_id ?? undefined;
                result.invoices.posted += 1;
            } catch (err) {
                result.invoices.failed += 1;
                result.errors.push(`charge ${charge.id}: ${err?.message ?? err}`);
            }
        }

        for (const payment of payments ?? []) {
            if (reversed.has(payment.id)) continue;

            const lot = lotById.get(payment.lot_id);
            if (!lot) continue;

            try {
                await postPayment(payment, lot);
                result.payments.posted += 1;
            } catch (err) {
                result.payments.failed += 1;
                result.errors.push(`payment ${payment.id}: ${err?.message ?? err}`);

                // Written to the row so a failure is visible in the data, not
                // only in a log nobody opens.
                await supabase
                    .from("payments")
                    .update({ qbo_error: String(err?.message ?? err).slice(0, 500) })
                    .eq("id", payment.id);
            }
        }

        // Nobody watches a cron. If something did not post, it has to appear
        // on a desk - a column nobody queries and a log nobody opens are not
        // the same as being told.
        const failed = result.invoices.failed + result.payments.failed;

        if (failed > 0) {
            try {
                await notifyOnce(
                    supabase,
                    `${failed} ${failed === 1 ? "item" : "items"} did not reach QuickBooks`,
                    result.errors.slice(0, 3).join(" · ") ||
                        "The sync ran but could not post everything. The rent ledger itself is unaffected.",
                );
            } catch (notifyError) {
                console.error("qbo-sync could not notify", notifyError?.message ?? notifyError);
            }
        }

        return res.status(200).json({ ok: true, ...result });
    } catch (err) {
        console.error("qbo-sync failed", err?.message ?? err);

        // The whole run fell over - an expired token, Intuit down, a bug of
        // our own. The books quietly stop moving, which is exactly the failure
        // that goes unnoticed for a fortnight.
        try {
            await notifyOnce(
                supabase,
                "QuickBooks sync could not run",
                err?.message ?? String(err),
            );
        } catch {
            // If even the notification cannot be written, the log is all we have.
        }

        return res
            .status(err?.status || 500)
            .json({ error: err?.message ?? "Could not sync QuickBooks", ...result });
    }
}