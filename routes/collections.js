// routes/collections.js
// Rent collections at Hometown Meadows.
//
// GET /api/collections            Zo's three tabs, and the same data Raj sees
// GET /api/collections?view=raj   the two approval queues plus deadlines
//
// Reads only. Every write lives in the POST and PATCH branches added
// separately, because the write rules are where this build can do harm and
// they deserve their own reading.
//
// Access, from the work order:
//   zo      - read the roll and ledger. Writes are payments, plan proposals,
//             notice photos, and a signed plan photo. That is the whole list.
//   raj     - everything, plus verify and approve.
//   ellery  - notices and cases only, for critical dates. No writes.
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../lib/apiAuth.js";

const PROPERTY = "Hometown Meadows MHP";

const CAN_READ_ROLL = ["zo", "raj", "dane"];
const CAN_READ_CASES = ["zo", "raj", "dane", "ellery"];

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

/**
 * A lot's balance is what was charged less what was paid. A reversing payment
 * carries a negative amount, so it subtracts itself back out and the sum stays
 * honest without anyone editing a row.
 */
function balanceFor(lotId, charges, payments) {
    const charged = charges
        .filter((c) => c.lot_id === lotId)
        .reduce((sum, c) => sum + Number(c.amount), 0);

    const paid = payments
        .filter((p) => p.lot_id === lotId)
        .reduce((sum, p) => sum + Number(p.amount), 0);

    return money(charged - paid);
}

/** Verified within 48 hours. Older than that and a notice must not generate. */
function isVerified(lotId, charges) {
    const rows = charges.filter((c) => c.lot_id === lotId);
    if (!rows.length) return false;

    const cutoff = Date.now() - 48 * 3600000;

    return rows.every(
        (c) => c.verified_at && new Date(c.verified_at).getTime() >= cutoff,
    );
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

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!CAN_READ_CASES.includes(profile.cockpit)) {
        return res.status(403).json({ error: "No access to collections" });
    }

    try {
        const supabase = getClient();

        const [lotsRes, chargesRes, paymentsRes, plansRes, noticesRes, casesRes] =
            await Promise.all([
                supabase.from("lots").select("*").eq("property", PROPERTY),
                supabase.from("rent_ledger").select("*"),
                supabase.from("payments").select("*"),
                supabase
                    .from("payment_plans")
                    .select("*, plan_installments(*)")
                    .order("proposed_at", { ascending: false }),
                supabase.from("notices").select("*").order("generated_at", { ascending: false }),
                supabase.from("eviction_cases").select("*"),
            ]);

        for (const r of [lotsRes, chargesRes, paymentsRes, plansRes, noticesRes, casesRes]) {
            if (r.error) throw r.error;
        }

        const lots = lotsRes.data ?? [];
        const charges = chargesRes.data ?? [];
        const payments = paymentsRes.data ?? [];
        const plans = plansRes.data ?? [];
        const notices = noticesRes.data ?? [];
        const cases = casesRes.data ?? [];

        // Ellery sees the legal side only - deadlines feed her pipeline, the
        // rent roll is not hers.
        if (profile.cockpit === "ellery") {
            return res.status(200).json({ notices, cases });
        }

        const openCaseByLot = new Map(
            cases.filter((c) => !c.possession_at).map((c) => [c.lot_id, c]),
        );

        const activePlanByLot = new Map(
            plans
                .filter((p) => ["approved", "active"].includes(p.status))
                .map((p) => [p.lot_id, p]),
        );

        const noticeByLot = new Map();
        for (const n of notices) {
            if (!noticeByLot.has(n.lot_id)) noticeByLot.set(n.lot_id, n);
        }

        const enriched = lots.map((lot) => {
            const owed = balanceFor(lot.id, charges, payments);
            const openCase = openCaseByLot.get(lot.id) ?? null;
            const plan = activePlanByLot.get(lot.id) ?? null;
            const notice = noticeByLot.get(lot.id) ?? null;

            return {
                ...lot,
                owed,
                verified: isVerified(lot.id, charges),
                // A lot with counsel is locked to everyone but Raj. Taking
                // money on it can get the case dismissed.
                locked: Boolean(openCase),
                open_case: openCase,
                active_plan: plan,
                latest_notice: notice,
                installments: plan
                    ? (plans.find((p) => p.id === plan.id)?.plan_installments ?? [])
                    : [],
            };
        });

        const withCounsel = enriched.filter((l) => l.locked);
        const pastDue = enriched.filter((l) => !l.locked && l.owed > 0);
        const current = enriched.filter((l) => !l.locked && l.owed <= 0);

        const collectedThisMonth = payments
            .filter((p) => new Date(p.received_at).getMonth() === new Date().getMonth())
            .reduce((sum, p) => sum + Number(p.amount), 0);

        const nextDeadline = cases
            .filter((c) => c.objection_deadline && !c.possession_at)
            .sort((a, b) => a.objection_deadline.localeCompare(b.objection_deadline))[0];

        const payload = {
            tiles: {
                occupied: lots.filter((l) => l.occupied).length,
                collected: money(collectedThisMonth),
                pastDue: pastDue.length,
                deadline: nextDeadline
                    ? {
                        lot: lots.find((l) => l.id === nextDeadline.lot_id)?.lot_number,
                        date: nextDeadline.objection_deadline,
                    }
                    : null,
            },
            pastDue,
            withCounsel,
            current,
            plans: {
                awaiting: plans.filter((p) => p.status === "proposed"),
                active: plans.filter((p) => ["approved", "active"].includes(p.status)),
            },
            notices: {
                toPost: notices.filter((n) => !n.posted_at),
                posted: notices.filter((n) => n.posted_at),
            },
        };

        if (req.query?.view === "raj") {
            if (profile.cockpit !== "raj" && profile.cockpit !== "dane") {
                return res.status(403).json({ error: "Not your queue" });
            }

            return res.status(200).json({
                // A balance only reaches Raj once something is owed and it has
                // not yet been verified. Verification is the gate on the whole
                // eviction cascade.
                verify: pastDue.filter((l) => !l.verified && !l.active_plan),
                approve: plans.filter((p) => p.status === "proposed"),
                deadlines: cases
                    .filter((c) => c.objection_deadline && !c.possession_at)
                    .map((c) => ({
                        ...c,
                        lot: lots.find((l) => l.id === c.lot_id) ?? null,
                    })),
            });
        }

        if (!CAN_READ_ROLL.includes(profile.cockpit)) {
            return res.status(403).json({ error: "No access to the rent roll" });
        }

        return res.status(200).json(payload);
    } catch (err) {
        console.error("collections failed:", err);
        return res.status(500).json({ error: "Could not load collections" });
    }
}