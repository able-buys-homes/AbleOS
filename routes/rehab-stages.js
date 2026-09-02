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

// Crew leads only ever see their own side, whatever they ask for.
const LOCKED_SIDE = { colton: "Side A", zo: "Side B" };

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

    /* ---- SAVE a photo link ---- */
    if (req.method === "POST") {
        try {
            requireCockpit(profile, ["colton", "zo"]);
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