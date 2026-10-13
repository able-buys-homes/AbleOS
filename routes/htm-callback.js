// routes/htm-callback.js
// n8n->Grok part 1 (13 Oct 2026). The hometownmeadows.com "call me back" form.
//
// POST /api/htm-callback   { name, phone, email, sms_consent, website }
//
// Public - no login - so: only the HTM site's origins may call it from a
// browser, a honeypot field, and hard length caps. It stores nothing of its
// own. It forwards the request to Coco's Grok callback routine, and if that
// is not set up yet or fails, Raj and Ellery get a notification instead, so
// a person asking to be called back is never silently lost.

import { createClient } from "@supabase/supabase-js";
import { forwardToGrok } from "../lib/grok.js";

const ALLOWED_ORIGINS = [
    "https://hometownmeadows.com",
    "https://www.hometownmeadows.com",
];

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

function clean(value, max) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : null;
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

    // Hidden field a person never sees. Answer as if it worked so bots
    // don't retry.
    if (clean(req.body?.website, 200)) {
        return res.status(200).json({ ok: true });
    }

    const name = clean(req.body?.name, 120);
    const phone = clean(req.body?.phone, 40);
    const email = clean(req.body?.email, 200);

    if (!phone && !email) {
        return res.status(400).json({ error: "Please leave a phone number or an email address" });
    }

    const request = {
        name,
        phone,
        email,
        sms_consent: req.body?.sms_consent === true,
        source: "hometownmeadows.com/callback",
        submitted_at: new Date().toISOString(),
        page_url: clean(String(req.headers.referer ?? ""), 300),
    };

    const result = await forwardToGrok(process.env.GROK_WEBHOOK_CALLBACK_URL, request);

    if (!result.sent) {
        try {
            const supabase = getClient();
            const who = name || phone || email;
            const reach = [phone, email].filter(Boolean).join(" · ");
            const { error } = await supabase.from("notifications").insert(
                ["raj", "ellery"].map((recipient) => ({
                    recipient,
                    type: "callback_request",
                    title: `Callback request: ${who}`,
                    body: `${reach}${request.sms_consent ? " · OK to text" : ""}. From the HTM website. (Not passed to Grok: ${result.reason}.)`,
                    link: "/raj",
                })),
            );
            if (error) throw error;
        } catch (err) {
            console.error("htm-callback: could not forward or notify", err?.message ?? err);
            return res.status(500).json({ error: "Something went wrong. Please call the office." });
        }
    }

    return res.status(200).json({ ok: true });
}
