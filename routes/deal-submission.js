// routes/deal-submission.js
// The only endpoint in this system with no login behind it. A customer
// fills the form on the website and it lands in Raj's review queue.
//
// POST /api/deal-submission
//
// Because it is public, the defences matter more than the feature:
//   - a honeypot field no human ever fills
//   - hard length caps on everything
//   - a per-address rate limit, using a hash so nobody is tracked
//   - it can only ever create an unconfirmed draft

import { createClient } from "@supabase/supabase-js";
import { tryRaiseIntakeAlert } from "../lib/intakeAlert.js";
import { createHash } from "node:crypto";

/** Submissions allowed from one address per hour. */
const RATE_LIMIT = 5;

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
    if (!trimmed) return null;
    return trimmed.slice(0, max);
}

function num(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
        return null;
    }
    const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Salted so the hash can't be reversed against a list of addresses. Reuses
 * the intake secret rather than adding another one to rotate.
 */
function hashIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = String(forwarded || "").split(",")[0].trim() || "unknown";
    const salt = process.env.DEAL_INTAKE_SECRET || "able-os";
    return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Hidden field, styled off-screen on the form. A person never sees it;
    // most bots fill everything. Answer as if it worked so they don't retry.
    if (clean(req.body?.website, 200)) {
        return res.status(200).json({ ok: true });
    }

    const contactName = clean(req.body?.name, 120);
    const address = clean(req.body?.address, 300);
    const email = clean(req.body?.email, 200);
    const phone = clean(req.body?.phone, 40);

    if (!contactName) {
        return res.status(400).json({ error: "Please tell us your name" });
    }
    if (!address) {
        return res.status(400).json({ error: "Please give the property address" });
    }
    if (!email && !phone) {
        return res
            .status(400)
            .json({ error: "Please leave an email address or a phone number" });
    }

    try {
        const supabase = getClient();
        const ipHash = hashIp(req);

        /* ---- Rate limit ---- */
        const anHourAgo = new Date(Date.now() - 3600000).toISOString();

        const { count } = await supabase
            .from("pipeline_deals")
            .select("id", { count: "exact", head: true })
            .eq("submitter_ip_hash", ipHash)
            .eq("origin", "website")
            .gte("created_at", anHourAgo);

        if ((count ?? 0) >= RATE_LIMIT) {
            return res.status(429).json({
                error: "That's a few submissions in a short time. Try again shortly.",
            });
        }

        // Kept as structured answers rather than folded into the notes text,
        // so the review screen can show them as fields and they stay
        // queryable. The notes column holds only what the seller actually
        // typed.
        const submission = {
            role: clean(req.body?.role, 60),
            asset_type: clean(req.body?.assetType, 80),
            current_financing: clean(req.body?.currentFinancing, 60),
            seller_open_to: clean(req.body?.sellerOpenTo, 60),
        };

        const hasAnswers = Object.values(submission).some(Boolean);
        const notes = clean(req.body?.notes, 2000);
        const askingPrice = num(req.body?.askingPrice);
        /* ---- Documents are required ---- */
        // Trust only rows this server issued: the upload endpoint recorded them.
        // Unclaimed means deal_id is still null, so a token cannot be replayed
        // to attach someone else's files to a second deal.
        const uploadToken = clean(req.body?.uploadToken, 40);
        if (!uploadToken) {
            return res
                .status(400)
                .json({ error: "Attach at least one document." });
        }
        const { data: pendingFiles, error: filesError } = await supabase
            .from("deal_submission_files")
            .select("id")
            .eq("submission_token", uploadToken)
            .is("deal_id", null);
        if (filesError) throw new Error(filesError.message);
        if (!pendingFiles || pendingFiles.length === 0) {
            return res
                .status(400)
                .json({ error: "Attach at least one document." });
        }
        const { data, error } = await supabase
            .from("pipeline_deals")
            .insert({
                name: address,
                address,
                purchase_price: askingPrice,
                notes,
                submission: hasAnswers ? submission : null,
                contact_name: contactName,
                contact_email: email,
                contact_phone: phone,
                submitter_ip_hash: ipHash,
                stage: "docs_submitted",
                origin: "website",
                // Pre-filled so nobody has to attribute it by hand - the form
                // is the source, and the review screen can still change it.
                bird_dog: "website",
                // Never confirmed from here. A stranger cannot put a deal on
                // Raj's board - it waits in the same queue as everything else.
                confirmed: false,
            })
            .select("id")
            .single();

        if (error) throw new Error(error.message);
        /* ---- Claim the uploaded files ---- */
        // The deal is saved either way; a failure here leaves the files
        // orphaned rather than losing the lead.
        const { error: claimError } = await supabase
            .from("deal_submission_files")
            .update({ deal_id: data.id })
            .eq("submission_token", uploadToken)
            .is("deal_id", null);
        if (claimError) {
            console.error("Could not attach files to the deal:", claimError);
        }
        /* ---- Tell underwriting ---- */
        // Fired through n8n so the mailbox credentials stay in one place.
        // A missing URL is not an error: the deal is already saved, and an
        // email failing should never lose it.
        const hook = process.env.N8N_DEAL_WEBHOOK_URL;

        if (hook) {
            try {
                await fetch(hook, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        id: data.id,
                        name: contactName,
                        email,
                        phone,
                        address,
                        askingPrice,
                        notes,
                    }),
                    signal: AbortSignal.timeout(8000),
                });
            } catch (err) {
                console.error("Deal submission webhook failed:", err.message);
            }
        }

        return res.status(201).json({ ok: true });
    } catch (err) {
        console.error("deal-submission error:", err);

        // A seller filled in the form and it failed to save. Without this,
        // nobody would ever know - the seller sees an error and gives up.
        // Wrapped again because getClient() itself can throw on bad config,
        // and alerting must never make a failure worse.
        try {
            await tryRaiseIntakeAlert(getClient(), {
                title: "Website deal form failed",
                body: "A seller submitted the form and it did not save. Check the Vercel logs for deal-submission.",
            });
        } catch (alertError) {
            console.error("Could not alert on submission failure:", alertError);
        }

        return res
            .status(500)
            .json({ error: "Something went wrong. Please try again." });
    }
}