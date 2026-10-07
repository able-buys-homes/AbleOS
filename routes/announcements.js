// routes/announcements.js
// Park announcements, written by the office and read in the portal.
//
// GET    /api/announcements               the board, for Dane and Zo
// POST   /api/announcements               write one
// PATCH  /api/announcements?id=…          edit, pin, or archive one
// GET    /api/announcements?pending=1     what still needs emailing (n8n)
// PATCH  /api/announcements?emailed=1     mark one as sent (n8n)
//
// This is not the notices table and must never become it. That one holds
// legal eviction notices with proof of posting; this one holds park news.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireUser, requireCockpit } from "../lib/apiAuth.js";

const CATEGORIES = new Set(["urgent", "billing", "maintenance", "community", "admin"]);

/** Zo runs the park day to day; Dane speaks for billing and the community. */
const CAN_WRITE = ["dane", "zo"];
const CAN_READ = ["dane", "zo", "raj"];

let cachedClient = null;

function getClient() {
    if (cachedClient) return cachedClient;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY missing");

    cachedClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return cachedClient;
}

function secretMatches(header, secret) {
    const a = Buffer.from(String(header ?? ""));
    const b = Buffer.from(`Bearer ${secret}`);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

/** Shared shape for both the cockpit and the machine-facing routes. */
function clean(body) {
    const category = String(body?.category ?? "").trim();
    const title = String(body?.title ?? "").trim();
    const text = String(body?.body ?? "").trim();

    if (!CATEGORIES.has(category)) throw { status: 400, message: "Pick a category" };
    if (title.length < 3) throw { status: 400, message: "Give it a title" };
    if (title.length > 120) throw { status: 400, message: "That title is too long" };
    if (text.length < 3) throw { status: 400, message: "Say what is happening" };
    if (text.length > 4000) throw { status: 400, message: "That is too long for a notice" };

    return { category, title, body: text.slice(0, 4000) };
}

export default async function handler(req, res) {
    const secret = process.env.N8N_SHARED_SECRET;

    /* ---- The email sweep. A machine, not a person. ---- */
    if (secret && secretMatches(req.headers.authorization, secret)) {
        const supabase = getClient();

        if (req.method === "GET" && req.query?.pending === "1") {
            try {
                const [dueRes, peopleRes] = await Promise.all([
                    supabase
                        .from("announcements")
                        .select("id, category, title, body, publish_at")
                        .is("emailed_at", null)
                        .is("archived_at", null)
                        .lte("publish_at", new Date().toISOString())
                        .order("publish_at", { ascending: true })
                        .limit(5),
                    supabase
                        .from("resident_accounts")
                        .select("contact_email, lot_id, disabled_at, email_opt_in")
                        .not("contact_email", "is", null)
                        .is("disabled_at", null)
                        .eq("email_opt_in", true),
                ]);

                if (dueRes.error) throw new Error(dueRes.error.message);
                if (peopleRes.error) throw new Error(peopleRes.error.message);

                // One address each, even if somebody has two accounts on a lot.
                const recipients = [
                    ...new Set(
                        (peopleRes.data ?? [])
                            .map((r) => String(r.contact_email ?? "").trim().toLowerCase())
                            .filter((e) => e.includes("@")),
                    ),
                ];

                return res.status(200).json({
                    ok: true,
                    announcements: dueRes.data ?? [],
                    recipients,
                });
            } catch (err) {
                console.error("announcements pending failed", err?.message ?? err);
                return res.status(500).json({ error: "Could not read pending announcements" });
            }
        }

        if (req.method === "PATCH" && req.query?.emailed === "1") {
            const id = String(req.body?.id ?? "");
            if (!id) return res.status(400).json({ error: "Which announcement?" });

            const { error } = await supabase
                .from("announcements")
                .update({ emailed_at: new Date().toISOString() })
                .eq("id", id);

            if (error) return res.status(500).json({ error: "Could not mark it sent" });
            return res.status(200).json({ ok: true });
        }
    }

    /* ---- People ---- */
    let profile;
    try {
        ({ profile } = await requireUser(req));
    } catch (err) {
        return res.status(err?.status || 401).json({ error: err?.message || "Not signed in" });
    }

    const supabase = getClient();

    try {
        if (req.method === "GET") {
            requireCockpit(profile, CAN_READ);

            const { data, error } = await supabase
                .from("announcements")
                .select("*")
                .order("publish_at", { ascending: false })
                .limit(200);

            if (error) throw new Error(error.message);

            // How many residents an email would actually reach. Saying "sent
            // to everyone" when it reached four people is worse than saying
            // nothing - the office would stop chasing addresses.
            const { count } = await supabase
                .from("resident_accounts")
                .select("id", { count: "exact", head: true })
                .not("contact_email", "is", null)
                .is("disabled_at", null)
                .eq("email_opt_in", true);

            const { count: total } = await supabase
                .from("resident_accounts")
                .select("id", { count: "exact", head: true })
                .is("disabled_at", null);

            return res.status(200).json({
                announcements: data ?? [],
                reach: { withEmail: count ?? 0, residents: total ?? 0 },
                canWrite: CAN_WRITE.includes(profile.cockpit),
            });
        }

        if (req.method === "POST") {
            requireCockpit(profile, CAN_WRITE);

            const fields = clean(req.body);

            // Urgent items go stale fastest and matter most while they are
            // fresh, so they expire in a week unless told otherwise.
            const defaultExpiry =
                fields.category === "urgent"
                    ? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
                    : null;

            const { data, error } = await supabase
                .from("announcements")
                .insert({
                    ...fields,
                    pinned: Boolean(req.body?.pinned) || fields.category === "urgent",
                    publish_at: req.body?.publishAt
                        ? new Date(req.body.publishAt).toISOString()
                        : new Date().toISOString(),
                    expires_on: req.body?.expiresOn || defaultExpiry,
                    created_by: profile.cockpit,
                })
                .select()
                .single();

            if (error) throw new Error(error.message);
            return res.status(201).json({ ok: true, announcement: data });
        }

        if (req.method === "PATCH") {
            requireCockpit(profile, CAN_WRITE);

            const id = String(req.query?.id ?? "");
            if (!id) return res.status(400).json({ error: "Which announcement?" });

            const patch = { updated_by: profile.cockpit, updated_at: new Date().toISOString() };

            if (req.body?.archived === true) patch.archived_at = new Date().toISOString();
            if (req.body?.archived === false) patch.archived_at = null;
            if (typeof req.body?.pinned === "boolean") patch.pinned = req.body.pinned;
            if (req.body?.expiresOn !== undefined) patch.expires_on = req.body.expiresOn || null;

            if (req.body?.title || req.body?.body || req.body?.category) {
                Object.assign(patch, clean({ ...req.body }));
            }

            const { data, error } = await supabase
                .from("announcements")
                .update(patch)
                .eq("id", id)
                .select()
                .single();

            if (error) throw new Error(error.message);
            return res.status(200).json({ ok: true, announcement: data });
        }

        res.setHeader("Allow", "GET, POST, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        if (err?.status) return res.status(err.status).json({ error: err.message });
        console.error("announcements failed", err?.message ?? err);
        return res.status(500).json({ error: "Could not do that" });
    }
}
