// routes/deals.js
// Deal pipeline. Legacy Notion deals live in notion_deals_archive (Notion was
// removed 10 Oct 2026); deal identity (name, address, source),
// Supabase holds the workflow state (stage, when it moved, who moved it).
//
// GET    /api/deals    list deals with their current stage
// PATCH  /api/deals    move a deal to a different stage
//
// Every request must carry a valid Supabase session as a Bearer token.
// The caller's role comes from the profiles table, never from the request body.

import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../lib/apiAuth.js";


// Must stay identical to the check constraint on public.deal_stages.
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

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Import residue, not live deals.
const EXCLUDED_CATEGORY = "Orphaned - source tab";

/**
 * The deals imported from Notion are legacy noise while we build email
 * intake, so the board starts clean. Flip to true to bring them back -
 * nothing has been deleted, and their stages are still in deal_stages.
 */
const SHOW_NOTION_DEALS = false;

// Rex reads his own deals, Ellery needs them for documents, Raj owns the board.
// Dane was here for testing only.
const ALLOWED_COCKPITS = ["raj", "rex", "ellery"];

// Rex works his own deals in the field but doesn't run the pipeline.
const CAN_MOVE_STAGES = ["raj", "dane"];

let cachedSupabase = null;

function getSupabase() {
    if (cachedSupabase) return cachedSupabase;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;

    if (!url) throw new Error("SUPABASE_URL is not set");
    if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");

    cachedSupabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return cachedSupabase;
}

function plain(prop) {
    if (!prop) return "";
    if (prop.type === "title") return prop.title.map((t) => t.plain_text).join("");
    if (prop.type === "rich_text") {
        return prop.rich_text.map((t) => t.plain_text).join("");
    }
    if (prop.type === "select") return prop.select?.name ?? "";
    return "";
}

function daysBetween(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.floor(ms / 86400000));
}

async function fetchNotionDeals() {
    // Copied whole from Notion on 10 Oct 2026 before Notion was removed, so
    // flipping SHOW_NOTION_DEALS back on still works.
    const { data, error } = await getSupabase()
        .from("notion_deals_archive")
        .select("notion_page_id, properties");
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((r) => ({ id: r.notion_page_id, properties: r.properties }));

    return rows
        .map((row) => ({
            id: row.id,
            name: plain(row.properties["Deal Name"]) || "Untitled deal",
            address: plain(row.properties["Address"]),
            source: plain(row.properties["Deal Source"]) || "Unassigned",
            category: plain(row.properties["Category"]),
            notes: plain(row.properties["Notes"]),
        }))
        .filter((deal) => deal.category !== EXCLUDED_CATEGORY);
}

export default async function handler(req, res) {
    // ---- Authenticate before anything else ----
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
        const supabase = getSupabase();

        /* ---- LIST ---- */
        if (req.method === "GET") {
            // Skipping the Notion call entirely while the legacy deals are
            // hidden keeps the request fast and avoids burning API quota.
            // Legacy Notion deals have no bird dog, so they can't be scoped
            // to Rex. He never sees them.
            const deals =
                SHOW_NOTION_DEALS && profile.cockpit !== "rex"
                    ? await fetchNotionDeals()
                    : [];

            // Deals born inside Able OS - confirmed drafts from the
            // underwriting inbox. Their stage lives on the row itself.
            let ownQuery = supabase
                .from("pipeline_deals")
                .select("*")
                .eq("confirmed", true)
                .is("dismissed_at", null);

            // Scoped by cockpit, not by a name in a query parameter.
            if (profile.cockpit === "rex") {
                ownQuery = ownQuery.eq("bird_dog", "rex");
            }

            const { data: ownRows, error: ownError } = await ownQuery;

            if (ownError) throw new Error(ownError.message);

            const ownDeals = (ownRows ?? []).map((row) => ({
                id: row.id,
                name: row.name,
                address: row.address ?? "",
                source: row.source ?? "Unassigned",
                category: "",
                notes: row.notes ?? "",
                stage: row.stage,
                stageChangedAt: row.stage_changed_at,
                movedBy: row.moved_by,
                daysInStage: daysBetween(row.stage_changed_at),
                birdDog: row.bird_dog,
                purchasePrice: row.purchase_price,
                monthlyCashFlow: row.monthly_cash_flow,
                dscr: row.dscr,
            }));

            if (deals.length === 0) {
                return res.status(200).json({ deals: ownDeals, stages: STAGES });
            }

            const { data: rows, error } = await supabase
                .from("deal_stages")
                .select("notion_page_id, stage, stage_changed_at, moved_by");

            if (error) throw new Error(error.message);

            const byId = new Map((rows ?? []).map((r) => [r.notion_page_id, r]));

            const merged = deals.map((deal) => {
                const state = byId.get(deal.id);
                return {
                    ...deal,
                    stage: state?.stage ?? "docs_submitted",
                    stageChangedAt: state?.stage_changed_at ?? null,
                    movedBy: state?.moved_by ?? null,
                    daysInStage: daysBetween(state?.stage_changed_at),
                };
            });

            return res
                .status(200)
                .json({ deals: [...ownDeals, ...merged], stages: STAGES });
        }

        /* ---- MOVE ---- */
        if (req.method === "PATCH") {
            if (!CAN_MOVE_STAGES.includes(profile.cockpit)) {
                return res
                    .status(403)
                    .json({ error: "Only Raj moves deals between stages" });
            }
            const id = typeof req.body?.id === "string" ? req.body.id.trim() : "";
            const stage =
                typeof req.body?.stage === "string" ? req.body.stage.trim() : "";

            if (!id || id.length > 64) {
                return res.status(400).json({ error: "A valid deal id is required" });
            }
            if (!STAGES.includes(stage)) {
                return res.status(400).json({ error: "Unknown stage" });
            }

            const now = new Date().toISOString();

            // Deals created in Able OS keep their stage on the row itself,
            // so they never touch deal_stages.
            if (UUID_RE.test(id)) {
                const { data: own, error: ownError } = await supabase
                    .from("pipeline_deals")
                    .update({
                        stage,
                        stage_changed_at: now,
                        moved_by: profile.cockpit,
                        updated_at: now,
                    })
                    .eq("id", id)
                    .eq("confirmed", true)
                    .select("id")
                    .maybeSingle();

                if (ownError) throw new Error(ownError.message);

                if (own) {
                    return res
                        .status(200)
                        .json({ ok: true, id, stage, stageChangedAt: now });
                }
            }

            const { error } = await supabase.from("deal_stages").upsert(
                {
                    notion_page_id: id,
                    stage,
                    stage_changed_at: now,
                    moved_by: profile.cockpit,
                    updated_at: now,
                },
                { onConflict: "notion_page_id" },
            );

            if (error) throw new Error(error.message);

            return res.status(200).json({ ok: true, id, stage, stageChangedAt: now });
        }

        res.setHeader("Allow", "GET, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("deals error:", err);
        return res.status(500).json({ error: "Could not load deals" });
    }
}