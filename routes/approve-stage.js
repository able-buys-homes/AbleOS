// api/approve-stage.js
// Moves a rehab stage along the approval chain:
//
//   Colton / Zo  ->  Jeremiah  ->  Karen  ->  Raj
//
// Each approver can only act when the step before them is complete. A decline
// sends the stage straight back to the crew lead with a required note.

import { createClient } from "@supabase/supabase-js";
import { JWT } from "google-auth-library";
import { requireUser, requireCockpit } from "../lib/apiAuth.js";
import { sendPush } from "../lib/sendPush.js";
import { getFolderId } from "./drive-upload-url.js";

// Stages live in Supabase rehab_stages since 10 Oct 2026 (was Notion).

// Zo covers both sides since Colton left on 3 Sep 2026. The reporting line did
// not change - Colton always answered to Zo on HTM work - only the cockpit
// mapping did. When a replacement lead is hired they get their own cockpit and
// Side A moves back; not built for now.
const CREW_LEAD = { "Side A": "zo", "Side B": "zo" };

// Who approves at each step, and what must already be true for them to act.
/**
 * Stages that skip Jeremiah and Karen and go straight to Raj. Must match the
 * same set in api/rehab-stages.js.
 */
// Kept so api/rehab-stages.js, which imports the same idea, still agrees.
// Every stage goes straight to Raj now, so this no longer distinguishes
// anything - remove it once rehab-stages.js is updated too.
const DIRECT_TO_RAJ = new Set(["Before Teardown Photos"]);

// Rewired 1 Sep 2026. Jeremiah and Karen are gone, so the chain is one gate:
// the crew uploads, Raj signs off. Their approval columns are left in
// place - clearing them would rewrite the history of stages they did approve.
const CHAIN = {
    raj: { column: "raj_approved", next: null },
};

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

/**
 * Empties a stage's Drive folder. Declined photos shouldn't linger and get
 * mixed in with the replacements the crew uploads next.
 */
