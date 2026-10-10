// routes/late-fees.js
// Charges the $75 late fee, once per lot per month, after the grace period.
// Checks this month AND last month (Dev #12, 11 Oct 2026): a resident due on
// the 28th has a grace period that ends in the next month and used to be
// skipped. The rules themselves live in lib/lateFeeDecision.js.
//
// Run by Vercel Cron, not by a person and not by a screen. A charge that
// appears because someone opened a page is a charge nobody can account for.
//
// What it deliberately does NOT do:
//   - charge a lot with no recorded rent. Nothing is owed, so nothing is late.
//   - charge a lot whose rent is a placeholder, or that has no due day on
//     file. Both mean nobody has asked the resident what they actually pay,
//     and a $75 fee resting on a figure we invented is not something anyone
//     could defend to them, or to a judge.
//   - charge a lot on an approved payment plan. Those are terms Raj agreed to,
//     and chasing a resident who is doing exactly what was asked is the whole
//     failure this build exists to avoid.
//   - charge a lot with counsel. Money and arrangements on those lots can get
//     the case dismissed.
//   - mark its own charge verified. Verification is Raj's gate on notices, and
//     a machine must not walk through it.
import { createClient } from "@supabase/supabase-js";
import { notifyResident } from "../lib/notifyResident.js";
import {
    LATE_FEE,
    LATENESS_PAUSED,
    currentPeriod,
    parkToday,
} from "../lib/rentRules.js";
import { decideLateFee, previousPeriod } from "../lib/lateFeeDecision.js";

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

        // No park-wide gate any more. Every tenancy has its own due day, so
        // this runs every day and decides lot by lot.

        const prev = previousPeriod(period);
        const [py, pm] = prev.split("-").map(Number);
        // Payments from a week before last month's 1st, so early payers for
        // either month are seen. lateFeeDecision narrows it per month.
        const paymentsFrom = new Date(Date.UTC(py, pm - 1, 1 - 7)).toISOString().slice(0, 10);

        const [lotsRes, chargesRes, paymentsRes, plansRes, casesRes] =
            await Promise.all([
                supabase
                    .from("lots")
                    .select(
                        "id, lot_number, tenant_name, contract_rent, rent_placeholder, rent_due_day",
                    )
                    .eq("property", PROPERTY)
                    .not("contract_rent", "is", null),
                // Current tenancy only: a lot that changed hands never charges
                // the new resident for the old one's month.
                supabase.from("rent_ledger_current").select("*").in("period", [prev, period]),
                supabase.from("payments_current").select("*").gte("received_at", paymentsFrom),
                supabase.from("payment_plans_current").select("lot_id, status"),
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

            const lotCharges = charges.filter((c) => c.lot_id === lot.id);
            const lotPayments = payments.filter((p) => p.lot_id === lot.id);

            // Last month first, so its payments are judged before this month's.
            for (const p of [prev, period]) {
                const d = decideLateFee({
                    lot,
                    period: p,
                    currentPeriod: period,
                    today,
                    charges: lotCharges,
                    payments: lotPayments,
                    paused: LATENESS_PAUSED,
                });

                if (!d.charge) {
                    passed.push({ lot: lot.lot_number, period: p, why: d.why });
                    continue;
                }

                // verified_at is left null on purpose. Raj verifies before a
                // notice can rest on this.
                const { error } = await supabase.from("rent_ledger").insert({
                    lot_id: lot.id,
                    period: p,
                    charge_type: "late_fee",
                    amount: LATE_FEE,
                    due_date: today,
                    source: "manual",
                });

                // rent_ledger_one_late_fee_per_period refuses a second fee for
                // the same lot and month. If two runs overlap, the loser is
                // not an error and nobody is told twice.
                if (error && error.code !== "23505") throw error;
                if (error) {
                    passed.push({ lot: lot.lot_number, period: p, why: "fee already applied" });
                    continue;
                }

                await notifyResident(supabase, lot.id, {
                    type: "late_fee",
                    title: `A $${LATE_FEE} late fee was added`,
                    body: p === period
                        ? "This month's rent was not paid by the last day to pay."
                        : "Last month's rent was not paid by the last day to pay.",
                    link: "/payments",
                });

                charged.push({
                    lot: lot.lot_number,
                    period: p,
                    tenant: lot.tenant_name,
                    short: d.short,
                });
            }
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