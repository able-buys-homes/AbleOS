// routes/unit-inspections.js
// Zo walks a vacant unit, files a record, Raj reads it. No approval chain -
// deliberately not routed through the rehab gate.
//
// GET    /api/unit-inspections              list (raj: all, zo: his own)
// GET    /api/unit-inspections?id=<uuid>    one inspection with signed photo links
// POST   /api/unit-inspections              file an inspection
// POST   /api/unit-inspections?photo=1      mint a signed upload URL for one photo
//
// Access is zo and raj only. Karen and Jeremiah are deliberately absent - the
// bucket is private with no policies, so there is nothing to grant them either.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { requireUser } from "../lib/apiAuth.js";

const BUCKET = "unit-inspection-photos";
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PHOTOS_PER_INSPECTION = 60;
const UPLOAD_TTL_SECONDS = 3600;
const DOWNLOAD_TTL_SECONDS = 600;

/** Zo files. Raj reads. Nobody else. */
const ALLOWED_COCKPITS = ["zo", "raj"];

const STATUSES = ["rent_ready", "needs_work", "not_habitable"];
const PHOTO_SETS = ["condition", "marketing"];
const ROOM_TAGS = [
    "living", "kitchen", "bedroom", "bathroom", "exterior", "lot", "other",
];

/** HEIC matters - it is what iPhones shoot by default. */
const MIME_EXTENSIONS = {
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

    cachedClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return cachedClient;
}

function clean(value, max) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : null;
}

function whole(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function money(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Only ever store a plain object of booleans, whatever the client sends. */
function flags(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    const out = {};
    for (const [key, raw] of Object.entries(value)) {
        if (typeof key === "string" && key.length <= 60) {
            out[key.slice(0, 60)] = Boolean(raw);
        }
    }
    return out;
}

/** Safe for a storage path: no slashes, no spaces, no surprises. */
function pathSafe(value) {
    return (value || "unit").toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40)
        || "unit";
}

function isUuid(value) {
    return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    );
}

