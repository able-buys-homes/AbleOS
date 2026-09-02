// routes/ops-alert.js
// One way for a machine to put something in Raj's cockpit.
//
// POST /api/ops-alert   header x-intake-secret
//       { title, body, link? }
//
// Used by the n8n error workflow and the uptime monitor. Deliberately generic:
// the alternative was bending intake-health into carrying unrelated alerts,
// which is how an endpoint ends up meaning three things.
//
// The cockpit notification is the convenient channel, not the reliable one -
// if the cockpit is what broke, this call fails too. That is why every caller
// also sends an email. Two channels, different failure modes.
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { sendPush } from "../lib/sendPush.js";

/** Don't pile on while an unread warning of the same kind is already sitting there. */
const RENOTIFY_AFTER_MINUTES = 60;

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

function secretMatches(supplied) {
    const expected = process.env.DEAL_INTAKE_SECRET;
    if (!expected || typeof supplied !== "string") return false;

    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
}

function clean(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!secretMatches(req.headers["x-intake-secret"])) {
        return res.status(401).json({ error: "Not authorised" });
    }

    const title = clean(req.body?.title, 200);
    const body = clean(req.body?.body, 600);
    const link = clean(req.body?.link, 300) || "/raj";

    if (!title) return res.status(400).json({ error: "title is required" });

    try {
        const supabase = getClient();

        // Same title unread within the window means Raj already knows. A
        // workflow failing every five minutes should not produce 12 rows an hour.
        const since = new Date(
            Date.now() - RENOTIFY_AFTER_MINUTES * 60000,
        ).toISOString();

        const { count, error: countError } = await supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("recipient", "raj")
            .eq("type", "ops_alert")
            .eq("title", title)
            .is("read_at", null)
            .gte("created_at", since);

        if (countError) throw countError;

        if ((count ?? 0) > 0) {
            return res.status(200).json({ ok: true, alerted: false, reason: "already warned" });
        }

        const { error: insertError } = await supabase.from("notifications").insert({
            recipient: "raj",
            type: "ops_alert",
            title,
            body: body || null,
            link,
        });

        if (insertError) throw insertError;

        // Push is best effort. A failed push must not fail the alert.
        try {
            await sendPush("raj", { title, body, url: link, tag: "ops-alert" });
        } catch (err) {
            console.error("ops-alert push failed:", err);
        }

        return res.status(200).json({ ok: true, alerted: true });
    } catch (err) {
        console.error("ops-alert failed:", err);
        return res.status(500).json({ error: "Could not raise the alert" });
    }
}