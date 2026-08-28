// routes/social-queue.js
// Raj's review queue for posting rehab photos to the Facebook Page.
//
// GET  /api/social-queue                 stages awaiting review
// GET  /api/social-queue?id=<uuid>       one stage, with its Drive photos
// GET  /api/social-queue?file=<driveId>  stream one photo for the thumbnail
//
// Photos are never made public here. The Drive folder stays private and images
// are proxied through this route, which is why it is raj-only. Making a copy
// public happens later, and only for a photo he has actually chosen.
import { createClient } from "@supabase/supabase-js";
import { JWT } from "google-auth-library";
import { requireUser } from "../lib/apiAuth.js";
import { SIDE_A, SIDE_B } from "./drive-upload-url.js";

const ALLOWED_COCKPITS = ["raj"];

let cachedSupabase = null;
let cachedJwt = null;

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

/** Same construction as the other Drive routes: one service account, no impersonation. */
function getJwtClient() {
    if (cachedJwt) return cachedJwt;

    const raw = process.env.GOOGLE_SA_KEY_B64;
    if (!raw) throw new Error("GOOGLE_SA_KEY_B64 is not set");

    const text = raw.trim().startsWith("{")
        ? raw
        : Buffer.from(raw, "base64").toString("utf8");

    const creds = JSON.parse(text);

    cachedJwt = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ["https://www.googleapis.com/auth/drive"],
    });
    return cachedJwt;
}

async function driveToken() {
    const { token } = await getJwtClient().getAccessToken();
    if (!token) throw new Error("Could not get a Drive token");
    return token;
}

function isUuid(value) {
    return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    );
}

