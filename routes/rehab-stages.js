// api/rehab-stages.js
// The Able Builds rehab checklist in Notion, including where each stage sits
// in the approval chain.
//
// GET  /api/rehab-stages              both sides (Raj)
// GET  /api/rehab-stages?side=Side A  one side (crew leads)
// POST /api/rehab-stages              save a Drive folder link to a stage and
//                                     put it into the right approval queue
//
// GET and POST live together because they are the same resource, and because
// the Hobby plan caps a deployment at 12 serverless functions.

import { Client } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";
import { requireUser, requireCockpit } from "../lib/apiAuth.js";
import { sendPush } from "../lib/sendPush.js";

const REHAB_DATABASE_ID = "39f97b1c96b680dd9a77d8d83da4793c";

// Zo covers both sides since 3 Sep 2026, so nobody is locked to one any more.
// Kept as a map rather than deleted - a replacement Side A lead gets an entry
// here and the lock returns without touching the query logic.
const LOCKED_SIDE = {};

/**
 * Stages that skip Jeremiah and Karen and go straight to Raj. Before Teardown
 * Photos is a record of the property as found, not a work gate. Must match the
 * same set in api/approve-stage.js and src/features/approvals/ApprovalQueue.tsx.
 */
const DIRECT_TO_RAJ = new Set(["Before Teardown Photos"]);

let cachedSupabase = null;

