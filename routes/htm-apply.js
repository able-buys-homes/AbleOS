// routes/htm-apply.js
// The hometownmeadows.com application form, straight to the cockpit.
// Replaces n8n "HTM - Application Submission" (14 Oct 2026). Same steps, same
// shapes, so the website only needs its VITE_HTM_WEBHOOK_URL changed:
//
//   1. Save the application - the existing /api/applications code, called
//      in-process, so the fee, the PDF and Ellery's pipeline stay in one place.
//   2. Create the Stripe Checkout for $25 x adults, exactly as n8n did
//      (metadata kind=application_fee, application_id, reference), so the
//      cockpit Stripe webhook marks the fee paid.
//   3. Answer the website with { reference, checkout_url, fee, adults,
//      application_id, poll_token } - the keys src/pages/Apply.tsx reads.
//   4. Forward a copy to Grok (GROK_WEBHOOK_APP_URL) if configured.
//
// The application is saved before anything else. A Stripe or Grok failure
// never loses it: the site then tells the applicant to call the office.
//
// Public endpoint: HTM origins only (CORS), honeypot, size caps, and a
// park-wide ceiling on submissions per hour.

import { createClient } from "@supabase/supabase-js";
import applications from "./applications.js";
import { forwardToGrok } from "../lib/grok.js";

const ALLOWED_ORIGINS = [
    "https://hometownmeadows.com",
    "https://www.hometownmeadows.com",
];
const SITE = "https://hometownmeadows.com/apply";
const FEE_PER_ADULT_CENTS = 2500;
const MAX_PER_HOUR = 30;
const MAX_BODY_CHARS = 200_000;

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

/** Same format n8n and the receipt use: HTM- + first 8 hex of the id. */
export function referenceFor(id) {
    return id ? `HTM-${String(id).replace(/-/g, "").slice(0, 8).toUpperCase()}` : "";
}

/** The Stripe Checkout form body, field for field what n8n sent. */
export function checkoutForm({ id, pollToken, reference, adults, email }) {
    const back = `&app=${encodeURIComponent(id)}&t=${encodeURIComponent(pollToken)}`;
    const form = {
        mode: "payment",
        client_reference_id: id,
        success_url: `${SITE}?paid=1&ref=${reference}${back}`,
        cancel_url: `${SITE}?paid=0&ref=${reference}${back}`,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(FEE_PER_ADULT_CENTS),
        "line_items[0][price_data][product_data][name]": "Hometown Meadows application fee",
        "line_items[0][quantity]": String(adults),
        "metadata[kind]": "application_fee",
        "metadata[application_id]": id,
        "metadata[reference]": reference,
        "payment_intent_data[metadata][kind]": "application_fee",
        "payment_intent_data[metadata][application_id]": id,
        "payment_intent_data[description]": `Application fee ${reference}`,
    };
    if (email) form.customer_email = email;
    return Object.entries(form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
}

async function callApplications(body) {
    const req = {
        method: "POST",
        query: {},
        body,
        headers: {
            authorization: `Bearer ${process.env.N8N_SHARED_SECRET}`,
            "content-type": "application/json",
        },
    };
    const out = { status: 200, body: null };
    const res = {
        setHeader() {},
        status(c) { out.status = c; return res; },
        json(b) { out.body = b; return res; },
        end() { return res; },
    };
    await applications(req, res);
    return out;
}

export default async function handler(req, res) {
    const origin = String(req.headers.origin ?? "");
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, OPTIONS");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const b = req.body;
    if (!b || typeof b !== "object") {
        return res.status(400).json({ error: "No application was sent" });
    }
    // Honeypot - the form never sends this field; bots that fill everything do.
    if (typeof b.website === "string" && b.website.trim()) {
        return res.status(200).json({ ok: true });
    }
    if (JSON.stringify(b).length > MAX_BODY_CHARS) {
        return res.status(413).json({ error: "That application is too large" });
    }
    if (!process.env.N8N_SHARED_SECRET) {
        console.error("htm-apply: N8N_SHARED_SECRET is not set");
        return res.status(500).json({ error: "Not configured" });
    }

    // Park-wide ceiling. A real park does not get 30 applications an hour.
    try {
        const anHourAgo = new Date(Date.now() - 3600000).toISOString();
        const { count } = await getClient()
            .from("htm_applications")
            .select("id", { count: "exact", head: true })
            .eq("source", "website")
            .gte("created_at", anHourAgo);
        if ((count ?? 0) >= MAX_PER_HOUR) {
            return res.status(429).json({ error: "Too many applications right now. Please call the office." });
        }
    } catch (err) {
        console.error("htm-apply: rate check failed", err?.message ?? err);
    }

    // 1. Save it.
    const saved = await callApplications(b);
    if (saved.status >= 400 || !saved.body?.id) {
        return res.status(saved.status >= 400 ? saved.status : 500).json({
            error: saved.body?.error || "Could not save the application",
        });
    }

    const id = String(saved.body.id);
    const pollToken = String(saved.body.poll_token ?? "");
    const feeCents = Number(saved.body.fee_cents) || 0;
    const adults = Number(saved.body.adults) || 0;
    const reference = referenceFor(id);
    const email = typeof b.applicant_email === "string" ? b.applicant_email.trim().slice(0, 200) : "";

    // 2. Stripe Checkout. A failure leaves checkout_url null; the site then
    // tells the applicant the application is saved and to call the office.
    let checkoutUrl = null;
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey && adults > 0) {
        try {
            const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${stripeKey}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: checkoutForm({ id, pollToken, reference, adults, email }),
                signal: AbortSignal.timeout(8000),
            });
            const s = await r.json().catch(() => null);
            if (r.ok && s?.url) checkoutUrl = s.url;
            else console.error("htm-apply: checkout refused", s?.error?.message ?? r.status);
        } catch (err) {
            console.error("htm-apply: checkout failed", err?.message ?? err);
        }
    } else {
        console.error("htm-apply: no STRIPE_SECRET_KEY or no adults - no checkout");
    }

    // 4. Copy to Grok, if its routine is configured. Never blocks the answer.
    await forwardToGrok(process.env.GROK_WEBHOOK_APP_URL, {
        reference,
        application_id: id,
        lot: b.lot ?? null,
        applying_for: b.applying_for ?? null,
        applicant_name: b.applicant_name ?? null,
        applicant_email: email || null,
        applicant_phone: b.applicant_phone ?? null,
        adults,
        fee: feeCents / 100,
        checkout_url: checkoutUrl,
        paid: false,
        received_at: new Date().toISOString(),
    });

    // 3. The answer the website reads.
    return res.status(200).json({
        reference,
        checkout_url: checkoutUrl,
        fee: feeCents / 100,
        adults,
        application_id: id,
        poll_token: pollToken,
    });
}
