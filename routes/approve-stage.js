// api/approve-stage.js
// Moves a rehab stage along the approval chain:
//
//   Colton / Zo  ->  Jeremiah  ->  Karen  ->  Raj
//
// Each approver can only act when the step before them is complete. A decline
// sends the stage straight back to the crew lead with a required note.

import { Client } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";
import { JWT } from "google-auth-library";
import { requireUser, requireCockpit } from "../lib/apiAuth.js";
import { sendPush } from "../lib/sendPush.js";
import { getFolderId } from "./drive-upload-url.js";

const REHAB_DATABASE_ID = "39f97b1c96b680dd9a77d8d83da4793c";

const CREW_LEAD = { "Side A": "colton", "Side B": "zo" };

// Who approves at each step, and what must already be true for them to act.
/**
 * Stages that skip Jeremiah and Karen and go straight to Raj. Must match the
 * same set in api/rehab-stages.js.
 */
const DIRECT_TO_RAJ = new Set(["Before Teardown Photos"]);

const CHAIN = {
    jeremiah: { field: "Jeremiah Approved", next: "karen" },
    karen: { field: "Karen Approved", next: "raj" },
    raj: { field: "Raj Approved", next: null },
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

function readStage(page) {
    const props = page.properties;
    return {
        stageName: props["Stage Name"]?.rich_text?.[0]?.plain_text || "",
        side: props["Side"]?.select?.name || "",
        phase: props["Phase"]?.select?.name || "",
        photoUploaded: props["Photo Uploaded"]?.checkbox || false,
        jeremiahApproved: props["Jeremiah Approved"]?.checkbox || false,
        karenApproved: props["Karen Approved"]?.checkbox || false,
        rajApproved: props["Raj Approved"]?.checkbox || false,
    };
}

/** Is it this person's turn? */
function canAct(cockpit, stage) {
    if (!stage.photoUploaded) return "No photo has been uploaded yet";

    // Before Teardown Photos goes straight to Raj, so the usual order does
    // not apply and the other two have no business approving it.
    if (DIRECT_TO_RAJ.has(stage.stageName)) {
        if (cockpit !== "raj") return "This stage goes straight to Raj";
        return stage.rajApproved ? "You already approved this stage" : null;
    }

    if (cockpit === "jeremiah") {
        return stage.jeremiahApproved ? "You already approved this stage" : null;
    }
    if (cockpit === "karen") {
        if (!stage.jeremiahApproved) return "Waiting on Jeremiah first";
        return stage.karenApproved ? "You already approved this stage" : null;
    }
    if (cockpit === "raj") {
        if (!stage.karenApproved) return "Waiting on Karen first";
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
        requireCockpit(caller.profile, ["jeremiah", "karen", "raj"]);
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
        const notion = new Client({ auth: process.env.NOTION_API_KEY });

        const page = await notion.pages.retrieve({ page_id: notionPageId });
        const stage = readStage(page);

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

            await notion.pages.update({
                page_id: notionPageId,
                properties: {
                    "Photo Uploaded": { checkbox: false },
                    "Drive Photo Link": { url: null },
                    "Jeremiah Approved": { checkbox: false },
                    "Karen Approved": { checkbox: false },
                    "Raj Approved": { checkbox: false },
                    Status: { select: { name: "Blocked" } },
                    "Notes / Flags": {
                        rich_text: [
                            {
                                text: {
                                    content: `${stamp} - Declined by ${profile.full_name}: ${trimmedNote}`,
                                },
                            },
                        ],
                    },
                },
            });

            await clearGateNotice(supabase, profile.cockpit, notionPageId);

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

        const properties = { [step.field]: { checkbox: true } };
        if (profile.cockpit === "raj") {
            properties.Status = { select: { name: "Done" } };
        }

        await notion.pages.update({ page_id: notionPageId, properties });

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