// routes/move-in.js
// Exhibit C - the move-in condition checklist, done on Zo's phone.
// One record per walk-through. A draft can be edited; once signed it is
// fixed, because it is what the home is compared against at move-out
// (Lease Sections 6 and 18) and the resident has 5 days to add to it.
//
// GET   /api/move-in?lots=1          lots Zo can pick, with what we know
// GET   /api/move-in?lot_id=...      checklists for a lot, newest first
// GET   /api/move-in?id=...          one checklist, photos as signed links
// POST  /api/move-in                 { lot_id } -> new draft, prefilled
// POST  /api/move-in?photo=1         { lot_id, ext } -> signed upload ticket
// PATCH /api/move-in?id=...          draft fields
// POST  /api/move-in?sign=1&id=...   { resident_signature, resident2_signature?, community_signature, copy_given }

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { requireUser, requireCockpit } from "../lib/apiAuth.js";

const BUCKET = "collections-photos";
const PROPERTY = "Hometown Meadows MHP";
const RATINGS = ["good", "fair", "poor", "na"];
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

const fail = (status, message) => Object.assign(new Error(message), { status });

/** Only paths this feature handed out, so a body cannot point at someone else's file. */
function ownPath(lotId, p) {
    return typeof p === "string" && p.startsWith(`move-in/${lotId}/`) && !p.includes("..");
}

/** Keeps only what the form has, in the shape the form uses. */
function cleanItems(lotId, raw) {
    const out = {};
    for (const [key, v] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
        if (!/^[a-z0-9_.]{1,60}$/.test(key) || !v || typeof v !== "object") continue;
        const rating = RATINGS.includes(v.rating) ? v.rating : null;
        const note = String(v.note ?? "").trim().slice(0, 500);
        const photos = (Array.isArray(v.photos) ? v.photos : []).filter((p) => ownPath(lotId, p)).slice(0, 6);
        if (rating || note || photos.length) out[key] = { rating, note, photos };
    }
    return out;
}

function cleanKeysMeters(raw) {
    const out = {};
    for (const [k, v] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
        if (/^[a-z_]{1,30}$/.test(k)) out[k] = typeof v === "boolean" ? v : String(v ?? "").slice(0, 60);
    }
    return out;
}

async function signed(supabase, path) {
    if (!path) return null;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
}

async function withLinks(supabase, c) {
    const items = {};
    for (const [k, v] of Object.entries(c.items ?? {})) {
        items[k] = { ...v, photo_urls: await Promise.all((v.photos ?? []).map((p) => signed(supabase, p))) };
    }
    return {
        ...c,
        items,
        resident_signature_url: await signed(supabase, c.resident_signature),
        resident2_signature_url: await signed(supabase, c.resident2_signature),
        community_signature_url: await signed(supabase, c.community_signature),
    };
}

