// routes/rent-charges.js
// Creates each tenancy's monthly rent charge on the day it falls due.
//
// Run by Vercel Cron every morning, ahead of the late-fee job, so a charge
// always exists before anything decides whether it is late.
//
// Rent is due on the day of the month the tenancy started. This job asks each
// lot "is today your day, and has this month been charged yet", which means a
// resident who moves in on the 20th starts billing on the 20th without anybody
// configuring anything.
//
// What it deliberately does NOT do:
//   - charge a lot whose rent is a placeholder. Nobody has asked that resident
//     what they pay, and a charge built on a stand-in is a number we would
//     have to withdraw.
//   - charge a lot with no due day on file. Same reason.
//   - charge ahead of the due date. A balance that shows money owed before it
//     is owed teaches everyone to ignore the balance.
import { createClient } from "@supabase/supabase-js";
import {
    currentPeriod,
    dueDateFor,
    parkTodayISO,
} from "../lib/rentRules.js";

const PROPERTY = "Hometown Meadows MHP";

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

    // Same guard as the late-fee job. Without the secret set it refuses to run
    // rather than leaving an open endpoint that puts charges on residents.
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return res.status(500).json({ error: "CRON_SECRET is not set" });
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "Not authorised" });
    }

    try {
        const supabase = getClient();

        const period = currentPeriod();
        const today = parkTodayISO();

        const [lotsRes, chargesRes] = await Promise.all([
            supabase
                .from("lots")
                .select(
                    "id, lot_number, tenant_name, contract_rent, tenant_portion, rent_placeholder, rent_due_day",
                )
                .eq("property", PROPERTY)
                .eq("occupied", true)
                .not("contract_rent", "is", null),
            supabase
                .from("rent_ledger")
                .select("lot_id, charge_type")
                .eq("period", period)
                .eq("charge_type", "rent"),
        ]);

        if (lotsRes.error) throw lotsRes.error;
        if (chargesRes.error) throw chargesRes.error;

        const alreadyCharged = new Set(
            (chargesRes.data ?? []).map((c) => c.lot_id),
        );

        const charged = [];
        const passed = [];

        for (const lot of lotsRes.data ?? []) {
            if (lot.rent_placeholder) {
                passed.push({
                    lot: lot.lot_number,
                    why: "rent is a placeholder",
                });
                continue;
            }

            const due = dueDateFor(lot.rent_due_day, period);

            if (!due) {
                passed.push({ lot: lot.lot_number, why: "no due day on file" });
                continue;
            }

            if (due > today) {
                passed.push({ lot: lot.lot_number, why: `not due until ${due}` });
                continue;
            }

            if (alreadyCharged.has(lot.id)) {
                passed.push({ lot: lot.lot_number, why: "already charged" });
                continue;
            }

            // The tenant's share, not the contract rent. On an assisted
            // household the difference is the part the resident never owes.
            const amount = Number(lot.tenant_portion ?? lot.contract_rent);

            if (!Number.isFinite(amount) || amount <= 0) {
                passed.push({ lot: lot.lot_number, why: "no amount to charge" });
                continue;
            }

            // Marked verified, unlike a late fee. The amount was confirmed by a
            // person when the tenancy was recorded; this only repeats it on the
            // day it falls due, and is not a fresh judgement about anybody.
            const { error } = await supabase.from("rent_ledger").insert({
                lot_id: lot.id,
                period,
                charge_type: "rent",
                amount,
                due_date: due,
                source: "cron",
                verified_at: new Date().toISOString(),
                verified_by: "system",
            });

            // The unique index refuses a second charge for the month. If two
            // runs overlap, the loser is not an error.
            if (error && error.code !== "23505") throw error;

            charged.push({
                lot: lot.lot_number,
                tenant: lot.tenant_name,
                amount,
                due,
            });
        }

        if (charged.length > 0) {
            await supabase.from("notifications").insert({
                recipient: "raj",
                type: "rent_charged",
                title: `Rent charged on ${charged.length} ${charged.length === 1 ? "lot" : "lots"}`,
                body: charged
                    .map((c) => `Lot ${c.lot} $${c.amount} due ${c.due}`)
                    .join(", "),
                link: "/raj",
            });
        }

        return res.status(200).json({ ok: true, period, today, charged, passed });
    } catch (err) {
        console.error("rent-charges failed:", err);
        return res.status(500).json({ error: "Could not create rent charges" });
    }
}