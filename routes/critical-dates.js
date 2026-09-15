// routes/critical-dates.js
// Dates that cost money if missed - option periods, response deadlines,
// rent commencement, lender notice windows.
//
// GET   /api/critical-dates   outstanding dates, soonest first
// POST  /api/critical-dates   add one
// PATCH /api/critical-dates   mark done, or correct it

import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../lib/apiAuth.js";

const ALLOWED_COCKPITS = ["ellery", "raj", "dane"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    if (!trimmed) return null;
    return trimmed.slice(0, max);
}

export default async function handler(req, res) {
    let caller;
    try {
        caller = await requireUser(req);
    } catch (err) {
        return res
            .status(err?.status || 401)
            .json({ error: err?.message || "Not authorised" });
    }

    const { profile } = caller;

    if (!ALLOWED_COCKPITS.includes(profile.cockpit)) {
        return res.status(403).json({ error: "No access to critical dates" });
    }

    try {
        const supabase = getClient();

        /* ---- LIST ---- */
        if (req.method === "GET") {
            // Done dates are history; only ask for them explicitly.
            const includeDone = req.query?.includeDone === "true";

            let query = supabase
                .from("critical_dates")
                .select("*")
                .order("due_on", { ascending: true })
                .limit(200);

            if (!includeDone) query = query.is("completed_at", null);

            const { data, error } = await query;
            if (error) throw new Error(error.message);

            return res.status(200).json({ dates: data ?? [] });
        }

        /* ---- ADD ---- */
        if (req.method === "POST") {
            const dealName = clean(req.body?.dealName, 200);
            const label = clean(req.body?.label, 200);
            const dueOn = clean(req.body?.dueOn, 10);

            if (!dealName) {
                return res.status(400).json({ error: "A deal name is required" });
            }
            if (!label) {
                return res
                    .status(400)
                    .json({ error: "What is the date for? e.g. option period ends" });
            }
            if (!dueOn || !DATE_RE.test(dueOn)) {
                return res.status(400).json({ error: "A valid date is required" });
            }

            const { data, error } = await supabase
                .from("critical_dates")
                .insert({
                    deal_id: clean(req.body?.dealId, 64),
                    deal_name: dealName,
                    label,
                    due_on: dueOn,
                    kind: clean(req.body?.kind, 60),
                    // Which book it belongs to. Defaults to Hometown Meadows,
                    // because that is where everything recorded so far lives.
                    portfolio: req.body?.portfolio === "ahtx" ? "ahtx" : "htm",
                    created_by: profile.cockpit,
                })
                .select()
                .single();

            if (error) throw new Error(error.message);

            return res.status(201).json({ date: data });
        }

        /* ---- DONE OR CORRECT ---- */
        if (req.method === "PATCH") {
            const id = clean(req.body?.id, 64);
            if (!id) return res.status(400).json({ error: "id is required" });

            const patch = { updated_at: new Date().toISOString() };

            if (req.body?.done === true) {
                patch.completed_at = new Date().toISOString();
                patch.completed_by = profile.cockpit;
            }

            // Undo, for the inevitable mis-tap.
            if (req.body?.done === false) {
                patch.completed_at = null;
                patch.completed_by = null;
            }

            if (req.body?.label !== undefined) {
                patch.label = clean(req.body.label, 200);
            }

            if (req.body?.portfolio !== undefined) {
                const portfolio = String(req.body.portfolio);
                if (portfolio !== "ahtx" && portfolio !== "htm") {
                    return res.status(400).json({ error: "That is not a book" });
                }
                patch.portfolio = portfolio;
            }

            if (req.body?.dueOn !== undefined) {
                const dueOn = clean(req.body.dueOn, 10);
                if (!dueOn || !DATE_RE.test(dueOn)) {
                    return res.status(400).json({ error: "A valid date is required" });
                }
                patch.due_on = dueOn;
            }

            const { data, error } = await supabase
                .from("critical_dates")
                .update(patch)
                .eq("id", id)
                .select()
                .single();

            if (error && error.code !== "PGRST116") throw new Error(error.message);
            if (!data) return res.status(404).json({ error: "Date not found" });

            return res.status(200).json({ date: data });
        }

        res.setHeader("Allow", "GET, POST, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("critical-dates error:", err);
        return res.status(500).json({ error: "Could not load critical dates" });
    }
}