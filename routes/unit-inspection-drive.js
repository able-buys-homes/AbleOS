// routes/unit-inspection-drive.js
// Mirrors an inspection photo into Google Drive so Raj can browse the walk
// where the rest of the property paperwork lives.
//
// POST /api/unit-inspection-drive   { photo_id }
//
// Supabase is the source of truth - the cockpit reads from it, and Raj's
// per-unit photo view comes from there. Drive is a convenience copy. A Drive
// failure is recorded and never fails the inspection.
//
// Folder shape, created on demand:
//   <parent> / <unit number> / condition
//   <parent> / <unit number> / marketing
import { createClient } from "@supabase/supabase-js";
import { JWT } from "google-auth-library";
import { requireUser } from "../lib/apiAuth.js";

const BUCKET = "unit-inspection-photos";

/** 121 Smith Lane, Nashville AR (From Cockpit) */
const PARENT_FOLDER_ID = "1K_sm9L51-Dr_N-__vQX1cPYNjM405Xj-";

const ALLOWED_COCKPITS = ["zo", "raj"];

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

/** Same construction as drive-upload-url.js, so both use one service account. */
function getJwtClient() {
    if (cachedJwt) return cachedJwt;

    const b64 = process.env.GOOGLE_SA_KEY_B64;
    if (!b64) throw new Error("GOOGLE_SA_KEY_B64 is not set");

    const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    cachedJwt = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ["https://www.googleapis.com/auth/drive"],
        subject: process.env.GOOGLE_IMPERSONATE_EMAIL,
    });
    return cachedJwt;
}

async function driveToken() {
    const { token } = await getJwtClient().getAccessToken();
    if (!token) throw new Error("Could not get a Drive token");
    return token;
}

/** Drive's query language needs single quotes escaped. */
function q(value) {
    return String(value).replace(/'/g, "\\'");
}

/**
 * Find a child folder by name, or create it. Shared Drives need
 * supportsAllDrives on every call, and includeItemsFromAllDrives to search.
 */
async function ensureFolder(token, parentId, name) {
    const query = [
        `'${q(parentId)}' in parents`,
        `name = '${q(name)}'`,
        "mimeType = 'application/vnd.google-apps.folder'",
        "trashed = false",
    ].join(" and ");

    const search = await fetch(
        "https://www.googleapis.com/drive/v3/files" +
        `?q=${encodeURIComponent(query)}` +
        "&fields=files(id,name)&pageSize=1" +
        "&supportsAllDrives=true&includeItemsFromAllDrives=true",
        { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!search.ok) {
        throw new Error(`Drive search failed (${search.status})`);
    }

    const found = await search.json();
    if (found.files?.length) return found.files[0].id;

    const created = await fetch(
        "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name,
                mimeType: "application/vnd.google-apps.folder",
                parents: [parentId],
            }),
        },
    );

    if (!created.ok) {
        throw new Error(`Could not create folder "${name}" (${created.status})`);
    }

    const body = await created.json();
    return body.id;
}

/** Multipart upload. Photos are compressed on the phone before they get here. */
async function uploadToDrive(token, folderId, name, mimeType, bytes) {
    const boundary = `able${Date.now()}`;

    const meta = JSON.stringify({ name, parents: [folderId] });

    const head =
        `--${boundary}\r\n` +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        `${meta}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`;

    const tail = `\r\n--${boundary}--`;

    const body = Buffer.concat([
        Buffer.from(head, "utf8"),
        Buffer.from(bytes),
        Buffer.from(tail, "utf8"),
    ]);

    const res = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files" +
        "?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body,
        },
    );

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Drive upload failed (${res.status}) ${detail.slice(0, 200)}`);
    }

    return res.json();
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const auth = await requireUser(req, res);
    if (!auth) return;

    if (!ALLOWED_COCKPITS.includes(auth.profile.cockpit)) {
        return res.status(403).json({ error: "No access to unit inspections" });
    }

    const photoId = typeof req.body?.photo_id === "string" ? req.body.photo_id : "";
    if (!photoId) return res.status(400).json({ error: "photo_id is required" });

    const supabase = getSupabase();

    try {
        const { data: photo, error } = await supabase
            .from("unit_inspection_photos")
            .select("id, inspection_id, photo_set, storage_path, mime_type, drive_file_id")
            .eq("id", photoId)
            .maybeSingle();

        if (error) throw error;
        if (!photo) return res.status(404).json({ error: "Photo not found" });

        // Already mirrored. Re-running the whole walk must not duplicate files.
        if (photo.drive_file_id) {
            return res.status(200).json({ ok: true, alreadyThere: true });
        }

        const { data: inspection, error: parentError } = await supabase
            .from("unit_inspections")
            .select("id, unit_number, drive_folder_id")
            .eq("id", photo.inspection_id)
            .maybeSingle();

        if (parentError) throw parentError;
        if (!inspection) return res.status(404).json({ error: "Inspection not found" });

        const token = await driveToken();

        // The unit folder is cached on the inspection so this costs one Drive
        // lookup per unit rather than one per photo.
        let unitFolderId = inspection.drive_folder_id;

        if (!unitFolderId) {
            unitFolderId = await ensureFolder(
                token,
                PARENT_FOLDER_ID,
                inspection.unit_number,
            );

            await supabase
                .from("unit_inspections")
                .update({ drive_folder_id: unitFolderId })
                .eq("id", inspection.id);
        }

        const setFolderId = await ensureFolder(token, unitFolderId, photo.photo_set);

        // Downloaded server-side so the phone only ever uploads once.
        const { data: blob, error: downloadError } = await supabase.storage
            .from(BUCKET)
            .download(photo.storage_path);

        if (downloadError) throw downloadError;

        const bytes = Buffer.from(await blob.arrayBuffer());
        const name = photo.storage_path.split("/").pop() || `${photo.id}.jpg`;

        const uploaded = await uploadToDrive(
            token,
            setFolderId,
            `${inspection.unit_number}-${photo.photo_set}-${name}`,
            photo.mime_type || "image/jpeg",
            bytes,
        );

        await supabase
            .from("unit_inspection_photos")
            .update({ drive_file_id: uploaded.id, drive_error: null })
            .eq("id", photo.id);

        return res.status(200).json({ ok: true, driveFileId: uploaded.id });
    } catch (err) {
        console.error("unit-inspection-drive failed:", err);

        // Recorded, not thrown at the user. The photo is safe in Supabase and
        // the inspection is already filed - Drive is a copy, not the record.
        await supabase
            .from("unit_inspection_photos")
            .update({ drive_error: String(err?.message ?? err).slice(0, 300) })
            .eq("id", photoId)
            .then(() => { }, () => { });

        return res.status(200).json({ ok: false, error: "Drive copy failed" });
    }
}