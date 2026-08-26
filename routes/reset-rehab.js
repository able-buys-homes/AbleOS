// api/reset-rehab.js
// DESTRUCTIVE. Empties every rehab stage Drive folder and clears the matching
// Notion fields, putting the whole photo/approval flow back to zero.
// The 40 folders themselves survive - only their contents go.
//
// Dane only. Raj reaches it by opening Dane's cockpit, which swaps his
// effective cockpit server-side.

import { Client } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";
import { JWT } from "google-auth-library";
import { requireUser, requireCockpit } from "../lib/apiAuth.js";
import { SIDE_A, SIDE_B } from "./drive-upload-url.js";
import { sendPush } from "../lib/sendPush.js";

const REHAB_DATABASE_ID = "39f97b1c96b680dd9a77d8d83da4793c";

// 80 API calls at Notion's ~3/sec ceiling needs more than the default 10s.
export const config = { maxDuration: 60 };

/** Runs `worker` over `items` with at most `limit` in flight. */
async function runPool(items, limit, worker) {
    const queue = [...items];
    const runners = Array.from(
        { length: Math.min(limit, queue.length) },
        async () => {
            while (queue.length) {
                const item = queue.shift();
                await worker(item);
            }
        },
    );
    await Promise.all(runners);
}

async function driveToken() {
    const b64 = process.env.GOOGLE_SA_KEY_B64;
    if (!b64) throw new Error("GOOGLE_SA_KEY_B64 is not set");

    const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    const jwt = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const { token } = await jwt.getAccessToken();
    return token;
}

async function emptyFolder(folderId, token) {
    const auth = { Authorization: `Bearer ${token}` };
    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);

    const listRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1000`,
        { headers: auth },
    );
    if (!listRes.ok) throw new Error(await listRes.text());

    const { files = [] } = await listRes.json();

    await runPool(files, 8, async (file) => {
        await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
            method: "DELETE",
            headers: auth,
        });
    });

    return files.length;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    let caller;
    try {
        caller = await requireUser(req);
        requireCockpit(caller.profile, ["dane"]);
    } catch (err) {
        return res
            .status(err?.status || 401)
            .json({ error: err?.message || "Not authorised" });
    }

    // Belt and braces: the UI asks the user to type this, and the server insists.
    if (req.body?.confirm !== "RESET") {
        return res.status(400).json({ error: "Confirmation phrase missing" });
    }

    try {
        /* ---- Drive ---- */
        const token = await driveToken();
        const folderIds = [
            ...Object.values(SIDE_A),
            ...Object.values(SIDE_B),
        ];

        let filesDeleted = 0;
        await runPool(folderIds, 6, async (folderId) => {
            filesDeleted += await emptyFolder(folderId, token);
        });

        /* ---- Notion ---- */
        const notion = new Client({ auth: process.env.NOTION_API_KEY });

        const db = await notion.databases.retrieve({
            database_id: REHAB_DATABASE_ID,
        });
        const dataSourceId = db.data_sources[0].id;

        const rows = [];
        let cursor;
        do {
            const page = await notion.dataSources.query({
                data_source_id: dataSourceId,
                start_cursor: cursor,
                page_size: 100,
            });
            rows.push(...page.results);
            cursor = page.has_more ? page.next_cursor : undefined;
        } while (cursor);

        let rowsReset = 0;
        // Notion allows roughly 3 requests a second, so keep this pool small.
        await runPool(rows, 3, async (page) => {
            await notion.pages.update({
                page_id: page.id,
                properties: {
                    "Photo Uploaded": { checkbox: false },
                    "Drive Photo Link": { url: null },
                    "Work Done": { checkbox: false },
                    "Jeremiah Approved": { checkbox: false },
                    "Karen Approved": { checkbox: false },
                    "Raj Approved": { checkbox: false },
                    "Draw Released": { checkbox: false },
                    "Notes / Flags": { rich_text: [] },
                    Status: { select: { name: "Not Started" } },
                },
            });
            rowsReset++;
        });

        /* ---- Tell everyone it happened ---- */
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SECRET_KEY,
            { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const recipients = ["colton", "zo", "jeremiah", "karen", "raj"];
        const { error: notifyError } = await supabase.from("notifications").insert(
            recipients.map((recipient) => ({
                recipient,
                type: "rehab_reset",
                title: `${caller.profile.full_name} reset the rehab checklist`,
                body: `${filesDeleted} photos removed, all approvals cleared`,
                link: `/${recipient}`,
            })),
        );

        if (notifyError) {
            console.error("Failed to create notifications:", notifyError);
        }

        await Promise.all(
            recipients.map((recipient) =>
                sendPush(recipient, {
                    title: `${caller.profile.full_name} reset the rehab checklist`,
                    body: `${filesDeleted} photos removed, all approvals cleared`,
                    url: `/${recipient}`,
                }),
            ),
        );

        return res.status(200).json({ filesDeleted, rowsReset });
    } catch (error) {
        console.error("reset-rehab error:", error);
        return res
            .status(500)
            .json({ error: error?.message || "Reset failed partway through" });
    }
}