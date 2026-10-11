// routes/deposit-alerts.js
// Daily deposit deadline alerts (T-25). Run by Vercel Cron, not by a person.
// For each open deposit it asks lib/depositRules.js whether today is an alert
// day - 14 days left, 3 days left, or overdue (on the first overdue day, then
// weekly) - and tells the people in deposit_settings.alert_recipients for that
// portfolio. Lot or door only - never a resident's name.

import { createClient } from "@supabase/supabase-js";
import { alertToday, depositClock } from "../lib/depositRules.js";
import { sendPush } from "../lib/sendPush.js";

const LINK = { raj: "/raj/deposits", dane: "/raj/deposits", zo: "/zo/deposits", ellery: "/ellery/deposits" };

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(500).json({ error: "CRON_SECRET is not set" });
    if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Not authorised" });

    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

        const [depRes, mailRes, setRes, lotRes, unitRes, propRes] = await Promise.all([
            supabase.from("deposits").select("*").is("closed_on", null).not("surrender_on", "is", null),
            supabase.from("deposit_mail_log").select("deposit_id, method, returned_undeliverable_on"),
            supabase.from("deposit_settings").select("portfolio, alert_recipients"),
            supabase.from("lots").select("id, lot_number"),
            supabase.from("property_units").select("id, property_id, label"),
            supabase.from("properties").select("id, name"),
        ]);
        for (const r of [depRes, mailRes, setRes, lotRes, unitRes, propRes]) if (r.error) throw r.error;

        const recipients = new Map((setRes.data ?? []).map((s) => [s.portfolio, s.alert_recipients ?? []]));
        const lotNo = new Map((lotRes.data ?? []).map((l) => [l.id, l.lot_number]));
        const propName = new Map((propRes.data ?? []).map((p) => [p.id, p.name]));
        const unitName = new Map((unitRes.data ?? []).map((u) => [u.id,
            [propName.get(u.property_id), u.label && u.label !== "Whole home" ? u.label : null].filter(Boolean).join(" · ") || "AHTX door"]));

        const sent = [];
        for (const d of depRes.data ?? []) {
            const dep = { ...d, mail: (mailRes.data ?? []).filter((m) => m.deposit_id === d.id) };
            const alert = alertToday(dep, today);
            if (!alert) continue;
            const clock = depositClock(dep, today);
            // Overdue: the first day, then once a week - not every morning.
            if (alert === "overdue" && (-clock.days_left) % 7 !== 1) continue;

            const where = d.lot_id ? `Lot ${lotNo.get(d.lot_id) ?? "?"}` : unitName.get(d.unit_id) ?? "AHTX door";
            const title = alert === "overdue"
                ? `${where}: deposit refund is overdue`
                : `${where}: deposit refund due in ${clock.days_left} days`;
            const body = `Due ${clock.due_on} under ${d.jurisdiction_rule}. ${clock.warnings.join(" ")}`.trim();

            for (const who of recipients.get(d.portfolio) ?? []) {
                const link = LINK[who] ?? "/";
                await supabase.from("notifications").insert({ recipient: who, type: "deposit_deadline", title, body, link })
                    .then(() => null, () => null);
                await sendPush(who, { title, body, url: link }).catch(() => null);
                sent.push({ deposit: d.id, who, alert });
            }
        }
        return res.status(200).json({ ok: true, today, sent });
    } catch (err) {
        console.error("deposit-alerts failed:", err?.message ?? err);
        return res.status(500).json({ error: "Could not send deposit alerts" });
    }
}