export default async function handler(req, res) {
    let caller;
    try {
        caller = await requireUser(req);
        requireCockpit(caller.profile, ["zo", "raj", "dane"]);
    } catch (err) {
        return res.status(err?.status || 401).json({ error: err?.message || "Not authorised" });
    }

    try {
        const supabase = getClient();
        const q = req.query ?? {};

        if (req.method === "GET" && q.lots) {
            const { data, error } = await supabase
                .from("lots")
                .select("id, lot_number, tenant_name, home_status, bed, bath, move_in_on, tenancy_type, archived_at")
                .eq("property", PROPERTY)
                .is("archived_at", null);
            if (error) throw error;
            const lots = (data ?? [])
                .filter((l) => /^\d+$/.test(l.lot_number))
                .sort((a, b) => Number(a.lot_number) - Number(b.lot_number));
            return res.status(200).json({ lots });
        }

        if (req.method === "GET" && q.lot_id) {
            const { data, error } = await supabase
                .from("move_in_checklists")
                .select("id, status, resident_names, move_in_on, signed_at, created_at, created_by")
                .eq("lot_id", String(q.lot_id))
                .order("created_at", { ascending: false });
            if (error) throw error;
            return res.status(200).json({ checklists: data ?? [] });
        }

        if (req.method === "GET" && q.id) {
            const { data: c, error } = await supabase.from("move_in_checklists").select("*").eq("id", String(q.id)).maybeSingle();
            if (error) throw error;
            if (!c) return res.status(404).json({ error: "No such checklist" });
            const { data: lot } = await supabase.from("lots").select("lot_number").eq("id", c.lot_id).maybeSingle();
            return res.status(200).json({ checklist: { ...(await withLinks(supabase, c)), lot_number: lot?.lot_number ?? null } });
        }

        if (req.method === "POST" && q.photo) {
            const lotId = String(req.body?.lot_id ?? "");
            const ext = String(req.body?.ext ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
            if (!lotId) throw fail(400, "Pick a lot first");
            const path = `move-in/${lotId}/${randomUUID()}.${ext}`;
            const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { expiresIn: 3600 });
            if (error) throw error;
            return res.status(200).json({ path, signedUrl: data.signedUrl });
        }

        if (req.method === "POST" && q.sign) {
            const id = String(q.id ?? "");
            const { data: c, error } = await supabase.from("move_in_checklists").select("*").eq("id", id).maybeSingle();
            if (error) throw error;
            if (!c) throw fail(404, "No such checklist");
            if (c.status === "signed") throw fail(409, "This checklist is already signed");

            const items = Object.values(c.items ?? {});
            if (!items.some((v) => v.rating)) throw fail(400, "Nothing has been checked yet");
            const missing = items.filter((v) => (v.rating === "fair" || v.rating === "poor") && (!v.note || !(v.photos ?? []).length));
            if (missing.length) throw fail(400, `${missing.length} Fair or Poor item(s) still need a note and a photo`);
            if (!c.resident_names?.trim()) throw fail(400, "Enter the resident's name");

            const r1 = req.body?.resident_signature, r2 = req.body?.resident2_signature, zo = req.body?.community_signature;
            if (!ownPath(c.lot_id, r1)) throw fail(400, "The resident needs to sign");
            if (!ownPath(c.lot_id, zo)) throw fail(400, "You need to sign for the community");
            if (r2 && !ownPath(c.lot_id, r2)) throw fail(400, "The second signature could not be saved");

            const now = new Date();
            const { error: upErr } = await supabase.from("move_in_checklists").update({
                resident_signature: r1,
                resident2_signature: r2 || null,
                community_signature: zo,
                keys_meters: { ...(c.keys_meters ?? {}), copy_given: req.body?.copy_given === true },
                signed_at: now.toISOString(),
                additions_due_at: new Date(now.getTime() + 5 * 86400000).toISOString(),
                status: "signed",
                updated_at: now.toISOString(),
            }).eq("id", id).eq("status", "draft");
            if (upErr) throw upErr;

            const { data: lot } = await supabase.from("lots").select("lot_number").eq("id", c.lot_id).maybeSingle();
            await supabase.from("notifications").insert({
                recipient: "raj",
                type: "move_in_checklist",
                title: `Move-in checklist signed - Lot ${lot?.lot_number ?? ""}`,
                body: `${c.resident_names} - ${items.filter((v) => v.rating === "poor").length} poor, ${items.filter((v) => v.rating === "fair").length} fair.`,
                link: "/raj",
            }).then(() => null, () => null);

            return res.status(200).json({ ok: true, message: "Signed. The resident has 5 days to add anything missed." });
        }

        if (req.method === "POST") {
            const lotId = String(req.body?.lot_id ?? "");
            const { data: lot, error } = await supabase
                .from("lots")
                .select("id, property, tenant_name, bed, bath, move_in_on, tenancy_type")
                .eq("id", lotId)
                .maybeSingle();
            if (error) throw error;
            if (!lot || lot.property !== PROPERTY) throw fail(404, "No such lot");
            const { data: created, error: insErr } = await supabase.from("move_in_checklists").insert({
                lot_id: lot.id,
                lease_type: lot.tenancy_type === "lot_only" ? "lot_only" : "home_and_lot",
                resident_names: lot.tenant_name ?? null,
                move_in_on: lot.move_in_on ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }),
                bedrooms: lot.bed ?? null,
                baths: lot.bath ?? null,
                created_by: caller.profile.cockpit,
            }).select("id").single();
            if (insErr) throw insErr;
            return res.status(201).json({ id: created.id });
        }

        if (req.method === "PATCH") {
            const id = String(q.id ?? "");
            const { data: c, error } = await supabase.from("move_in_checklists").select("id, lot_id, status").eq("id", id).maybeSingle();
            if (error) throw error;
            if (!c) throw fail(404, "No such checklist");
            if (c.status === "signed") throw fail(409, "A signed checklist cannot be changed");
            const b = req.body ?? {};
            const patch = { updated_at: new Date().toISOString() };
            if (b.items !== undefined) patch.items = cleanItems(c.lot_id, b.items);
            if (b.keys_meters !== undefined) patch.keys_meters = cleanKeysMeters(b.keys_meters);
            if (b.resident_names !== undefined) patch.resident_names = String(b.resident_names ?? "").trim().slice(0, 200) || null;
            if (b.move_in_on !== undefined) patch.move_in_on = /^\d{4}-\d{2}-\d{2}$/.test(String(b.move_in_on)) ? b.move_in_on : null;
            if (b.lease_type !== undefined) patch.lease_type = b.lease_type === "lot_only" ? "lot_only" : "home_and_lot";
            if (b.bedrooms !== undefined) patch.bedrooms = Number.isFinite(Number(b.bedrooms)) && b.bedrooms !== "" ? Number(b.bedrooms) : null;
            if (b.baths !== undefined) patch.baths = Number.isFinite(Number(b.baths)) && b.baths !== "" ? Number(b.baths) : null;
            const { error: upErr } = await supabase.from("move_in_checklists").update(patch).eq("id", id).eq("status", "draft");
            if (upErr) throw upErr;
            return res.status(200).json({ ok: true });
        }

        res.setHeader("Allow", "GET, POST, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        if (err?.status) return res.status(err.status).json({ error: err.message });
        console.error("move-in failed", err?.message ?? err);
        return res.status(500).json({ error: "Could not save the checklist just now" });
    }
}
