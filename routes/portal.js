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

    const { account, lot } = session;

    // Rent payment. It lives on this route so it inherits requireResident
    // above - which means the lot comes from the session, never from the
    // request body. A resident cannot pay against someone else's home.
    if (req.method === "POST" && req.query.checkout === "1") {
        return startRentCheckout(req, res, { lot, account, origin });
    }

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

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

/**
 * Starts a Stripe Checkout session for rent.
 *
 * The amount the browser sends is a request, not an instruction. What gets
 * charged is min(request, outstanding), computed here from the ledger in the
 * same process that calls Stripe - there is no hop in between where the
 * figure could be altered.
 */
async function startRentCheckout(req, res, { lot, account, origin }) {
    const secret = process.env.STRIPE_SECRET_KEY;

    if (!secret) {
        return res
            .status(503)
            .json({ error: "Card payments are not switched on yet." });
    }

    // A placeholder rent means nobody has confirmed the figure with this
    // resident. We will not take money against a number they never agreed to.
    if (lot.rent_placeholder || lot.contract_rent == null) {
        return res.status(409).json({
            error: "Your rent is still being confirmed. Please call the office before paying online.",
        });
    }

    const supabase = getClient();

    // A lot with counsel is untouchable. Accepting money after the file is
    // with Barrett can get the case dismissed. Same rule as Zo's screen, and
    // it is a server check on both.
    const { data: openCase, error: caseError } = await supabase
        .from("eviction_cases")
        .select("id")
        .eq("lot_id", lot.id)
        .is("possession_at", null)
        .maybeSingle();

    if (caseError) {
        return res.status(500).json({ error: "Could not check that home" });
    }

    if (openCase) {
        return res.status(409).json({
            error: "This account is with our attorney. Please call the office - we cannot take a card payment here.",
        });
    }

    // The same two sums the dashboard shows, but with no row limit, so the cap
    // is the real balance rather than the most recent sixty lines of it.
    const [chargesRes, paymentsRes] = await Promise.all([
        supabase.from("rent_ledger").select("amount").eq("lot_id", lot.id),
        supabase
            .from("payments")
            .select("amount, reverses_id")
            .eq("lot_id", lot.id),
    ]);

    if (chargesRes.error || paymentsRes.error) {
        return res.status(500).json({ error: "Could not read your balance" });
    }

    const charged = (chargesRes.data ?? []).reduce(
        (sum, c) => sum + Number(c.amount ?? 0),
        0,
    );

    // A reversed payment is not money we hold, so it cannot reduce what they
    // are allowed to pay.
    const paid = (paymentsRes.data ?? [])
        .filter((p) => !p.reverses_id)
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

    const outstandingCents = Math.round((charged - paid) * 100);

    if (outstandingCents <= 0) {
        return res
            .status(409)
            .json({ error: "You have nothing outstanding. Thank you." });
    }

    const requestedCents = Math.round(Number(req.body?.amount ?? 0) * 100);

    // No amount sent means pay it all. An amount above the balance is capped
    // rather than refused - overpaying by accident should not cost them a trip
    // to the office to get it back.
    const amountCents =
        requestedCents > 0
            ? Math.min(requestedCents, outstandingCents)
            : outstandingCents;

    if (amountCents < 100) {
        return res
            .status(400)
            .json({ error: "The smallest card payment is $1.00." });
    }

    const site = ALLOWED_ORIGINS.includes(origin)
        ? origin
        : "https://hometownmeadows.com";

    const form = {
        mode: "payment",
        "payment_method_types[0]": "card",
        success_url: `${site}/portal/payments?paid=1`,
        cancel_url: `${site}/portal/payments?cancelled=1`,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(amountCents),
        "line_items[0][price_data][product_data][name]": `Rent - Lot ${lot.lot_number}`,
        "metadata[kind]": "rent",
        "metadata[lot_id]": String(lot.id),
        "metadata[lot_number]": String(lot.lot_number),
        // The sync listens to payment_intent.succeeded, not to the session, so
        // the metadata has to ride on the intent as well. Without this the
        // rent lands in the application-fee branch.
        "payment_intent_data[metadata][kind]": "rent",
        "payment_intent_data[metadata][lot_id]": String(lot.id),
        "payment_intent_data[metadata][lot_number]": String(lot.lot_number),
        "payment_intent_data[metadata][resident_account_id]": String(account.id),
        "payment_intent_data[description]": `Rent - Lot ${lot.lot_number}`,
    };

    // Built by hand rather than with URLSearchParams, which is not reliably
    // present in every runtime this has to survive.
    const body = Object.entries(form)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    let response;

    try {
        response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${secret}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        });
    } catch {
        return res
            .status(502)
            .json({ error: "Could not reach the card processor. Please try again." });
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.url) {
        // Logged, not returned. Stripe's message can name internal detail and
        // the resident can do nothing with it.
        console.error(
            "portal rent checkout failed",
            payload?.error?.message ?? response.status,
        );

        return res.status(502).json({
            error: "The card processor refused that. Please call the office.",
        });
    }

    return res.status(200).json({
        url: payload.url,
        amount: money(amountCents / 100),
        outstanding: money(outstandingCents / 100),
    });
}