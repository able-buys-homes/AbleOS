// routes/stripe-webhook.js
// Stripe -> cockpit, direct. Replaces the two n8n Stripe flows
// ("HTM - Stripe Payment Sync - Live" and "HTM - Application Fee Paid").
// Approved by Ms Dane (CTO), 13 Oct 2026.
//
// POST /api/stripe-webhook   (called by Stripe only)
//
//   payment_intent.succeeded      metadata.kind == "rent"
//       -> the same code n8n calls today: routes/stripe-rent.js
//   checkout.session.completed    metadata.kind == "application_fee", paid
//       -> the same code n8n calls today: PATCH /api/applications?fee=1
//
// Both handlers are reused in-process rather than copied, so the rules that
// decide whether money is recorded live in one place. Both are already safe
// to call twice (a duplicate payment or an already-stamped fee is a no-op),
// which matters while n8n is still on and calls them too.
//
// Safety:
//   - The Stripe signature is checked on the RAW body (HMAC-SHA256, 5-minute
//     tolerance). No valid signature, nothing happens.
//   - Every event id is stored in stripe_webhook_events. A redelivery is
//     answered 200 and skipped.
//   - If recording fails (5xx), the stored id is removed and Stripe gets a
//     500, so Stripe retries later.
//   - Nothing here talks to QuickBooks. Receipt emails stay in n8n for now.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import stripeRent from "./stripe-rent.js";
import applications from "./applications.js";

const TOLERANCE_SECONDS = 300;

let cachedClient = null;

function getClient() {
    if (cachedClient) return cachedClient;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url) throw new Error("SUPABASE_URL is not set");
    if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");

    cachedClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return cachedClient;
}

/**
 * The exact bytes Stripe sent. The signature is over these bytes, so a
 * re-serialised JSON object will not verify. Read from the stream; if the
 * runtime already buffered it as a string or Buffer, use that.
 */
async function readRawBody(req) {
    if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
    if (typeof req.rawBody === "string") return Buffer.from(req.rawBody);

    if (typeof req[Symbol.asyncIterator] === "function" && !req.readableEnded) {
        const chunks = [];
        const read = (async () => {
            for await (const chunk of req) {
                chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            }
        })();
        const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
        await Promise.race([read, timeout]);
        if (chunks.length) return Buffer.concat(chunks);
    }

    return null;
}

/** Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>...] */
export function verifyStripeSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (!rawBody || !header || !secret) return false;

    let timestamp = null;
    const signatures = [];

    for (const part of String(header).split(",")) {
        const [k, v] = part.split("=", 2).map((s) => s?.trim());
        if (k === "t") timestamp = Number(v);
        if (k === "v1" && v) signatures.push(v);
    }

    if (!Number.isFinite(timestamp) || !signatures.length) return false;
    if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.`)
        .update(rawBody)
        .digest("hex");
    const want = Buffer.from(expected, "utf8");

    return signatures.some((sig) => {
        const got = Buffer.from(sig, "utf8");
        return got.length === want.length && crypto.timingSafeEqual(got, want);
    });
}

/** Calls an existing route handler in-process and captures its answer. */
async function callRoute(handler, { method, query = {}, body }) {
    const secret = process.env.N8N_SHARED_SECRET;
    const req = {
        method,
        query,
        body,
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    };
    const result = { status: 200, body: null };
    const res = {
        setHeader() {},
        status(code) { result.status = code; return res; },
        json(payload) { result.body = payload; return res; },
        end() { return res; },
    };
    await handler(req, res);
    return result;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        console.error("stripe-webhook: STRIPE_WEBHOOK_SECRET is not set");
        return res.status(500).json({ error: "Not configured" });
    }
    if (!process.env.N8N_SHARED_SECRET) {
        console.error("stripe-webhook: N8N_SHARED_SECRET is not set");
        return res.status(500).json({ error: "Not configured" });
    }

    const raw = await readRawBody(req);
    if (!raw) {
        console.error("stripe-webhook: raw body unavailable - signature cannot be checked");
        return res.status(400).json({ error: "No raw body" });
    }

    if (!verifyStripeSignature(raw, req.headers["stripe-signature"], secret)) {
        return res.status(400).json({ error: "Bad signature" });
    }

    let event;
    try {
        event = JSON.parse(raw.toString("utf8"));
    } catch {
        return res.status(400).json({ error: "Bad JSON" });
    }

    const eventId = String(event?.id || "");
    const type = String(event?.type || "");
    const object = event?.data?.object ?? {};
    const meta = object.metadata ?? {};

    if (!eventId) return res.status(400).json({ error: "No event id" });

    const supabase = getClient();

    // Claim the event. A second delivery hits the primary key and stops here.
    const { error: claimError } = await supabase.from("stripe_webhook_events").insert({
        id: eventId,
        type,
        livemode: Boolean(event?.livemode),
        object_id: object?.id ? String(object.id) : null,
        result: "processing",
    });

    if (claimError) {
        if (claimError.code === "23505") {
            return res.status(200).json({ ok: true, duplicate: true });
        }
        console.error("stripe-webhook: could not record event", claimError);
        return res.status(500).json({ error: "Could not record event" });
    }

    let outcome;

    try {
        if (type === "payment_intent.succeeded" && meta.kind === "rent") {
            outcome = await callRoute(stripeRent, {
                method: "POST",
                body: { payment_intent_id: object.id },
            });
        } else if (
            type === "checkout.session.completed" &&
            meta.kind === "application_fee" &&
            object.payment_status === "paid"
        ) {
            if (!meta.application_id) {
                outcome = { status: 422, body: { error: "Application fee with no application id" } };
            } else {
                outcome = await callRoute(applications, {
                    method: "PATCH",
                    query: { fee: "1" },
                    body: {
                        id: meta.application_id,
                        amount_cents: object.amount_total,
                        stripe_payment_intent: object.payment_intent,
                    },
                });
            }
        } else {
            outcome = { status: 202, body: { ignored: true } };
        }
    } catch (err) {
        console.error("stripe-webhook: handler threw", err?.message ?? err);
        outcome = { status: 500, body: { error: "threw" } };
    }

    // A server-side failure: release the claim so Stripe's retry is processed.
    if (outcome.status >= 500) {
        await supabase.from("stripe_webhook_events").delete().eq("id", eventId);
        return res.status(500).json({ error: "Could not process, Stripe will retry" });
    }

    const summary = `${outcome.status} ${JSON.stringify(outcome.body ?? {})}`.slice(0, 500);
    await supabase
        .from("stripe_webhook_events")
        .update({ result: summary, processed_at: new Date().toISOString() })
        .eq("id", eventId);

    // 4xx from the money handlers (no lot, fee amount mismatch, unknown
    // application) is a person's problem, not something a retry will fix.
    if (outcome.status >= 400) {
        await supabase.from("notifications").insert({
            recipient: "dane",
            type: "stripe_webhook_problem",
            title: `Stripe ${type} needs a look`,
            body: `Event ${eventId}: ${summary}`.slice(0, 500),
            link: "/raj",
        });
    }

    return res.status(200).json({ ok: true, handled: outcome.status });
}