export default async function handler(req, res) {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { user, profile } = auth;

    if (!ALLOWED_COCKPITS.includes(profile.cockpit)) {
        return res.status(403).json({ error: "No access to unit inspections" });
    }

    const isRaj = profile.cockpit === "raj";

    try {
        const supabase = getClient();

        /* ---- ONE INSPECTION, WITH PHOTOS ---- */
        if (req.method === "GET" && req.query?.id) {
            const id = clean(req.query.id, 64);
            if (!isUuid(id)) return res.status(400).json({ error: "Bad id" });

            let query = supabase
                .from("unit_inspections")
                .select("*")
                .eq("id", id)
                .is("deleted_at", null);

            // Zo sees his own walks. Raj sees everything.
            if (!isRaj) query = query.eq("inspected_by", user.id);

            const { data: inspection, error } = await query.maybeSingle();
            if (error) throw error;
            if (!inspection) return res.status(404).json({ error: "Not found" });

            const { data: rows, error: photoError } = await supabase
                .from("unit_inspection_photos")
                .select("*")
                .eq("inspection_id", id)
                .order("uploaded_at", { ascending: true });

            if (photoError) throw photoError;

            // Links are minted per request and expire. Nothing here is public.
            const photos = await Promise.all(
                (rows ?? []).map(async (row) => {
                    const { data: signed } = await supabase.storage
                        .from(BUCKET)
                        .createSignedUrl(row.storage_path, DOWNLOAD_TTL_SECONDS);

                    return { ...row, url: signed?.signedUrl ?? null };
                }),
            );

            return res.status(200).json({ inspection, photos });
        }

        /* ---- LIST ---- */
        if (req.method === "GET") {
            let query = supabase
                .from("unit_inspections")
                .select("*")
                .is("deleted_at", null)
                // Occupancy-flagged rows are the highest-signal thing on Raj's
                // page, so they sort to the top before anything else.
                .order("occupancy_flagged", { ascending: false })
                .order("inspected_at", { ascending: false })
                .limit(500);

            if (!isRaj) query = query.eq("inspected_by", user.id);

            const { data, error } = await query;
            if (error) throw error;

            const inspections = data ?? [];
            const ids = inspections.map((row) => row.id);

            // One extra query rather than one per row.
            const counts = new Map();

            if (ids.length) {
                const { data: photos, error: photoError } = await supabase
                    .from("unit_inspection_photos")
                    .select("inspection_id, photo_set")
                    .in("inspection_id", ids);

                if (photoError) throw photoError;

                for (const row of photos ?? []) {
                    const entry = counts.get(row.inspection_id) ?? {
                        condition: 0,
                        marketing: 0,
                    };
                    entry[row.photo_set] = (entry[row.photo_set] ?? 0) + 1;
                    counts.set(row.inspection_id, entry);
                }
            }

            return res.status(200).json({
                inspections: inspections.map((row) => ({
                    ...row,
                    photo_counts: counts.get(row.id) ?? { condition: 0, marketing: 0 },
                })),
            });
        }

        /* ---- SIGNED UPLOAD URL FOR ONE PHOTO ---- */
        if (req.method === "POST" && req.query?.photo) {
            const inspectionId = clean(req.body?.inspection_id, 64);
            if (!isUuid(inspectionId)) {
                return res.status(400).json({ error: "inspection_id is required" });
            }

            const photoSet = clean(req.body?.photo_set, 20);
            if (!PHOTO_SETS.includes(photoSet)) {
                return res.status(400).json({ error: "photo_set must be condition or marketing" });
            }

            const roomTag = clean(req.body?.room_tag, 20);
            if (roomTag && !ROOM_TAGS.includes(roomTag)) {
                return res.status(400).json({ error: "Unknown room tag" });
            }

            const mime = clean(req.body?.mime_type, 60) || "";
            const ext = MIME_EXTENSIONS[mime];
            if (!ext) {
                return res.status(400).json({ error: `Unsupported image type: ${mime}` });
            }

            const size = whole(req.body?.size_bytes) ?? 0;
            if (size > MAX_BYTES) {
                return res.status(400).json({ error: "Photos must be under 15 MB" });
            }

            let parentQuery = supabase
                .from("unit_inspections")
                .select("id, unit_number, inspected_by")
                .eq("id", inspectionId)
                .is("deleted_at", null);

            if (!isRaj) parentQuery = parentQuery.eq("inspected_by", user.id);

            const { data: parent, error: parentError } = await parentQuery.maybeSingle();
            if (parentError) throw parentError;
            if (!parent) return res.status(404).json({ error: "Inspection not found" });

            const { count, error: countError } = await supabase
                .from("unit_inspection_photos")
                .select("id", { count: "exact", head: true })
                .eq("inspection_id", inspectionId);

            if (countError) throw countError;
            if ((count ?? 0) >= MAX_PHOTOS_PER_INSPECTION) {
                return res
                    .status(400)
                    .json({ error: `Up to ${MAX_PHOTOS_PER_INSPECTION} photos per unit` });
            }

            // htm/{unit}/{set}/{uuid}.{ext} - the set is in the path, so a
            // wrong-set upload is visible in storage, not just in a column.
            const path = `htm/${pathSafe(parent.unit_number)}/${photoSet}/${randomUUID()}.${ext}`;

            const { data: signed, error: signError } = await supabase.storage
                .from(BUCKET)
                .createSignedUploadUrl(path, { expiresIn: UPLOAD_TTL_SECONDS });

            if (signError) throw signError;

            const { data: row, error: insertError } = await supabase
                .from("unit_inspection_photos")
                .insert({
                    inspection_id: inspectionId,
                    photo_set: photoSet,
                    room_tag: roomTag,
                    storage_path: path,
                    caption: clean(req.body?.caption, 200),
                    size_bytes: size || null,
                    mime_type: mime,
                })
                .select("id")
                .single();

            if (insertError) throw insertError;

            return res.status(200).json({
                id: row.id,
                path,
                signedUrl: signed.signedUrl,
                uploadToken: signed.token,
            });
        }

        /* ---- FILE AN INSPECTION ---- */
        if (req.method === "POST") {
            const unitNumber = clean(req.body?.unit_number, 40);
            if (!unitNumber) {
                return res.status(400).json({ error: "Unit number is required" });
            }

            const status = clean(req.body?.status, 20);
            if (!STATUSES.includes(status)) {
                return res.status(400).json({ error: "Pick a status" });
            }

            const inspectedAt = req.body?.inspected_at
                ? new Date(req.body.inspected_at)
                : new Date();

            const { data, error } = await supabase
                .from("unit_inspections")
                .insert({
                    unit_number: unitNumber,
                    property: clean(req.body?.property, 120) || "Hometown Meadows MHP",
                    // Taken from the session, never from the client.
                    inspected_by: user.id,
                    inspected_at: Number.isNaN(inspectedAt.getTime())
                        ? new Date().toISOString()
                        : inspectedAt.toISOString(),
                    status,
                    beds: whole(req.body?.beds),
                    baths_full: whole(req.body?.baths_full),
                    baths_half: whole(req.body?.baths_half),
                    approx_sqft: whole(req.body?.approx_sqft),
                    home_width: clean(req.body?.home_width, 20),
                    appliances: flags(req.body?.appliances),
                    systems: flags(req.body?.systems),
                    condition: flags(req.body?.condition),
                    occupancy_flags: flags(req.body?.occupancy_flags),
                    last_tenant: clean(req.body?.last_tenant, 120),
                    went_empty_approx: clean(req.body?.went_empty_approx, 120),
                    keys: flags(req.body?.keys),
                    notes: clean(req.body?.notes, 4000),
                    est_cost_to_ready: money(req.body?.est_cost_to_ready),
                    days_to_ready: whole(req.body?.days_to_ready),
                })
                .select("*")
                .single();

            if (error) throw error;

            return res.status(201).json({ inspection: data });
        }

        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("unit-inspections failed:", err);
        return res.status(500).json({ error: "Could not save the inspection" });
    }
}   