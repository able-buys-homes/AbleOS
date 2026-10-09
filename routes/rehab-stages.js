// api/rehab-stages.js
// The Able Builds rehab checklist (Supabase rehab_stages since 10 Oct 2026 -
// it used to live in Notion), including where each stage sits
// in the approval chain.
//
// GET  /api/rehab-stages              both sides (Raj)
// GET  /api/rehab-stages?side=Side A  one side (crew leads)
// POST /api/rehab-stages              save a Drive folder link to a stage and
//                                     put it into the right approval queue
//
// GET and POST live together because they are the same resource, and because
// the Hobby plan caps a deployment at 12 serverless functions.

import { createClient } from "@supabase/supabase-js";
import { requireUser, requireCockpit } from "../lib/apiAuth.js";
import { sendPush } from "../lib/sendPush.js";

// Stage ids are the old Notion page ids, kept so notification links
// (?stage=<id>) and social_queue rows still match.

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

        try {
            // Read the stage first - which approvals get reset depends on which
            // stage this is, so we cannot write before we know.
            const supabase = getSupabase();
            const { data: row, error: readError } = await supabase
                .from("rehab_stages")
                .select("stage_name, side, phase, photo_uploaded")
                .eq("id", notionPageId)
                .maybeSingle();
            if (readError) throw new Error(readError.message);
            if (!row) return res.status(404).json({ error: "Stage not found" });

            const stageName = row.stage_name || "A stage";
            const side = row.side || "";
            const phase = row.phase || "";

            const alreadySubmitted = row.photo_uploaded === true;

            // Adding shots to a stage already approved must not drag it back
            // through the gate. The folder is the same, the link is the same -
            // only the contents grew.
            const topUp = Boolean(addOnly) && alreadySubmitted;

            // One gate since 1 Sep 2026. Every stage, top-up or not, goes to
            // Raj - there is nobody else in the chain to route to.
            const approver = "raj";
            const now = new Date().toISOString();

            const { error: writeError } = await supabase
                .from("rehab_stages")
                .update(
                    topUp
                        ? { drive_photo_link: driveUrl, updated_at: now, updated_by: profile.cockpit }
                        : {
                              drive_photo_link: driveUrl,
                              photo_uploaded: true,
                              // Ticked because those approvals no longer exist as
                              // steps. Kept so historic stages still read correctly.
                              jeremiah_approved: true,
                              karen_approved: true,
                              raj_approved: false,
                              status: "In Progress",
                              updated_at: now,
                              updated_by: profile.cockpit,
                          },
                )
                .eq("id", notionPageId);
            if (writeError) throw new Error(writeError.message);

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
            console.error("rehab stage update failed:", error);
            return res.status(500).json({
                error: error?.message || "Failed to update the stage",
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

        let query = getSupabase().from("rehab_stages").select("*");
        if (side) query = query.eq("side", side);
        const { data, error: listError } = await query;
        if (listError) throw new Error(listError.message);

        const stages = (data ?? []).map((r) => ({
            notionPageId: r.id,
            stageName: r.stage_name || "",
            side: r.side || "",
            phase: r.phase || "",
            status: r.status || "Not Started",
            workDone: r.work_done || false,
            photoUploaded: r.photo_uploaded || false,
            drivePhotoLink: r.drive_photo_link || null,
            jeremiahApproved: r.jeremiah_approved || false,
            karenApproved: r.karen_approved || false,
            rajApproved: r.raj_approved || false,
            drawReleased: r.draw_released || false,
            notes: r.notes || "",
        }));

        return res.status(200).json({ stages });
    } catch (error) {
        console.error("rehab stages list error:", error);
        return res
            .status(500)
            .json({ error: "Failed to fetch rehab stages" });
    }
}