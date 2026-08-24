// routes/intake-health.js
// Watches the deal intake so a silent failure can't go unnoticed.
//
// GET   /api/intake-health            signed-in: last successful intake, for the dashboard
// POST  /api/intake-health            machine, x-intake-secret:
//         { action: "failure", source, message }   something broke - alert now
//         { action: "heartbeat" }                  nothing arrived - alert if stale
//
// A broken Gmail credential and a quiet week look identical from the outside.
// The heartbeat is what tells them apart.
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { requireUser } from "../lib/apiAuth.js";
import { raiseIntakeAlert } from "../lib/intakeAlert.js";

/** Quiet for this long on a working day means something is wrong. */
const STALE_AFTER_HOURS = 24;

const ALLOWED_COCKPITS = ["raj", "dane"];

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

function secretMatches(supplied) {
    const expected = process.env.DEAL_INTAKE_SECRET;
    if (!expected || typeof supplied !== "string") return false;

    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
}

function clean(value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function lastIntake(supabase) {
    const { data, error } = await supabase
        .from("intake_messages")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data?.created_at ?? null;
}

function hoursSince(iso) {
    if (!iso) return null;
    return (Date.now() - new Date(iso).getTime()) / 3600000;
}

export default async function handler(req, res) {
    try {
        const supabase = getClient();

        /* ---- Dashboard read ---- */
        if (req.method === "GET") {
            const auth = await requireUser(req, res);
            if (!auth) return;

            if (!ALLOWED_COCKPITS.includes(auth.profile.cockpit)) {
                return res.status(403).json({ error: "Not your queue" });
            }

            const last = await lastIntake(supabase);
            const hours = hoursSince(last);

            return res.status(200).json({
                lastIntakeAt: last,
                hoursSince: hours === null ? null : Math.round(hours * 10) / 10,
                stale: hours !== null && hours >= STALE_AFTER_HOURS,
            });
        }

        /* ---- Machine ---- */
        if (req.method === "POST") {
            if (!secretMatches(req.headers["x-intake-secret"])) {
                return res.status(401).json({ error: "Not authorised" });
            }

            const action = clean(req.body?.action, 20) || "failure";

            if (action === "failure") {
                const source = clean(req.body?.source, 120) || "deal intake";
                const message = clean(req.body?.message, 400) || "No detail given";

                const result = await raiseIntakeAlert(supabase, {
                    title: `Deal intake failed: ${source}`,
                    body: message,
                });

                return res.status(200).json({ ok: true, ...result });
            }

            if (action === "heartbeat") {
                const last = await lastIntake(supabase);
                const hours = hoursSince(last);

                // Weekends are quiet legitimately. Checked in UTC, which is close
                // enough for a once-a-day check.
                const day = new Date().getUTCDay();
                const weekend = day === 0 || day === 6;

                const stale = hours === null || hours >= STALE_AFTER_HOURS;

                if (stale && !weekend) {
                    const howLong =
                        hours === null
                            ? "ever"
                            : `${Math.round(hours)} hours`;

                    const result = await raiseIntakeAlert(supabase, {
                        title: "No deals have arrived",
                        body: `Nothing has come through underwriting@ in ${howLong}. The intake may have stopped.`,
                    });

                    return res.status(200).json({
                        ok: true,
                        stale: true,
                        lastIntakeAt: last,
                        ...result,
                    });
                }

                return res.status(200).json({
                    ok: true,
                    stale,
                    weekend,
                    lastIntakeAt: last,
                    alerted: false,
                });
            }

            return res.status(400).json({ error: "Unknown action" });
        }

        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
    } catch (err) {
        console.error("intake-health failed:", err);
        return res.status(500).json({ error: "Could not check the intake" });
    }
}