async function purgeStageFolder(side, stageName) {
    const folderId = getFolderId(side, stageName);
    if (!folderId) return 0;

    const b64 = process.env.GOOGLE_SA_KEY_B64;
    if (!b64) return 0;

    const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    const jwt = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const { token } = await jwt.getAccessToken();
    const auth = { Authorization: `Bearer ${token}` };

    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1000`,
        { headers: auth },
    );
    if (!listRes.ok) throw new Error(await listRes.text());

    const { files = [] } = await listRes.json();

    for (const file of files) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
            method: "DELETE",
            headers: auth,
        });
    }

    return files.length;
}

function readStage(row) {
    return {
        stageName: row.stage_name || "",
        side: row.side || "",
        phase: row.phase || "",
        photoUploaded: row.photo_uploaded || false,
        jeremiahApproved: row.jeremiah_approved || false,
        karenApproved: row.karen_approved || false,
        rajApproved: row.raj_approved || false,
    };
}

/**
 * One gate now. The photo is still mandatory - that was never Jeremiah's or
 * Karen's rule, it is the rule.
 */
function canAct(cockpit, stage) {
    if (!stage.photoUploaded) return "No photo has been uploaded yet";

    if (cockpit === "raj") {
        return stage.rajApproved ? "You already approved this stage" : null;
    }

    return "You don't have permission to approve stages";
}

/**
 * Once someone approves or declines, their own "needs your approval" notice is
 * obsolete. Delete it so it disappears from their bell rather than sitting
 * there after the decision is already made.
 */
async function clearGateNotice(supabase, cockpit, notionPageId) {
    const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("recipient", cockpit)
        .eq("type", "stage_awaiting_you")
        .eq("link", `/${cockpit}?stage=${notionPageId}`);

    // Never fail the approval over a housekeeping delete.
    if (error) console.error("Could not clear the gate notification:", error);
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    let caller;
    try {
        caller = await requireUser(req);
        requireCockpit(caller.profile, ["raj"]);
    } catch (err) {
        return res
            .status(err?.status || 401)
            .json({ error: err?.message || "Not authorised" });
    }

    const { profile } = caller;
    const { notionPageId, decision, note } = req.body || {};

    if (!notionPageId) {
        return res.status(400).json({ error: "notionPageId is required" });
    }
    if (decision !== "approve" && decision !== "decline") {
        return res.status(400).json({ error: "decision must be approve or decline" });
    }

    const trimmedNote = typeof note === "string" ? note.trim() : "";
    if (decision === "decline" && trimmedNote.length < 5) {
        return res
            .status(400)
            .json({ error: "A note is required so the crew knows what to redo" });
    }

    try {
        const { data: row, error: readError } = await getSupabase()
            .from("rehab_stages")
            .select("*")
            .eq("id", notionPageId)
            .maybeSingle();
        if (readError) throw new Error(readError.message);
        if (!row) return res.status(404).json({ error: "Stage not found" });
        const stage = readStage(row);

        const blocked = canAct(profile.cockpit, stage);
        if (blocked) return res.status(409).json({ error: blocked });

        const supabase = getSupabase();
        const crewLead = CREW_LEAD[stage.side];
        const stamp = new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
        });

        if (decision === "decline") {
            // Clear the photos first. If this fails we still decline - a stale
            // photo is better than a stage stuck in limbo.
            try {
                await purgeStageFolder(stage.side, stage.stageName);
            } catch (err) {
                console.error("Could not clear the stage folder:", err);
            }

            const { error: declineError } = await supabase
                .from("rehab_stages")
                .update({
                    photo_uploaded: false,
                    drive_photo_link: null,
                    jeremiah_approved: false,
                    karen_approved: false,
                    raj_approved: false,
                    status: "Blocked",
                    notes: `${stamp} - Declined by ${profile.full_name}: ${trimmedNote}`,
                    updated_at: new Date().toISOString(),
                    updated_by: profile.cockpit,
                })
                .eq("id", notionPageId);
            if (declineError) throw new Error(declineError.message);

            await clearGateNotice(supabase, profile.cockpit, notionPageId);

            // Raj keeps a copy as a record. Without this, a decline lives only
            // in a push to the crew - miss the push and it is gone, which is a
            // broken gate wearing a different hat.
            const { error: recordError } = await supabase
                .from("notifications")
                .insert({
                    recipient: "raj",
                    type: "stage_declined_record",
                    title: `${stage.stageName} sent back to the crew`,
                    body: `${stage.side} - ${trimmedNote}`,
                    link: `/raj?stage=${notionPageId}`,
                });

            if (recordError) {
                console.error("Could not record the decline for Raj:", recordError);
            }

            if (crewLead) {
                await supabase.from("notifications").insert({
                    recipient: crewLead,
                    type: "stage_declined",
                    title: `${profile.full_name} declined ${stage.stageName}`,
                    body: trimmedNote,
                    link: `/${crewLead}?stage=${notionPageId}`,
                });

                await sendPush(crewLead, {
                    title: `${stage.stageName} sent back`,
                    body: trimmedNote,
                    url: `/${crewLead}?stage=${notionPageId}`,
                });
            }

            return res.status(200).json({ success: true, outcome: "declined" });
        }

        /* ---- APPROVE ---- */
        const step = CHAIN[profile.cockpit];
        const update = {
            [step.column]: true,
            updated_at: new Date().toISOString(),
            updated_by: profile.cockpit,
        };
        if (profile.cockpit === "raj") update.status = "Done";
        const { error: approveError } = await supabase
            .from("rehab_stages")
            .update(update)
            .eq("id", notionPageId);
        if (approveError) throw new Error(approveError.message);

        // Raj is the last gate, so his approval is the earliest point these
        // photos could legitimately be advertised. This only makes the stage
        // eligible for review - nothing is posted, and nothing becomes public.
        if (profile.cockpit === "raj") {
            const socialFolderId = getFolderId(stage.side, stage.stageName);

            if (socialFolderId) {
                const { error: queueError } = await supabase
                    .from("social_queue")
                    .upsert(
                        {
                            notion_page_id: notionPageId,
                            side: stage.side,
                            stage_name: stage.stageName,
                            drive_folder_id: socialFolderId,
                            status: "pending",
                        },
                        { onConflict: "notion_page_id" },
                    );

                // Queueing is a convenience. It must never fail the approval.
                if (queueError) {
                    console.error("Could not queue the stage for social:", queueError);
                }
            }
        }

        await clearGateNotice(supabase, profile.cockpit, notionPageId);

        // Tell whoever is next, or the crew lead if the chain is complete.
        const recipient = step.next || crewLead;
        if (recipient) {
            const finished = !step.next;
            await supabase.from("notifications").insert({
                recipient,
                type: finished ? "stage_cleared" : "stage_awaiting_you",
                title: finished
                    ? `${stage.stageName} fully approved`
                    : `${stage.stageName} needs your approval`,
                body: `${stage.side} - ${stage.phase}`,
                link: `/${recipient}?stage=${notionPageId}`,
            });

            await sendPush(recipient, {
                title: finished
                    ? `${stage.stageName} fully approved`
                    : `${stage.stageName} needs your approval`,
                body: `${stage.side} - ${stage.phase}`,
                url: `/${recipient}?stage=${notionPageId}`,
            });
        }

        return res.status(200).json({ success: true, outcome: "approved" });
    } catch (error) {
        console.error("approve-stage error:", error);
        return res
            .status(500)
            .json({ error: error?.message || "Failed to update the stage" });
    }
}