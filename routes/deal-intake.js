// routes/deal-intake.js
// Machine endpoint. n8n posts one email here and it becomes a draft deal.
//
// POST /api/deal-intake
//
// Three jobs, in order:
//   1. Have we read this message before? Stop early, cost nothing.
//   2. Ask Claude what it is.
//   3. Merge into the deal for that thread or property, or create a draft.
//
// There is no user session behind this call, so it authenticates with a
// shared secret. It can only ever create drafts - a deal cannot reach
// Raj's board from here without a person confirming it.

import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { extractDeal } from "../lib/extractDeal.js";
import { tryRaiseIntakeAlert } from "../lib/intakeAlert.js";

const MAX_EXCERPT = 2000;

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
 * Constant-time compare. A plain === leaks the secret one character at a
 * time to anyone patient enough to measure the response.
 */
function secretMatches(supplied) {
    const expected = process.env.DEAL_INTAKE_SECRET;
    if (!expected || typeof supplied !== "string") return false;

    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
}

function clean(value, max) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, max);
}

/** Postgres numerics reject NaN and Infinity, so filter them out here. */
function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Strip an address down to something comparable, so "789 Commerce Blvd,
 * Houston TX 77002" and "789 Commerce Blvd, Houston, TX 77002" match.
 * Short results are discarded - "dallas tx" would merge unrelated deals.
 */
function addressKeyFor(address) {
    if (typeof address !== "string") return null;

    const key = address
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return key.length >= 12 ? key : null;
}

/**
 * Same idea for the deal name. Claude writes addresses inconsistently but
 * tends to name a property the same way, so this catches what address
 * matching misses. Short names are dropped - "duplex" would merge
 * unrelated deals.
 */
function nameKeyFor(name) {
    if (typeof name !== "string") return null;

    const key = name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return key.length >= 12 ? key : null;
}

/**
 * underwriting@ is not a dedicated deal inbox - it also receives SaaS
 * notifications, newsletters and billing mail. These never become deals, so
 * they are filed on arrival rather than put in front of Raj. The row is still
 * stored, so nothing is lost and the filter can be audited.
 */
const NOISE_SENDERS = [
    "gallup.com",
    "e.gallup.com",
    "mail.gallup.com",
    "slack.com",
    "openai.com",
    "email.openai.com",
    "claude.com",
    "email.claude.com",
    "anthropic.com",
    "mail.anthropic.com",
    "otter.ai",
    "high5insights.com",
    "enneagramuniverse.com",
    "accounts.google.com",
    "padmission.com",
];

/** Machine senders, whatever the domain. */
const NOISE_LOCAL_PARTS = ["no-reply", "noreply", "notification", "notifications"];

function isNoise(from) {
    if (typeof from !== "string") return false;

    // "Name <someone@example.com>" or a bare address.
    const match = from.toLowerCase().match(/<([^>]+)>/);
    const address = (match ? match[1] : from.toLowerCase()).trim();

    const [local, domain] = address.split("@");
    if (!domain) return false;

    if (NOISE_SENDERS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
        return true;
    }

    return NOISE_LOCAL_PARTS.some((p) => (local ?? "").startsWith(p));
}

