// routes/health.js
// Is the system up? Deliberately unauthenticated - a monitor that needs a
// credential is a monitor that stops working when the credential does.
//
// GET /api/health   200 if Vercel is serving and Supabase answers, 503 if not
//
// Returns nothing about the data. A caller learns only whether the lights are
// on, which is the entire point.
import { createClient } from "@supabase/supabase-js";

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

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Never cached. A cached 200 would keep reporting healthy after the
    // database had gone, which is worse than having no monitor at all.
    res.setHeader("Cache-Control", "no-store");

    try {
        const supabase = getClient();

        // Cheapest query that proves the connection: a count, no rows returned.
        const { error } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true });

        if (error) throw error;

        return res.status(200).json({ ok: true, checkedAt: new Date().toISOString() });
    } catch (err) {
        console.error("health check failed:", err);

        // 503 rather than 500, so a monitor reads it as "down" and not as a
        // bug in the check itself.
        return res.status(503).json({ ok: false, error: "Database unreachable" });
    }
}