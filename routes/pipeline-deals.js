// routes/pipeline-deals.js
// Draft deals waiting on a human. An email can create a draft; only a
// person can put it on the board.
//
// GET   /api/pipeline-deals   list drafts waiting for review
// PATCH /api/pipeline-deals   confirm one onto the board, or dismiss it

import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../lib/apiAuth.js";

const STAGES = [
    "docs_submitted",
    "underwriting",
    "final_review",
    "proof_of_funds",
    "submit_to_broker",
    "awaiting_signatures",
    "under_contract",
    "funded_emd",
    "due_diligence",
    "coe",
    "dead",
];

const ALLOWED_COCKPITS = ["raj", "dane"];

// Fixed list on purpose. Chirag is paid on attribution, so this is a
// money field - it gets chosen, never inferred from an email.
const BIRD_DOGS = ["rex", "chirag", "direct", "other"];

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

function money(value) {
    if (value === undefined || value === null || String(value).trim() === "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default async function handler(req, res) {
    let caller;
    try {
        caller = await requireUser(req);
    } catch (err) {
        return res
            .status(err?.status || 401)
            .json({ error: err?.message || "Not authorised" });
    }

    const { profile } = caller;

    if (!ALLOWED_COCKPITS.includes(profile.cockpit)) {
        return res.status(403).json({ error: "No access to the deal pipeline" });
    }

    try {
        const supabase = getClient();

        /* ---- LIST DRAFTS ---- */
        if (req.method === "GET") {
            const { data, error } = await supabase
                .from("pipeline_deals")
                .select("*")
                .eq("confirmed", false)
                .is("dismissed_at", null)
                .order("created_at", { ascending: false })
                .limit(200);

            if (error) throw new Error(error.message);

            const drafts = data ?? [];

            // One extra query rather than 200. Raj needs to see at a glance
            // which emails arrived with documents attached.
            const ids = drafts.map((draft) => draft.id);
            const counts = new Map();

            if (ids.length) {
                const { data: files, error: filesError } = await supabase
                    .from("deal_submission_files")
                    .select("deal_id")
                    .in("deal_id", ids);

                if (filesError) throw new Error(filesError.message);

                for (const row of files ?? []) {
                    counts.set(row.deal_id, (counts.get(row.deal_id) ?? 0) + 1);
                }
            }

            return res.status(200).json({
                drafts: drafts.map((draft) => ({
                    ...draft,
                    file_count: counts.get(draft.id) ?? 0,
                })),
            });
        }

        /* ---- CONFIRM OR DISMISS ---- */
        if (req.method === "PATCH") {
            const id = clean(req.body?.id, 64);
            const action = req.body?.action;

            if (!id) return res.status(400).json({ error: "id is required" });

            const now = new Date().toISOString();

            if (action === "dismiss") {
                const { data, error } = await supabase
                    .from("pipeline_deals")
                    .update({
                        dismissed_at: now,
                        dismissed_by: profile.cockpit,
                        updated_at: now,
                    })
                    .eq("id", id)
                    .eq("confirmed", false)
                    .select("id")
                    .single();

                if (error && error.code !== "PGRST116") throw new Error(error.message);
                if (!data) {
                    return res
                        .status(409)
                        .json({ error: "That draft was already handled" });
                }

                return res.status(200).json({ ok: true, id, action: "dismissed" });
            }

            if (action === "confirm") {
                const name = clean(req.body?.name, 200);
                if (!name) {
                    return res.status(400).json({ error: "A deal name is required" });
                }

                const stage = req.body?.stage || "docs_submitted";
                if (!STAGES.includes(stage)) {
                    return res.status(400).json({ error: "Unknown stage" });
                }

                const birdDog = clean(req.body?.birdDog, 20);
                if (birdDog && !BIRD_DOGS.includes(birdDog)) {
                    return res.status(400).json({ error: "Unknown bird dog" });
                }

                const { data, error } = await supabase
                    .from("pipeline_deals")
                    .update({
                        name,
                        address: clean(req.body?.address, 300),
                        source: clean(req.body?.source, 100),
                        bird_dog: birdDog,
                        notes: clean(req.body?.notes, 2000),
                        purchase_price: money(req.body?.purchasePrice),
                        monthly_cash_flow: money(req.body?.monthlyCashFlow),
                        dscr: money(req.body?.dscr),
                        stage,
                        stage_changed_at: now,
                        moved_by: profile.cockpit,
                        confirmed: true,
                        confirmed_by: profile.cockpit,
                        confirmed_at: now,
                        updated_at: now,
                    })
                    .eq("id", id)
                    .eq("confirmed", false)
                    .is("dismissed_at", null)
                    .select()
                    .single();

                if (error && error.code !== "PGRST116") throw new Error(error.message);
                if (!data) {
                    return res
                        .status(409)
                        .json({ error: "That draft was already handled" });
                }

                return res.status(200).json({ ok: true, deal: data });
            }

            return res
                .status(400)
                .json({ error: "action must be confirm or dismiss" });
        }

        res.setHeader("Allow", "GET, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("pipeline-deals error:", err);
        return res.status(500).json({ error: "Could not load draft deals" });
    }
}