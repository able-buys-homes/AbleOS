// routes/deal-intake-file.js
// Machine endpoint. n8n calls this once per email attachment, after
// /api/deal-intake has told it which deal the message belongs to.
//
// POST /api/deal-intake-file
//   { deal_id, message_id, file_name, mime_type, size_bytes }
//   -> { signedUrl, uploadToken, path }
//
// The file itself is then PUT to signedUrl. Attachments land in the same
// bucket and table as website submissions, so the cockpit renders them
// with no extra work.
import { createClient } from "@supabase/supabase-js";
import { randomUUID, timingSafeEqual } from "node:crypto";

const BUCKET = "deal-submissions";
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_FILES_PER_DEAL = 60;
const UPLOAD_TTL_SECONDS = 600;

/** Wider than the public form: an emailed rent roll is usually a spreadsheet. */
const MIME_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "text/csv": "csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
};

let cachedClient = null;

function getClient() {
    if (cachedClient) return cachedClient;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url) throw new Error("SUPABASE_URL is not set");
    if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");

    cachedClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return cachedClient;
}

/** Same constant-time compare as deal-intake. */
function secretMatches(supplied) {
    const expected = process.env.DEAL_INTAKE_SECRET;
    if (!expected || typeof supplied !== "string") return false;

    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
}

/** Display only. The stored path never uses it. */
function safeDisplayName(value) {
    if (typeof value !== "string") return "attachment";
    const cleaned = value.trim().slice(0, 120).replace(/[^A-Za-z0-9._ -]/g, "");
    return cleaned || "attachment";
}

function isUuid(value) {
    return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    );
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!secretMatches(req.headers["x-intake-secret"])) {
        return res.status(401).json({ error: "Not authorised" });
    }

    const dealId = req.body?.deal_id;
    if (!isUuid(dealId)) {
        return res.status(400).json({ error: "deal_id is required" });
    }

    const mime = String(req.body?.mime_type || "");
    const ext = MIME_EXTENSIONS[mime];
    if (!ext) {
        return res.status(400).json({ error: `Unsupported file type: ${mime}` });
    }

    // Gmail does not reliably report a size, so a missing one is recorded as 0
    // rather than refused. The bucket still enforces the hard 15 MB limit at
    // upload time - this number is only ever shown to a person.
    const rawSize = Number(req.body?.size_bytes);
    const size = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0;

    if (size > MAX_BYTES) {
        return res.status(400).json({ error: "Files must be under 15 MB" });
    }

    try {
        const supabase = getClient();

        // The deal has to exist. A typo'd id would otherwise orphan the file.
        const { data: deal, error: dealError } = await supabase
            .from("pipeline_deals")
            .select("id")
            .eq("id", dealId)
            .maybeSingle();

        if (dealError) throw dealError;
        if (!deal) return res.status(404).json({ error: "Deal not found" });

        // A runaway loop in n8n shouldn't be able to fill the bucket.
        const { count, error: countError } = await supabase
            .from("deal_submission_files")
            .select("id", { count: "exact", head: true })
            .eq("deal_id", dealId);

        if (countError) throw countError;
        if ((count ?? 0) >= MAX_FILES_PER_DEAL) {
            return res
                .status(400)
                .json({ error: `Up to ${MAX_FILES_PER_DEAL} files per deal` });
        }

        // One token per email message, so a thread's attachments stay grouped
        // in storage the way they arrived.
        const token = isUuid(req.body?.message_token)
            ? req.body.message_token
            : randomUUID();

        const path = `${token}/${randomUUID()}.${ext}`;

        const { data: signed, error: signError } = await supabase.storage
            .from(BUCKET)
            .createSignedUploadUrl(path, { expiresIn: UPLOAD_TTL_SECONDS });

        if (signError) throw signError;

        const { error: insertError } = await supabase
            .from("deal_submission_files")
            .insert({
                deal_id: dealId,
                submission_token: token,
                storage_path: path,
                file_name: safeDisplayName(req.body?.file_name),
                mime_type: mime,
                size_bytes: Math.round(size),
            });

        if (insertError) throw insertError;

        return res.status(200).json({
            messageToken: token,
            path,
            signedUrl: signed.signedUrl,
            uploadToken: signed.token,
        });
    } catch (err) {
        console.error("deal-intake-file failed:", err);
        return res.status(500).json({ error: "Could not start the upload" });
    }
}