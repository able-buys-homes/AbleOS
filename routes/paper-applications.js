// routes/paper-applications.js
// Zo uploads a photo or PDF of a paper residency application (Raj-approved,
// Coco's spec, 15 Oct 2026). The forms hold SSNs and ID numbers, so:
//   - private bucket, reached only through short-lived signed links
//   - Zo, Manita and Raj only (Ellery waits on Coco's answer)
//   - file named Lot#_LastName_Date, status "Application taken"
//
// GET  /api/paper-applications            the list, newest first
// GET  /api/paper-applications?id=<uuid>  a 10-minute link to view one file
// POST /api/paper-applications            { lot_number, last_name, taken_on, mime_type, size_bytes }
//                                         -> { id, file_name, signedUrl } (browser PUTs the file)
// POST /api/paper-applications?done=1     { id } - confirms the file arrived, notifies Raj
//
// The Drive copy into the restricted Applications folder is a separate step,
// switched on when its folder id is set (PAPER_APPS_DRIVE_FOLDER_ID).

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { requireUser } from "../lib/apiAuth.js";

const BUCKET = "paper-applications";
const ALLOWED = ["zo", "manita", "raj"];
const HTM = "Hometown Meadows MHP";
const MAX_BYTES = 20 * 1024 * 1024;
const UPLOAD_TTL_SECONDS = 3600;
const VIEW_TTL_SECONDS = 600;
const EXT = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/webp": "webp",
};

let cachedClient = null;
function getClient() {
    if (cachedClient) return cachedClient;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url) throw new Error("SUPABASE_URL is not set");
    if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
    cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return cachedClient;
}

const isUuid = (v) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const parkToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

/** "O'Brien-Smith" -> "OBrienSmith". Letters and digits only, so the name is safe in a file name. */
export function nameForFile(lastName) {
    return String(lastName ?? "").normalize("NFKD").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
}

/** Lot12_Smith_2026-10-19.pdf */
export function fileNameFor(lot, lastName, takenOn, ext) {
    return `Lot${lot}_${nameForFile(lastName)}_${takenOn}.${ext}`;
}