/** Drive file ids are opaque; allow only what Drive actually issues. */
function isDriveId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{10,80}$/.test(value);
}

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    let auth;
    try {
        auth = await requireUser(req);
    } catch (err) {
        return res
            .status(err?.status || 401)
            .json({ error: err?.message || "Not authorised" });
    }

    if (!ALLOWED_COCKPITS.includes(auth.profile.cockpit)) {
        return res.status(403).json({ error: "No access to the posting queue" });
    }

    try {
        const supabase = getSupabase();

        /* ---- EVERY STAGE FOLDER, FOR BROWSING ---- */
        // The queue only holds stages just approved. This lets Raj go back to
        // any finished stage and post from it whenever he likes.
        if (req.method === "GET" && req.query?.stages) {
            const all = [
                ...Object.entries(SIDE_A).map(([stage_name, folderId]) => ({
                    side: "Side A",
                    stage_name,
                    folderId,
                })),
                ...Object.entries(SIDE_B).map(([stage_name, folderId]) => ({
                    side: "Side B",
                    stage_name,
                    folderId,
                })),
            ];

            // One query across every folder rather than 42 round trips. Asking
            // which folders contain an image is cheaper than asking each folder
            // what it holds.
            const token = await driveToken();
            const parents = all
                .map((s) => `'${s.folderId}' in parents`)
                .join(" or ");

            const q = encodeURIComponent(
                `(${parents}) and trashed = false and mimeType contains 'image/'`,
            );

            const listRes = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${q}` +
                `&fields=files(parents)&pageSize=1000` +
                `&supportsAllDrives=true&includeItemsFromAllDrives=true`,
                { headers: { Authorization: `Bearer ${token}` } },
            );

            if (!listRes.ok) {
                throw new Error(`Drive stage scan failed (${listRes.status})`);
            }

            const { files = [] } = await listRes.json();
            const withPhotos = new Set(files.flatMap((f) => f.parents ?? []));

            return res.status(200).json({
                stages: all 
                    .filter((s) => withPhotos.has(s.folderId))
                    .map(({ side, stage_name }) => ({ side, stage_name })),
            });
        }

        /* ---- OPEN A STAGE THAT IS NOT IN THE QUEUE ---- */
        // Creates the queue row on demand. notion_page_id is unique, so
        // browsing the same stage twice reuses the row rather than duplicating.
        if (req.method === "POST" && req.query?.browse) {
            const side = String(req.body?.side || "");
            const stageName = String(req.body?.stage_name || "");

            const map = side === "Side B" ? SIDE_B : side === "Side A" ? SIDE_A : null;
            if (!map) return res.status(400).json({ error: "Unknown side" });

            const folderId = map[stageName];
            if (!folderId) return res.status(400).json({ error: "Unknown stage" });

            const { data, error: upsertError } = await supabase
                .from("social_queue")
                .upsert(
                    {
                        notion_page_id: `manual:${side}:${stageName}`,
                        side,
                        stage_name: stageName,
                        drive_folder_id: folderId,
                        status: "pending",
                    },
                    { onConflict: "notion_page_id" },
                )
                .select("id")
                .single();

            if (upsertError) throw upsertError;

            return res.status(200).json({ id: data.id });
        }

        /* ---- RAJ'S DECISION ---- */
        // Queues the photos he picked. Still does not publish - posting is a
        // separate step, so a mis-click here cannot put anything on the Page.
        if (req.method === "POST") {
            const queueId = String(req.body?.queue_id || "");
            if (!isUuid(queueId)) {
                return res.status(400).json({ error: "queue_id is required" });
            }

            const { data: queue, error: queueError } = await supabase
                .from("social_queue")
                .select("id")
                .eq("id", queueId)
                .maybeSingle();

            if (queueError) throw queueError;
            if (!queue) return res.status(404).json({ error: "Not found" });

            const picks = Array.isArray(req.body?.picks) ? req.body.picks : [];

            const rows = picks
                .filter((p) => isDriveId(p?.drive_file_id))
                .slice(0, 20)
                .map((p) => ({
                    queue_id: queueId,
                    drive_file_id: p.drive_file_id,
                    caption:
                        typeof p.caption === "string"
                            ? p.caption.trim().slice(0, 2000) || null
                            : null,
                    approved_by: auth.profile.cockpit,
                    status: "queued",
                }));

            if (rows.length) {
                // Ignored on conflict, so submitting twice cannot double-post.
                const { error: insertError } = await supabase
                    .from("social_posts")
                    .upsert(rows, {
                        onConflict: "queue_id,drive_file_id,platform",
                        ignoreDuplicates: true,
                    });

                if (insertError) throw insertError;
            }

            const { error: markError } = await supabase
                .from("social_queue")
                .update({
                    status: rows.length ? "reviewed" : "skipped",
                    reviewed_by: auth.profile.cockpit,
                    reviewed_at: new Date().toISOString(),
                })
                .eq("id", queueId);

            if (markError) throw markError;

            return res.status(200).json({ queued: rows.length });
        }

        /* ---- STREAM ONE PHOTO ---- */
        // Proxied rather than linked, so the Drive folder stays private and a
        // thumbnail URL cannot be shared outside the cockpit.
        if (req.query?.file) {
            const fileId = String(req.query.file);
            if (!isDriveId(fileId)) {
                return res.status(400).json({ error: "Bad file id" });
            }

            const token = await driveToken();
            const upstream = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
                { headers: { Authorization: `Bearer ${token}` } },
            );

            if (!upstream.ok) {
                return res.status(502).json({ error: `Drive returned ${upstream.status}` });
            }

            res.setHeader(
                "Content-Type",
                upstream.headers.get("content-type") || "image/jpeg",
            );
            // Private: it is one person's cockpit, never a shared cache.
            res.setHeader("Cache-Control", "private, max-age=600");

            const buffer = Buffer.from(await upstream.arrayBuffer());
            return res.status(200).send(buffer);
        }

        /* ---- ONE STAGE, WITH ITS PHOTOS ---- */
        if (req.query?.id) {
            const id = String(req.query.id);
            if (!isUuid(id)) return res.status(400).json({ error: "Bad id" });

            const { data: queue, error } = await supabase
                .from("social_queue")
                .select("*")
                .eq("id", id)
                .maybeSingle();

            if (error) throw error;
            if (!queue) return res.status(404).json({ error: "Not found" });

            const token = await driveToken();
            const q = encodeURIComponent(
                `'${queue.drive_folder_id}' in parents and trashed = false`,
            );

            const listRes = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${q}` +
                `&fields=files(id,name,mimeType,createdTime)&pageSize=200` +
                `&orderBy=createdTime&supportsAllDrives=true&includeItemsFromAllDrives=true`,
                { headers: { Authorization: `Bearer ${token}` } },
            );

            if (!listRes.ok) {
                throw new Error(`Drive listing failed (${listRes.status})`);
            }

            const { files = [] } = await listRes.json();

            // Which of these he has already published, so the UI can mark them
            // rather than offering the same photo twice.
            const { data: posted, error: postedError } = await supabase
                .from("social_posts")
                .select("drive_file_id, status, fb_post_id, error")
                .eq("queue_id", id);

            if (postedError) throw postedError;

            const byFile = new Map((posted ?? []).map((p) => [p.drive_file_id, p]));

            return res.status(200).json({
                queue,
                photos: files
                    .filter((f) => String(f.mimeType || "").startsWith("image/"))
                    .map((f) => ({
                        ...f,
                        posted: byFile.get(f.id) ?? null,
                    })),
            });
        }

        /* ---- LIST ---- */
        const { data, error } = await supabase
            .from("social_queue")
            .select("*")
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(100);

        if (error) throw error;

        return res.status(200).json({ queue: data ?? [] });
    } catch (err) {
        console.error("social-queue failed:", err);
        return res.status(500).json({ error: "Could not load the posting queue" });
    }
}