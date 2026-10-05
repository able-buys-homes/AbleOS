// routes/portal-feedback.js
// Problems residents report about the portal itself ("I can't click Pay").
// Dane only - these are app problems, not home repairs.
//
// GET   /api/portal-feedback            open reports first, then the last 30 resolved
// PATCH /api/portal-feedback?id=...     { resolved: true|false }

import { createClient } from "@supabase/supabase-js";
import { requireUser, requireCockpit } from "../lib/apiAuth.js";

const BUCKET = "collections-photos";
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

export default async function handler(req, res) {
    let caller;
    try {
        caller = await requireUser(req);
        requireCockpit(caller.profile, ["dane"]);
    } catch (err) {
        return res.status(err?.status || 401).json({ error: err?.message || "Not authorised" });
    }

    try {
        const supabase = getClient();

        if (req.method === "GET") {
            const [openRes, doneRes, lotsRes] = await Promise.all([
                supabase.from("portal_feedback").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(100),
                supabase.from("portal_feedback").select("*").not("resolved_at", "is", null).order("resolved_at", { ascending: false }).limit(30),
                supabase.from("lots").select("id, lot_number"),
            ]);
            for (const r of [openRes, doneRes, lotsRes]) if (r.error) throw r.error;

            const lotNo = new Map((lotsRes.data ?? []).map((l) => [l.id, l.lot_number]));
            const shape = async (r) => {
                let photo_url = null;
                if (r.photo_path) {
                    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(r.photo_path, 3600);
                    photo_url = data?.signedUrl ?? null;
                }
                return { ...r, lot_number: lotNo.get(r.lot_id) ?? null, photo_url };
            };

            return res.status(200).json({
                open: await Promise.all((openRes.data ?? []).map(shape)),
                resolved: await Promise.all((doneRes.data ?? []).map(shape)),
            });
        }

        if (req.method === "PATCH") {
            const id = String(req.query?.id || "");
            if (!id) return res.status(400).json({ error: "Which report?" });
            const resolved = req.body?.resolved !== false;
            const { error } = await supabase
                .from("portal_feedback")
                .update(resolved
                    ? { resolved_at: new Date().toISOString(), resolved_by: caller.profile.cockpit }
                    : { resolved_at: null, resolved_by: null })
                .eq("id", id);
            if (error) throw error;
            return res.status(200).json({ ok: true });
        }

        res.setHeader("Allow", "GET, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("portal-feedback failed", err?.message ?? err);
        return res.status(500).json({ error: "Could not load the reports" });
    }
}