export function validateNew(body, today = parkToday()) {
    const lot = String(body?.lot_number ?? "").trim();
    if (!/^\d{1,4}$/.test(lot)) return "Type the lot number, like 12.";

    const lastName = String(body?.last_name ?? "").trim();
    if (!/^[A-Za-z][A-Za-z '\-.]{0,59}$/.test(lastName) || !nameForFile(lastName)) {
        return "Type the applicant's last name (letters only).";
    }

    const takenOn = String(body?.taken_on ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(takenOn) || Number.isNaN(new Date(`${takenOn}T12:00:00Z`).getTime())) {
        return "Pick the date the application was taken.";
    }
    if (takenOn > today) return "The date can't be in the future.";
    const yearAgo = new Date(`${today}T12:00:00Z`);
    yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    if (takenOn < yearAgo.toISOString().slice(0, 10)) return "That date is more than a year ago.";

    const mime = String(body?.mime_type ?? "");
    if (!EXT[mime]) return "Upload a photo (JPG, PNG, HEIC) or a PDF.";

    const size = Number(body?.size_bytes);
    if (!Number.isFinite(size) || size <= 0) return "The file is empty.";
    if (size > MAX_BYTES) return "Files must be under 20 MB.";

    return { lot, lastName, takenOn, mime, ext: EXT[mime], size: Math.round(size) };
}

export default async function handler(req, res) {
    let caller;
    try {
        caller = await requireUser(req);
    } catch (err) {
        return res.status(err?.status || 401).json({ error: err?.message || "Not authorised" });
    }
    if (!caller?.profile || !ALLOWED.includes(caller.profile.cockpit)) {
        return res.status(403).json({ error: "Not your screen" });
    }
    const who = caller.profile.cockpit;
    const userId = caller.user?.id ?? caller.profile.id ?? null;

    try {
        const supabase = getClient();

        /* ---- a 10-minute link to view one file ---- */
        if (req.method === "GET" && req.query?.id) {
            const id = String(req.query.id);
            if (!isUuid(id)) return res.status(400).json({ error: "Which application?" });
            const { data: row, error } = await supabase
                .from("paper_applications").select("id, storage_path, file_name, uploaded_at")
                .eq("id", id).is("deleted_at", null).maybeSingle();
            if (error) throw error;
            if (!row || !row.uploaded_at) return res.status(404).json({ error: "Not found" });
            const { data: link, error: linkError } = await supabase.storage
                // No "download" option: the file opens in the browser tab instead of
                // being saved, so copies of these forms don't pile up in Downloads.
                .from(BUCKET).createSignedUrl(row.storage_path, VIEW_TTL_SECONDS);
            if (linkError) throw linkError;
            return res.status(200).json({ url: link.signedUrl, file_name: row.file_name });
        }

        /* ---- the list ---- */
        if (req.method === "GET") {
            const { data, error } = await supabase
                .from("paper_applications")
                .select("id, lot_number, last_name, taken_on, file_name, status, uploaded_by_cockpit, uploaded_at, drive_file_id, drive_error, created_at")
                .is("deleted_at", null).not("uploaded_at", "is", null)
                .order("created_at", { ascending: false }).limit(100);
            if (error) throw error;
            return res.status(200).json({ applications: data ?? [] });
        }

        if (req.method !== "POST") {
            res.setHeader("Allow", "GET, POST");
            return res.status(405).json({ error: "Method not allowed" });
        }

        /* ---- confirm the file arrived ---- */
        if (req.query?.done) {
            const id = String(req.body?.id ?? "");
            if (!isUuid(id)) return res.status(400).json({ error: "Which application?" });
            const { data: row, error } = await supabase
                .from("paper_applications").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
            if (error) throw error;
            if (!row) return res.status(404).json({ error: "Not found" });
            if (row.uploaded_at) return res.status(200).json({ ok: true, already: true, file_name: row.file_name });

            const slash = row.storage_path.lastIndexOf("/");
            const { data: found, error: listError } = await supabase.storage
                .from(BUCKET).list(row.storage_path.slice(0, slash), { search: row.storage_path.slice(slash + 1) });
            if (listError) throw listError;
            if (!(found ?? []).some((f) => f.name === row.storage_path.slice(slash + 1))) {
                return res.status(409).json({ error: "The file hasn't arrived yet. Try the upload again." });
            }

            const now = new Date().toISOString();
            const { error: upError } = await supabase
                .from("paper_applications").update({ uploaded_at: now }).eq("id", id);
            if (upError) throw upError;

            await supabase.from("notifications").insert({
                recipient: "raj",
                type: "paper_application",
                title: `Paper application taken - Lot ${row.lot_number}`,
                body: `${row.file_name} uploaded by ${row.uploaded_by_cockpit}.`,
                link: "/zo/paper-applications",
            });
            return res.status(200).json({ ok: true, file_name: row.file_name });
        }

        /* ---- start an upload ---- */
        const v = validateNew(req.body);
        if (typeof v === "string") return res.status(400).json({ error: v });

        const { data: lot, error: lotError } = await supabase
            .from("lots").select("id").eq("property", HTM).eq("lot_number", v.lot)
            .is("archived_at", null).maybeSingle();
        if (lotError) throw lotError;
        if (!lot) return res.status(400).json({ error: `There's no Lot ${v.lot} at Hometown Meadows.` });

        const fileName = fileNameFor(v.lot, v.lastName, v.takenOn, v.ext);
        const path = `htm/Lot${v.lot}/${randomUUID()}.${v.ext}`;

        const { data: signed, error: signError } = await supabase.storage
            .from(BUCKET).createSignedUploadUrl(path, { expiresIn: UPLOAD_TTL_SECONDS });
        if (signError) throw signError;

        const { data: row, error: insertError } = await supabase
            .from("paper_applications")
            .insert({
                lot_number: v.lot,
                last_name: v.lastName,
                taken_on: v.takenOn,
                file_name: fileName,
                storage_path: path,
                mime_type: v.mime,
                size_bytes: v.size,
                uploaded_by: userId,
                uploaded_by_cockpit: who,
            })
            .select("id").single();
        if (insertError) throw insertError;

        return res.status(201).json({ id: row.id, file_name: fileName, signedUrl: signed.signedUrl });
    } catch (err) {
        console.error("paper-applications failed:", err?.message ?? err);
        return res.status(500).json({ error: "Could not save that. Please try again." });
    }
}
