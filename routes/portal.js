// routes/portal.js
// What a resident sees. One lot, theirs, and nothing else.
//
// GET /api/portal    everything the dashboard needs, in one call
//
// Every query here filters on the lot that came out of the session, never on
// anything in the request. There is no lot parameter to tamper with, because
// there is no lot parameter.
//
// The rule the rest of the cockpit follows applies hardest here: the screen
// must never claim something the data cannot support. A resident reading a
// balance built on a placeholder rent would be reading a number we invented,
// and they would be right to argue with it.

import { createClient } from "@supabase/supabase-js";
import { requireResident } from "../lib/apiAuth.js";
import { currentPeriod, dueDateFor, lastDayToPay } from "../lib/rentRules.js";

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

const money = (value) => Math.round(Number(value ?? 0) * 100) / 100;

const CHARGE_LABEL = {
    rent: "Lot rent",
    late_fee: "Late fee",
    other: "Other charge",
};

// The portal is served from its own origin, so it has to be named here. Listed
// rather than wildcarded: only these can ask, and every one of them still has
// to carry a resident's token.
const ALLOWED_ORIGINS = [
    "https://portal.hometownmeadows.com",
    "https://hometownmeadows.com",
    "https://www.hometownmeadows.com",
    "http://localhost:5173",
];

export default async function handler(req, res) {
    const origin = String(req.headers.origin ?? "");

    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }

    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") return res.status(204).end();

    let session;
    try {
        session = await requireResident(req);
    } catch (err) {
        return res
            .status(err?.status || 401)
            .json({ error: err?.message || "Not signed in" });
    }

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { account, lot } = session;

    try {
        const supabase = getClient();

        const [chargesRes, paymentsRes, ordersRes, plansRes] = await Promise.all([
            supabase
                .from("rent_ledger")
                .select("id, period, charge_type, amount, due_date, created_at")
                .eq("lot_id", lot.id)
                .order("due_date", { ascending: false })
                .limit(60),
            supabase
                .from("payments")
                .select(
                    "id, amount, received_at, method, receipt_number, note, reverses_id",
                )
                .eq("lot_id", lot.id)
                .order("received_at", { ascending: false })
                .limit(60),
            supabase
                .from("work_orders")
                .select(
                    "id, title, note, category, priority, status, opened_at, completed_at, fix, receipt_number",
                )
                .eq("lot_id", lot.id)
                .order("opened_at", { ascending: false })
                .limit(40),
            supabase
                .from("payment_plans")
                .select("id, status, reason, proposed_at, approved_at, frequency")
                .eq("lot_id", lot.id)
                .in("status", ["approved", "active"])
                .order("proposed_at", { ascending: false })
                .limit(1),
        ]);

        for (const r of [chargesRes, paymentsRes, ordersRes, plansRes]) {
            if (r.error) throw new Error(r.error.message);
        }

        const charges = chargesRes.data ?? [];
        // A reversed payment is not money the resident has. Counting it would
        // show them a balance lower than what they actually owe.
        const payments = (paymentsRes.data ?? []).filter((p) => !p.reverses_id);

        const charged = money(
            charges.reduce((sum, c) => sum + Number(c.amount ?? 0), 0),
        );
        const paid = money(
            payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
        );

        const plan = plansRes.data?.[0] ?? null;
        let installments = [];

        if (plan) {
            const { data, error } = await supabase
                .from("plan_installments")
                .select("id, due_date, amount, paid_at")
                .eq("plan_id", plan.id)
                .order("due_date", { ascending: true });

            if (error) throw new Error(error.message);
            installments = data ?? [];
        }

        const period = currentPeriod();
        const due = dueDateFor(lot.rent_due_day, period);

        // A placeholder rent means nobody has confirmed the figure with this
        // resident. Showing it as a balance would be presenting a stand-in as
        // a debt. Better to say plainly that it is not settled.
        const rentConfirmed = !lot.rent_placeholder && lot.contract_rent != null;

        return res.status(200).json({
            resident: {
                name: lot.tenant_name ?? account.display_name ?? "Resident",
                lot: lot.lot_number,
                property: lot.property,
                movedIn: lot.move_in_on,
                assisted: Boolean(lot.hap_household),
            },
            rent: {
                confirmed: rentConfirmed,
                // On an assisted household this is the resident's share, not
                // the contract rent. They can never be chased for the rest.
                monthly: rentConfirmed
                    ? money(lot.tenant_portion ?? lot.contract_rent)
                    : null,
                dueDay: lot.rent_due_day,
                dueThisMonth: due,
                lastDayToPay: due ? lastDayToPay(due) : null,
            },
            balance: {
                charged,
                paid,
                outstanding: money(charged - paid),
            },
            charges: charges.map((c) => ({
                id: c.id,
                label: CHARGE_LABEL[c.charge_type] ?? "Charge",
                period: c.period,
                dueDate: c.due_date,
                amount: money(c.amount),
            })),
            payments: payments.map((p) => ({
                id: p.id,
                amount: money(p.amount),
                receivedAt: p.received_at,
                method: p.method,
                receipt: p.receipt_number,
                note: p.note,
            })),
            workOrders: (ordersRes.data ?? []).map((w) => ({
                id: w.id,
                title: w.title,
                detail: w.note,
                category: w.category,
                priority: w.priority,
                status: w.status,
                openedAt: w.opened_at,
                completedAt: w.completed_at,
                whatWasDone: w.fix,
            })),
            paymentPlan: plan
                ? {
                    id: plan.id,
                    status: plan.status,
                    frequency: plan.frequency,
                    agreedOn: plan.approved_at,
                    installments: installments.map((i) => ({
                        id: i.id,
                        dueDate: i.due_date,
                        amount: money(i.amount),
                        paid: Boolean(i.paid_at),
                    })),
                }
                : null,
            // The notices table holds legal notices - pay or quit, with
            // geo-tagged proof of posting. That is not what a resident portal
            // means by notices, and serving one through a web page is not
            // service. Community announcements have nowhere to live yet.
            notices: [],
        });
    } catch (err) {
        console.error("portal failed:", err);
        return res.status(500).json({ error: "Could not load your account" });
    }
}