/** Keep what we already had; only fill gaps. */
function fill(existing, incoming) {
    if (existing !== null && existing !== undefined && existing !== "") {
        return existing;
    }
    return incoming;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!secretMatches(req.headers["x-intake-secret"])) {
        // Deliberately vague. Don't tell a prober whether the header was
        // missing, malformed or simply wrong.
        return res.status(401).json({ error: "Not authorised" });
    }

    const messageId = clean(req.body?.messageId, 200);
    const subject = clean(req.body?.subject, 300);

    if (!messageId) {
        return res.status(400).json({ error: "messageId is required" });
    }

    try {
        const supabase = getClient();

        /* ---- 1. Already read this one? ---- */
        const { data: seen } = await supabase
            .from("intake_messages")
            .select("deal_id")
            .eq("message_id", messageId)
            .maybeSingle();

        if (seen) {
            return res
                .status(200)
                .json({ ok: true, duplicate: true, id: seen.deal_id });
        }

        const from = clean(req.body?.from, 300);
        const body = clean(req.body?.body, MAX_EXCERPT);
        const threadId = clean(req.body?.threadId, 200);

        const receivedAt = req.body?.receivedAt
            ? new Date(req.body.receivedAt)
            : new Date();

        const receivedIso = Number.isNaN(receivedAt.getTime())
            ? new Date().toISOString()
            : receivedAt.toISOString();

        /* ---- 2. What is it? ---- */
        // A null means the call failed. Store the email unfilled rather than
        // lose it - an outage should never cost a deal.
        const read = await extractDeal({ from, subject, body });
        const addressKey = addressKeyFor(read?.address);
        const nameKey = nameKeyFor(clean(read?.deal_name, 200) || subject || "");

        /* ---- 3. Same conversation, or same property? ---- */
        let match = null;

        if (threadId) {
            const { data } = await supabase
                .from("pipeline_deals")
                .select("*")
                .eq("email_thread_id", threadId)
                .order("created_at", { ascending: true })
                .limit(1);

            match = data?.[0] ?? null;
        }

        if (!match && addressKey) {
            const { data } = await supabase
                .from("pipeline_deals")
                .select("*")
                .eq("address_key", addressKey)
                .order("created_at", { ascending: true })
                .limit(1);

            match = data?.[0] ?? null;
        }

        if (!match && nameKey) {
            const { data } = await supabase
                .from("pipeline_deals")
                .select("*")
                .eq("name_key", nameKey)
                .order("created_at", { ascending: true })
                .limit(1);

            match = data?.[0] ?? null;
        }

        const now = new Date().toISOString();

        if (match) {
            // A thread that opens as chatter and later carries financials
            // should come back out of the bin.
            const revive =
                match.dismissed_by === "claude" &&
                read?.is_deal === true &&
                (read?.confidence ?? 0) >= 0.8;

            const { error: mergeError } = await supabase
                .from("pipeline_deals")
                .update({
                    address: fill(match.address, clean(read?.address, 300)),
                    source: fill(match.source, clean(read?.source, 100)),
                    notes: fill(match.notes, clean(read?.notes, 2000)),
                    purchase_price: fill(match.purchase_price, num(read?.purchase_price)),
                    monthly_cash_flow: fill(
                        match.monthly_cash_flow,
                        num(read?.monthly_cash_flow),
                    ),
                    dscr: fill(match.dscr, num(read?.dscr)),
                    bird_dog: fill(match.bird_dog, "underwriting"),
                    address_key: fill(match.address_key, addressKey),
                    name_key: fill(match.name_key, nameKey),
                    email_thread_id: fill(match.email_thread_id, threadId),
                    email_count: (match.email_count ?? 1) + 1,
                    dismissed_at: revive ? null : match.dismissed_at,
                    dismissed_by: revive ? null : match.dismissed_by,
                    updated_at: now,
                })
                .eq("id", match.id);

            if (mergeError) throw new Error(mergeError.message);

            await supabase
                .from("intake_messages")
                .insert({ message_id: messageId, deal_id: match.id });

            return res.status(200).json({ ok: true, id: match.id, merged: true });
        }

        // Confidently not a deal? File it rather than putting it in front of
        // Raj. The row stays so you can audit what the model binned.
        const noisySender = isNoise(from);

        const autoDismissed =
            noisySender ||
            (read && read.is_deal === false && (read.confidence ?? 0) >= 0.8);

        const { data: created, error } = await supabase
            .from("pipeline_deals")
            .insert({
                name:
                    clean(read?.deal_name, 200) || subject || "Untitled deal from email",
                address: clean(read?.address, 300),
                address_key: addressKey,
                name_key: nameKey,
                source: clean(read?.source, 100),
                notes: clean(read?.notes, 2000),
                purchase_price: num(read?.purchase_price),
                monthly_cash_flow: num(read?.monthly_cash_flow),
                dscr: num(read?.dscr),
                extracted: read ?? null,
                stage: "docs_submitted",
                origin: "email",
                // Pre-attributed so nobody has to set it by hand. The review
                // screen can still change it.
                bird_dog: "underwriting",
                email_message_id: messageId,
                email_thread_id: threadId,
                email_from: from,
                email_subject: subject,
                email_received_at: receivedIso,
                email_excerpt: body,
                email_count: 1,
                confirmed: false,
                dismissed_at: autoDismissed ? now : null,
                // Distinguish the two, so the denylist can be audited separately
                // from the model's judgement.
                dismissed_by: autoDismissed ? (noisySender ? "filter" : "claude") : null,
            })
            .select("id")
            .single();

        if (error) throw new Error(error.message);

        await supabase
            .from("intake_messages")
            .insert({ message_id: messageId, deal_id: created.id });

        return res.status(201).json({
            ok: true,
            id: created.id,
            isDeal: read?.is_deal ?? null,
            dismissed: Boolean(autoDismissed),
        });
    } catch (err) {
        console.error("deal-intake error:", err);

        // Belt and braces. n8n's error workflow should catch this too, but a
        // server-side alert still fires if that workflow is ever misconfigured.
        try {
            await tryRaiseIntakeAlert(getClient(), {
                title: "Deal intake failed",
                body: "An email reached the intake endpoint and could not be recorded. Check the Vercel logs for deal-intake.",
            });
        } catch (alertError) {
            console.error("Could not alert on intake failure:", alertError);
        }

        return res.status(500).json({ error: "Could not record the email" });
    }
}