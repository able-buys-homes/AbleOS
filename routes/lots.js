// routes/lots.js
// Every lot at the park, occupied or not, and the one write that changes what
// a lot is.
//
// GET   /api/lots          the whole site - what the Map draws
// PATCH /api/lots          change a lot's status, or its repair note
//
// The Rent screen deliberately does not use this. Rent shows people who owe
// rent; this shows ground. Both read the same `home_status`, which is why
// they can no longer disagree.
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../lib/apiAuth.js";
import { parkToday, pastGrace } from "../lib/rentRules.js";

const PROPERTY = "Hometown Meadows MHP";

const CAN_USE = ["zo", "raj", "dane"];

/** Which open job to name on a lot card when there is more than one. */
const JOB_RANK = { emergency: 0, urgent: 1, routine: 2, cosmetic: 3 };

const STATUSES = [
    "occupied",
    "ready",
    "moving_out",
    "needs_repair",
    "full_rehab",
    "common_area",
    "verify",
];

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

function money(value) {
    return Math.round(Number(value ?? 0) * 100) / 100;
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

    if (!CAN_USE.includes(profile.cockpit)) {
        return res.status(403).json({ error: "Not your screen" });
    }

    if (!["GET", "PATCH"].includes(req.method)) {
        res.setHeader("Allow", "GET, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const supabase = getClient();

        if (req.method === "GET") {
            const [lotsRes, chargesRes, paymentsRes, plansRes, jobsRes] =
                await Promise.all([
                    supabase
                        .from("lots")
                        .select(
                            "id, lot_number, tenant_name, home_status, repair_note, bed, bath, sq_ft, notes, occupied, status_set_by, status_set_at, hap_household, tenancy_type, contract_rent, tenant_portion, next_inspection_at, next_inspection_set_by, next_inspection_set_at",
                        )
                        .eq("property", PROPERTY),
                    supabase.from("rent_ledger").select("lot_id, amount"),
                    supabase.from("payments").select("lot_id, amount"),
                    supabase.from("payment_plans").select("lot_id, status"),
                    // Open work only. A finished job on the card would read as
                    // something still waiting to be done.
                    supabase
                        .from("work_orders")
                        .select("id, lot_id, title, priority, status")
                        .not("status", "in", "(completed,cancelled)"),
                ]);

            for (const r of [
                lotsRes,
                chargesRes,
                paymentsRes,
                plansRes,
                jobsRes,
            ]) {
                if (r.error) throw r.error;
            }

            const openJobs = jobsRes.data ?? [];

            const charges = chargesRes.data ?? [];
            const payments = paymentsRes.data ?? [];

            const onPlan = new Set(
                (plansRes.data ?? [])
                    .filter((p) => ["approved", "active"].includes(p.status))
                    .map((p) => p.lot_id),
            );

            // The same answer for every lot this month, decided once.
            const graceOver = pastGrace();

            // rent_state is what the map paints an occupied home. It is null
            // for an empty one - an empty home cannot be paid, late or on a
            // plan, and colouring it as though it could is the confusion this
            // whole change exists to remove.
            const lots = (lotsRes.data ?? []).map((lot) => {
                const charged = charges
                    .filter((c) => c.lot_id === lot.id)
                    .reduce((sum, c) => sum + Number(c.amount), 0);

                const paid = payments
                    .filter((p) => p.lot_id === lot.id)
                    .reduce((sum, p) => sum + Number(p.amount), 0);

                const owed = money(charged - paid);

                let rentState = null;

                if (lot.occupied) {
                    if (onPlan.has(lot.id)) {
                        rentState = "on_plan";
                    } else if (owed > 0 && graceOver) {
                        rentState = "late";
                    } else if (lot.contract_rent != null && owed <= 0) {
                        rentState = "paid";
                    } else {
                        // Occupied, and nothing to act on. Covers both "no rent
                        // recorded yet" and "owes but the 5th has not passed" -
                        // neither is a claim that they have paid.
                        rentState = "occupied";
                    }
                }

                // The worst open job on this lot, and how many there are. The
                // card names one and counts the rest - "Water leak
                // (Emergency)" tells Zo where to walk; "3 jobs" does not.
                const mine = openJobs
                    .filter((j) => j.lot_id === lot.id)
                    .sort(
                        (a, b) =>
                            (JOB_RANK[a.priority] ?? 9) -
                            (JOB_RANK[b.priority] ?? 9),
                    );

                return {
                    ...lot,
                    owed,
                    rent_state: rentState,
                    open_job_count: mine.length,
                    top_job: mine[0]
                        ? {
                              id: mine[0].id,
                              title: mine[0].title,
                              priority: mine[0].priority,
                          }
                        : null,
                };
            });

            return res.status(200).json({ lots, statuses: STATUSES });
        }

        /* ---- schedule the next inspection, one lot or many ---- */
        //
        // One code path for a single home and for twenty. A separate
        // "bulk" endpoint would eventually disagree with the single one about
        // what a valid date is, and the difference would show up as a home
        // scheduled for a day nobody meant.
        if (Array.isArray(req.body?.lot_ids)) {
            const ids = req.body.lot_ids.map((id) => String(id)).filter(Boolean);

            if (ids.length === 0) {
                return res.status(400).json({ error: "Pick at least one lot" });
            }

            const raw = req.body?.next_inspection_at;

            let date = null;

            if (raw !== null && raw !== undefined && String(raw) !== "") {
                const text = String(raw).slice(0, 10);

                if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                    return res.status(400).json({ error: "Pick a date" });
                }

                // A date already gone is a typo, and it would sit on the roll
                // looking like an inspection somebody missed.
                const { year, month, day } = parkToday();
                const today = `${year}-${String(month).padStart(2, "0")}-${String(
                    day,
                ).padStart(2, "0")}`;

                if (text < today) {
                    return res.status(400).json({
                        error: "That date has already passed. Pick today or later.",
                    });
                }

                date = text;
            }

            const { error: inspectError } = await supabase
                .from("lots")
                .update({
                    next_inspection_at: date,
                    // Cleared together with the date. Provenance for a date
                    // that no longer exists is just noise.
                    next_inspection_set_by: date ? profile.cockpit : null,
                    next_inspection_set_at: date
                        ? new Date().toISOString()
                        : null,
                    updated_at: new Date().toISOString(),
                })
                .in("id", ids);

            if (inspectError) throw inspectError;

            const homes = `${ids.length} ${ids.length === 1 ? "home" : "homes"}`;

            return res.status(200).json({
                ok: true,
                message: date
                    ? `Inspection set for ${homes}.`
                    : `Inspection date cleared on ${homes}.`,
            });
        }

        /* ---- change what a lot is ---- */
        const lotId = String(req.body?.lot_id || "");
        if (!lotId) return res.status(400).json({ error: "Which lot?" });

        const { data: lot, error: lotError } = await supabase
            .from("lots")
            .select("id, lot_number, tenant_name, home_status")
            .eq("id", lotId)
            .maybeSingle();

        if (lotError) throw lotError;
        if (!lot) return res.status(404).json({ error: "No such lot" });

        const patch = {
            status_set_by: profile.cockpit,
            status_set_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        // The repair note on its own, without touching the status.
        if (req.body?.repair_note !== undefined) {
            patch.repair_note = req.body.repair_note
                ? String(req.body.repair_note).slice(0, 2000)
                : null;
        }

        let message = "Saved.";

        if (req.body?.home_status !== undefined) {
            const next = String(req.body.home_status);

            if (!STATUSES.includes(next)) {
                return res.status(400).json({ error: "That is not a status" });
            }

            // A home cannot be occupied by nobody. Marking it occupied without
            // a name puts a lot on the rent roll that cannot be charged and
            // cannot be chased - it reads as a resident with no name.
            const nameGiven = req.body?.tenant_name
                ? String(req.body.tenant_name).trim()
                : "";

            if (next === "occupied" && !lot.tenant_name && !nameGiven) {
                return res.status(400).json({
                    error: "Who has moved in? Record the name — a home cannot be occupied by nobody.",
                });
            }

            if (nameGiven) patch.tenant_name = nameGiven;

            patch.home_status = next;

            // Moving a lot off `occupied` takes it off the rent roll. If money
            // is owed, that balance stops being visible to anyone - so Raj is
            // told rather than it going quiet.
            if (lot.home_status === "occupied" && next !== "occupied") {
                const [chargesRes, paymentsRes] = await Promise.all([
                    supabase.from("rent_ledger").select("amount").eq("lot_id", lotId),
                    supabase.from("payments").select("amount").eq("lot_id", lotId),
                ]);

                if (chargesRes.error) throw chargesRes.error;
                if (paymentsRes.error) throw paymentsRes.error;

                const owed = money(
                    (chargesRes.data ?? []).reduce((s, c) => s + Number(c.amount), 0) -
                    (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0),
                );

                if (owed > 0) {
                    await supabase.from("notifications").insert({
                        recipient: "raj",
                        type: "lot_vacated_owing",
                        title: `Lot ${lot.lot_number} marked ${next} owing $${owed}`,
                        body: `${profile.cockpit} changed the status while $${owed} was outstanding${lot.tenant_name ? ` for ${lot.tenant_name}` : ""
                            }. The lot has left the rent roll, so nothing will chase it now.`,
                        link: "/raj/approvals",
                    });

                    message = `Saved. $${owed} was still outstanding — it has left the rent roll and Raj has been told.`;
                }
            }
        }

        // The tenant's name is never cleared here. Someone who moved out owing
        // rent is still the person who owes it.
        const { error: updateError } = await supabase
            .from("lots")
            .update(patch)
            .eq("id", lotId);

        if (updateError) throw updateError;

        return res.status(200).json({ ok: true, message });
    } catch (err) {
        console.error("lots failed:", err);
        return res.status(500).json({ error: "Could not load or save the lots" });
    }
}