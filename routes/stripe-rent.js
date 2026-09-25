// routes/stripe-rent.js
// Records a rent payment that a resident made by card.
//
// POST /api/stripe-rent   { payment_intent_id }
//
// The body carries an id and nothing else. The amount, the status and the lot
// are read back from Stripe itself, so a caller who somehow got hold of the
// shared secret still cannot invent a payment - the worst they can do is ask
// us to look at a charge that already exists.
//
// This is deliberately not in n8n. A workflow that can be edited in a browser
// should not be the thing that decides whether a resident has paid their rent.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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

/**
 * Constant time, because a plain !== leaks the secret one character at a time
 * to anyone patient enough to measure the replies.
 */
function secretMatches(header, secret) {
    const given = String(header ?? "");
    const expected = `Bearer ${secret}`;

    const a = Buffer.from(given);
    const b = Buffer.from(expected);

    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const secret = process.env.N8N_SHARED_SECRET;
    if (!secret) {
        return res.status(500).json({ error: "N8N_SHARED_SECRET is not set" });
    }

    if (!secretMatches(req.headers.authorization, secret)) {
        return res.status(401).json({ error: "Not authorised" });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
        return res.status(500).json({ error: "STRIPE_SECRET_KEY is not set" });
    }

    const intentId = String(req.body?.payment_intent_id || "").trim();

    if (!/^pi_[A-Za-z0-9]+$/.test(intentId)) {
        return res.status(400).json({ error: "Which payment?" });
    }

    try {
        // Read the charge back from Stripe rather than trusting what arrived.
        const stripeRes = await fetch(
            `https://api.stripe.com/v1/payment_intents/${intentId}`,
            { headers: { Authorization: `Bearer ${stripeKey}` } },
        );

        const intent = await stripeRes.json().catch(() => null);

        if (!stripeRes.ok || !intent?.id) {
            console.error("stripe-rent: could not read intent", intent?.error?.message);
            return res.status(502).json({ error: "Could not read that payment from Stripe" });
        }

        // Anything not settled is not money. Stripe will send the event again
        // when it is, and that attempt will land here properly.
        if (intent.status !== "succeeded") {
            return res.status(202).json({ ok: true, ignored: `status ${intent.status}` });
        }

        const meta = intent.metadata ?? {};

        // Application fees ride the same event. They are somebody else's job.
        if (meta.kind !== "rent") {
            return res.status(202).json({ ok: true, ignored: "not a rent payment" });
        }

        const lotId = String(meta.lot_id || "");
        if (!lotId) {
            console.error("stripe-rent: rent payment with no lot_id", intent.id);
            return res.status(422).json({ error: "That payment has no lot on it" });
        }

        const amount = Number(intent.amount_received ?? 0) / 100;
        if (!(amount > 0)) {
            return res.status(422).json({ error: "That payment has no amount" });
        }

        const supabase = getClient();

        // From a Postgres sequence, so two payments saved in the same second
        // cannot share a number. A duplicate receipt reads as tampering later,
        // however innocent it was.
        const { data: receipt, error: receiptError } = await supabase.rpc(
            "next_receipt_number",
        );

        if (receiptError) throw receiptError;

        const { error: insertError } = await supabase.from("payments").insert({
            lot_id: lotId,
            amount,
            // Stripe's own timestamp, not ours. If this arrives late, the
            // ledger should still say when the resident actually paid.
            received_at: new Date((intent.created ?? 0) * 1000).toISOString(),
            method: "portal",
            entered_by: "portal",
            receipt_number: receipt,
            note: "Card payment through the resident portal.",
            stripe_payment_intent_id: intent.id,
        });

        if (insertError) {
            // Stripe retries until it gets a 2xx, so the same payment will
            // arrive again. The unique index catches it; answering 200 stops
            // the retries without ever crediting it twice.
            if (insertError.code === "23505") {
                return res.status(200).json({ ok: true, duplicate: true });
            }
            throw insertError;
        }

        // Where to send the receipt.
        //
        // The address is the one the resident typed on Stripe's page, which
        // lives on the Checkout Session rather than the PaymentIntent. Read
        // through the session rather than by expanding the charge, because
        // that needs no permission this key does not already have.
        //
        // Deliberately after the insert and deliberately forgiving: a receipt
        // we cannot address is a nuisance, but a payment we failed to record
        // because of an address lookup would be a disaster.
        let email = intent.receipt_email ?? null;

        if (!email) {
            try {
                const sessionRes = await fetch(
                    `https://api.stripe.com/v1/checkout/sessions?payment_intent=${encodeURIComponent(
                        intent.id,
                    )}&limit=1`,
                    { headers: { Authorization: `Bearer ${stripeKey}` } },
                );

                const sessions = await sessionRes.json().catch(() => null);
                email = sessions?.data?.[0]?.customer_details?.email ?? null;
            } catch {
                email = null;
            }
        }

        return res.status(201).json({
            ok: true,
            lot_id: lotId,
            lot_number: meta.lot_number ?? null,
            amount,
            receipt_number: receipt,
            paid_at: new Date((intent.created ?? 0) * 1000).toISOString(),
            // Null when Stripe collected no address. The caller should send
            // nothing rather than guess at one.
            email,
        });
    } catch (err) {
        console.error("stripe-rent failed", err?.message ?? err);
        return res.status(500).json({ error: "Could not record that payment" });
    }
}