function getSupabase() {
    if (cachedSupabase) return cachedSupabase;
    cachedSupabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SECRET_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
    return cachedSupabase;
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
    const notion = new Client({ auth: process.env.NOTION_API_KEY });

    /* ---- TEMPORARY: one-time copy of Notion into Supabase (10 Oct 2026) ----
     * POST /api/rehab-stages?copy=1   Dane or Raj only. Safe to run twice.
     * Removed again in the switch-over commit. */
    if (req.method === "POST" && req.query?.copy === "1") {
        try {
            requireCockpit(profile, ["dane", "raj"]);
        } catch (err) {
            return res.status(err?.status || 403).json({ error: err?.message || "Not authorised" });
        }
        if (!process.env.NOTION_API_KEY) {
            return res.status(500).json({ error: "NOTION_API_KEY is not set" });
        }

        async function readAll(databaseId) {
            const db = await notion.databases.retrieve({ database_id: databaseId });
            const dataSourceId = db.data_sources[0].id;
            const out = [];
            let cursor;
            do {
                const page = await notion.dataSources.query({
                    data_source_id: dataSourceId,
                    start_cursor: cursor,
                    page_size: 100,
                });
                out.push(...page.results);
                cursor = page.has_more ? page.next_cursor : undefined;
            } while (cursor);
            return out;
        }

        try {
            const supabase = getSupabase();
            const pages = await readAll(REHAB_DATABASE_ID);
            const rows = pages.map((page) => {
                const p = page.properties;
                return {
                    id: page.id,
                    stage_name: p["Stage Name"]?.rich_text?.map((t) => t.plain_text).join("") || "",
                    side: p["Side"]?.select?.name || "",
                    phase: p["Phase"]?.select?.name || "",
                    status: p["Status"]?.select?.name || "Not Started",
                    work_done: p["Work Done"]?.checkbox || false,
                    photo_uploaded: p["Photo Uploaded"]?.checkbox || false,
                    drive_photo_link: p["Drive Photo Link"]?.url || null,
                    jeremiah_approved: p["Jeremiah Approved"]?.checkbox || false,
                    karen_approved: p["Karen Approved"]?.checkbox || false,
                    raj_approved: p["Raj Approved"]?.checkbox || false,
                    draw_released: p["Draw Released"]?.checkbox || false,
                    notes: p["Notes / Flags"]?.rich_text?.map((t) => t.plain_text).join("") || "",
                    updated_at: page.last_edited_time || new Date().toISOString(),
                    updated_by: "notion-copy",
                };
            });

            const { error: stageError } = await supabase
                .from("rehab_stages")
                .upsert(rows, { onConflict: "id" });
            if (stageError) throw new Error("rehab_stages: " + stageError.message);

            let dealsCopied = 0;
            let dealsError = null;
            try {
                const deals = await readAll("3a397b1c96b680e8af62f3a34a5c6a02");
                const { error } = await supabase.from("notion_deals_archive").upsert(
                    deals.map((d) => ({ notion_page_id: d.id, properties: d.properties })),
                    { onConflict: "notion_page_id" },
                );
                if (error) throw new Error(error.message);
                dealsCopied = deals.length;
            } catch (err) {
                dealsError = err?.message || String(err);
            }

            const count = (f) => rows.filter(f).length;
            return res.status(200).json({
                stagesCopied: rows.length,
                sideA: count((r) => r.side.includes("A")),
                sideB: count((r) => r.side.includes("B")),
                photoUploaded: count((r) => r.photo_uploaded),
                rajApproved: count((r) => r.raj_approved),
                withNotes: count((r) => r.notes),
                dealsCopied,
                dealsError,
            });
        } catch (error) {
            console.error("notion copy failed:", error);
            return res.status(500).json({ error: error?.message || "Copy failed" });
        }
    }

    /* ---- SAVE a photo link ---- */
    if (req.method === "POST") {
        try {
            requireCockpit(profile, ["zo"]);
        } catch (err) {
            return res
                .status(err?.status || 403)
                .json({ error: err?.message || "Not authorised" });
        }

        const { notionPageId, driveUrl, addOnly } = req.body || {};

        if (!notionPageId || !driveUrl) {
            return res
                .status(400)
                .json({ error: "Missing notionPageId or driveUrl" });
        }

        if (!process.env.NOTION_API_KEY) {
            return res.status(500).json({ error: "NOTION_API_KEY is not set" });
        }

        try {
            // Read the stage first - which approvals get reset depends on which
            // stage this is, so we cannot write before we know.
            const page = await notion.pages.retrieve({ page_id: notionPageId });
            const props = page.properties;

            const stageName =
                props["Stage Name"]?.rich_text?.[0]?.plain_text || "A stage";
            const side = props["Side"]?.select?.name || "";
            const phase = props["Phase"]?.select?.name || "";

            const alreadySubmitted = props["Photo Uploaded"]?.checkbox === true;

            // Adding shots to a stage already approved must not drag it back
            // through the gate. The folder is the same, the link is the same -
            // only the contents grew.
            const topUp = Boolean(addOnly) && alreadySubmitted;

            // One gate since 1 Sep 2026. Every stage, top-up or not, goes to
            // Raj - there is nobody else in the chain to route to.
            const approver = "raj";

            await notion.pages.update({
                page_id: notionPageId,
                properties: topUp
                    ? // Nothing to change but the link, and even that is
                      // unchanged - written for safety if it was ever null.
                      { "Drive Photo Link": { url: driveUrl } }
                    : {
                          "Drive Photo Link": { url: driveUrl },
                          "Photo Uploaded": { checkbox: true },
                          // Ticked because those approvals no longer exist as
                          // steps. Left as fields so historic stages still read
                          // correctly, but nothing waits on them.
                          "Jeremiah Approved": { checkbox: true },
                          "Karen Approved": { checkbox: true },
                          "Raj Approved": { checkbox: false },
                          Status: { select: { name: "In Progress" } },
                      },
            });

            const { error: notifyError } = await getSupabase()
                .from("notifications")
                .insert({
                    recipient: approver,
                    type: topUp ? "stage_photos_added" : "stage_awaiting_you",
                    title: topUp
                        ? `More photos on ${stageName}`
                        : `${stageName} needs your approval`,
                    body: topUp
                        ? `${side} - ${phase} - added by ${profile.full_name}, nothing to re-approve`
                        : `${side} - ${phase} - photos from ${profile.full_name}`,
                    link: `/${approver}?stage=${notionPageId}`,
                });

            if (notifyError) {
                console.error("Failed to create notification:", notifyError);
            }

            await sendPush(approver, {
                title: topUp
                    ? `More photos on ${stageName}`
                    : `${stageName} needs your approval`,
                body: topUp
                    ? `${side} - ${phase} - added by ${profile.full_name}`
                    : `${side} - ${phase} - photos from ${profile.full_name}`,
                url: `/${approver}?stage=${notionPageId}`,
            });

            return res.status(200).json({ success: true });
        } catch (error) {
            console.error("Notion update failed:", error);
            return res.status(500).json({
                error: error?.message || "Failed to update Notion",
                code: error?.code,
            });
        }
    }

    /* ---- LIST ---- */
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const requestedSide = req.query?.side;
        const lockedSide = LOCKED_SIDE[profile.cockpit];

        if (lockedSide && requestedSide && requestedSide !== lockedSide) {
            return res
                .status(403)
                .json({ error: "You can only view your own side" });
        }

        const side = lockedSide || requestedSide || null;

        if (side && side !== "Side A" && side !== "Side B") {
            return res
                .status(400)
                .json({ error: 'side must be "Side A" or "Side B"' });
        }

        const database = await notion.databases.retrieve({
            database_id: REHAB_DATABASE_ID,
        });
        const dataSourceId = database.data_sources[0].id;

        const stages = [];
        let cursor = undefined;
        let hasMore = true;

        while (hasMore) {
            const response = await notion.dataSources.query({
                data_source_id: dataSourceId,
                start_cursor: cursor,
                ...(side
                    ? { filter: { property: "Side", select: { equals: side } } }
                    : {}),
            });

            for (const page of response.results) {
                const props = page.properties;
                stages.push({
                    notionPageId: page.id,
                    stageName: props["Stage Name"]?.rich_text?.[0]?.plain_text || "",
                    side: props["Side"]?.select?.name || "",
                    phase: props["Phase"]?.select?.name || "",
                    status: props["Status"]?.select?.name || "Not Started",
                    workDone: props["Work Done"]?.checkbox || false,
                    photoUploaded: props["Photo Uploaded"]?.checkbox || false,
                    drivePhotoLink: props["Drive Photo Link"]?.url || null,
                    jeremiahApproved: props["Jeremiah Approved"]?.checkbox || false,
                    karenApproved: props["Karen Approved"]?.checkbox || false,
                    rajApproved: props["Raj Approved"]?.checkbox || false,
                    drawReleased: props["Draw Released"]?.checkbox || false,
                    notes: props["Notes / Flags"]?.rich_text?.[0]?.plain_text || "",
                });
            }

            hasMore = response.has_more;
            cursor = response.next_cursor || undefined;
        }

        return res.status(200).json({ stages });
    } catch (error) {
        console.error("Notion API error:", error);
        return res
            .status(500)
            .json({ error: "Failed to fetch rehab stages from Notion" });
    }
}