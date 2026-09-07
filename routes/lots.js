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

const PROPERTY = "Hometown Meadows MHP";

const CAN_USE = ["zo", "raj", "dane"];

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
            const { data, error } = await supabase
                .from("lots")
                .select(
                    "id, lot_number, tenant_name, home_status, repair_note, bed, bath, sq_ft, notes, occupied, status_set_by, status_set_at, hap_household, tenancy_type",
                )
                .eq("property", PROPERTY);

            if (error) throw error;

            return res.status(200).json({ lots: data ?? [], statuses: STATUSES });
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