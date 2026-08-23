// routes/daily-task-items.js
// Checklist items belonging to a daily task. Informational only - they never
// block completing the task, they just show how far along it is.
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../lib/apiAuth.js";

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
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Items are only ever reached through their task, so the task decides access.
 * Returns the task row, or null once it has already answered the request.
 */
async function parentTask(supabase, taskId, profile, res) {
    if (!taskId) {
        res.status(400).json({ error: "task_id is required" });
        return null;
    }

    const { data, error } = await supabase
        .from("daily_tasks")
        .select("id, owner_cockpit, deleted_at")
        .eq("id", taskId)
        .single();

    if (error && error.code !== "PGRST116") throw error;

    if (!data || data.deleted_at) {
        res.status(404).json({ error: "Task not found" });
        return null;
    }

    // Raj acting as someone else passes this, because apiAuth swaps his cockpit.
    if (data.owner_cockpit !== profile.cockpit) {
        res.status(403).json({ error: "Not your task" });
        return null;
    }

    return data;
}

export default async function handler(req, res) {
    const auth = await requireUser(req, res);
    if (!auth) return;

    const { profile } = auth;

    try {
        const supabase = getClient();

        /* ---- LIST ---- */
        if (req.method === "GET") {
            const taskId = clean(req.query?.task_id, 64);
            if (!(await parentTask(supabase, taskId, profile, res))) return;

            const { data, error } = await supabase
                .from("daily_task_items")
                .select("*")
                .eq("task_id", taskId)
                .order("sort_order", { ascending: true })
                .order("created_at", { ascending: true });

            if (error) throw error;

            return res.status(200).json({ items: data ?? [] });
        }

        /* ---- ADD ---- */
        if (req.method === "POST") {
            const taskId = clean(req.body?.task_id, 64);
            if (!(await parentTask(supabase, taskId, profile, res))) return;

            const label = clean(req.body?.label, 300);
            if (!label) return res.status(400).json({ error: "label is required" });

            // Append to the end without making the client track positions.
            const { count } = await supabase
                .from("daily_task_items")
                .select("id", { count: "exact", head: true })
                .eq("task_id", taskId);

            const { data, error } = await supabase
                .from("daily_task_items")
                .insert({ task_id: taskId, label, sort_order: count ?? 0 })
                .select()
                .single();

            if (error) throw error;

            return res.status(201).json({ item: data });
        }

        /* ---- TICK or RENAME ---- */
        if (req.method === "PATCH") {
            const id = clean(req.body?.id, 64);
            if (!id) return res.status(400).json({ error: "id is required" });

            const { data: existing, error: findError } = await supabase
                .from("daily_task_items")
                .select("id, task_id")
                .eq("id", id)
                .single();

            if (findError && findError.code !== "PGRST116") throw findError;
            if (!existing) return res.status(404).json({ error: "Item not found" });
            if (!(await parentTask(supabase, existing.task_id, profile, res))) return;

            const now = new Date().toISOString();
            const patch = { updated_at: now };

            if (typeof req.body?.done === "boolean") {
                patch.done = req.body.done;
                patch.done_at = req.body.done ? now : null;
            }

            if (req.body?.label !== undefined) {
                const label = clean(req.body.label, 300);
                if (!label) return res.status(400).json({ error: "label is required" });
                patch.label = label;
            }

            const { data, error } = await supabase
                .from("daily_task_items")
                .update(patch)
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;

            return res.status(200).json({ item: data });
        }

        /* ---- REMOVE ---- */
        if (req.method === "DELETE") {
            const id = clean(req.query?.id || req.body?.id, 64);
            if (!id) return res.status(400).json({ error: "id is required" });

            const { data: existing, error: findError } = await supabase
                .from("daily_task_items")
                .select("id, task_id")
                .eq("id", id)
                .single();

            if (findError && findError.code !== "PGRST116") throw findError;
            if (!existing) return res.status(404).json({ error: "Item not found" });
            if (!(await parentTask(supabase, existing.task_id, profile, res))) return;

            // Hard delete: a checklist line carries no history worth keeping.
            const { error } = await supabase
                .from("daily_task_items")
                .delete()
                .eq("id", id);

            if (error) throw error;

            return res.status(200).json({ ok: true });
        }

        res.setHeader("Allow", "GET, POST, PATCH, DELETE");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("daily-task-items failed:", err);
        return res.status(500).json({ error: "Could not load the checklist" });
    }
}   