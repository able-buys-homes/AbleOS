// routes/late-fees.js
// Charges the $75 late fee, once per lot per month, after the grace period.
//
// Run by Vercel Cron, not by a person and not by a screen. A charge that
// appears because someone opened a page is a charge nobody can account for.
//
// What it deliberately does NOT do:
//   - charge a lot with no recorded rent. Nothing is owed, so nothing is late.
//   - charge a lot on an approved payment plan. Those are terms Raj agreed to,
//     and chasing a resident who is doing exactly what was asked is the whole
//     failure this build exists to avoid.
//   - charge a lot with counsel. Money and arrangements on those lots can get
//     the case dismissed.
//   - mark its own charge verified. Verification is Raj's gate on notices, and
//     a machine must not walk through it.
import { createClient } from "@supabase/supabase-js";
import {
    LAST_DAY_TO_PAY,
    LATE_FEE,
    currentPeriod,
    parkToday,
    pastGrace,
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

    // Vercel Cron sends this header. Without the secret set, the job refuses
    // to run at all rather than leaving an open endpoint that charges money.
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
        const { year, month, day } = parkToday();
        const today = `${year}-${String(month).padStart(2, "0")}-${String(
            day,
        ).padStart(2, "0")}`;

        if (!pastGrace()) {
            return res.status(200).json({
                ok: true,
                charged: 0,
                skipped: "Still inside the grace period",
                period,
                today,
            });
        }

        const [lotsRes, chargesRes, paymentsRes, plansRes, casesRes] =
            await Promise.all([
                supabase
                    .from("lots")
                    .select("id, lot_number, tenant_name, contract_rent")
                    .eq("property", PROPERTY)
                    .not("contract_rent", "is", null),
                supabase.from("rent_ledger").select("*").eq("period", period),
                supabase.from("payments").select("*").gte("received_at", period),
                supabase.from("payment_plans").select("lot_id, status"),
                supabase.from("eviction_cases").select("lot_id, possession_at"),
            ]);

        for (const r of [lotsRes, chargesRes, paymentsRes, plansRes, casesRes]) {
            if (r.error) throw r.error;
        }

        const charges = chargesRes.data ?? [];
        const payments = paymentsRes.data ?? [];

        const onPlan = new Set(
            (plansRes.data ?? [])
                .filter((p) => ["approved", "active"].includes(p.status))
                .map((p) => p.lot_id),
        );

        const withCounsel = new Set(
            (casesRes.data ?? [])
                .filter((c) => !c.possession_at)
                .map((c) => c.lot_id),
        );

        const charged = [];
        const passed = [];

        for (const lot of lotsRes.data ?? []) {
            if (onPlan.has(lot.id)) {
                passed.push({ lot: lot.lot_number, why: "on a plan" });
                continue;
            }
            if (withCounsel.has(lot.id)) {
                passed.push({ lot: lot.lot_number, why: "with counsel" });
                continue;
            }

            const rentDue = charges
                .filter((c) => c.lot_id === lot.id && c.charge_type === "rent")
                .reduce((sum, c) => sum + Number(c.amount), 0);

            if (rentDue <= 0) {
                passed.push({ lot: lot.lot_number, why: "nothing charged" });
                continue;
            }

            // A resident cannot be late for a bill that did not exist. If the
            // rent was first recorded after the 5th, no fee applies for this
            // month - the same rule the roll uses to decide who is late. From
            // next month it behaves normally.
            const firstRentCharge = charges
                .filter((c) => c.lot_id === lot.id && c.charge_type === "rent")
                .sort((a, b) =>
                    String(a.created_at).localeCompare(String(b.created_at)),
                )[0];

            if (
                firstRentCharge &&
                parkToday(new Date(firstRentCharge.created_at)).day >
                    LAST_DAY_TO_PAY
            ) {
                passed.push({
                    lot: lot.lot_number,
                    why: "rent recorded after the 5th",
                });
                continue;
            }

            const alreadyFeed = charges.some(
                (c) => c.lot_id === lot.id && c.charge_type === "late_fee",
            );
            if (alreadyFeed) {
                passed.push({ lot: lot.lot_number, why: "fee already applied" });
                continue;
            }

            const paid = payments
                .filter((p) => p.lot_id === lot.id)
                .reduce((sum, p) => sum + Number(p.amount), 0);

            if (paid >= rentDue) {
                passed.push({ lot: lot.lot_number, why: "paid" });
                continue;
            }

            // verified_at is left null on purpose. Raj verifies before a notice
            // can rest on this.
            const { error } = await supabase.from("rent_ledger").insert({
                lot_id: lot.id,
                period,
                charge_type: "late_fee",
                amount: LATE_FEE,
                due_date: today,
                source: "manual",
            });

            // The unique index refuses a second fee for the month. If two runs
            // overlap, the loser is not an error.
            if (error && error.code !== "23505") throw error;

            charged.push({
                lot: lot.lot_number,
                tenant: lot.tenant_name,
                short: Math.round((rentDue - paid) * 100) / 100,
            });
        }

        if (charged.length > 0) {
            await supabase.from("notifications").insert({
                recipient: "raj",
                type: "late_fees_applied",
                title: `${charged.length} late ${charged.length === 1 ? "fee" : "fees"
                    } charged`,
                body: `$${LATE_FEE} added to ${charged
                    .map((c) => `Lot ${c.lot}`)
                    .join(", ")}. Nothing is verified, so no notice can generate yet.`,
                link: "/raj/approvals",
            });
        }

        return res.status(200).json({
            ok: true,
            period,
            today,
            charged,
            passed,
        });
    } catch (err) {
        console.error("late-fees failed:", err);
        return res.status(500).json({ error: "Could not apply late fees" });
    }
}