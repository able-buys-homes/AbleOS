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

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireResident } from "../lib/apiAuth.js";
import { currentPeriod, dueDateFor, lastDayToPay } from "../lib/rentRules.js";

/** XML escaping. A tenant named O'Brien must not break their own receipt. */
const escapeXml = (value) =>
    String(value ?? "").replace(
        /[<>&"']/g,
        (c) =>
            ({
                "<": "&lt;",
                ">": "&gt;",
                "&": "&amp;",
                '"': "&quot;",
                "'": "&#39;",
            })[c],
    );

/** How a payment method reads to a resident, not to a database. */
const RECEIPT_METHOD = {
    portal: "Card, via Stripe",
    card: "Card",
    cash: "Cash",
    money_order: "Money order",
    cashiers_check: "Cashier's check",
    bank: "Bank transfer",
    po_box: "Received by post",
    other: "Other",
};

/**
 * The receipt, drawn rather than rendered from a template. SVG because it
 * needs no image library on the server - the browser turns it into a PNG for
 * download, and a serverless function that has to load a canvas is a
 * serverless function that times out.
 *
 * Dated in the park's timezone, always. This is the document a resident brings
 * to an argument about whether rent was late, so it has to say the date the
 * office would recognise rather than the one their phone happens to be in.
 */
function rentReceiptSvg({ receiptNo, name, lotNumber, amount, paidAt, method, voided }) {
    const money = Number(amount ?? 0).toFixed(2);

    const when = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(paidAt ? new Date(paidAt) : new Date());

    const row = (y, label, value, weight = "400") => `
    <text x="56" y="${y}" font-family="Georgia, serif" font-size="13" fill="#8A7B6E" letter-spacing="1.4">${escapeXml(label.toUpperCase())}</text>
    <text x="764" y="${y}" text-anchor="end" font-family="Georgia, serif" font-size="17" font-weight="${weight}" fill="#3A2F26">${escapeXml(value)}</text>
    <line x1="56" y1="${y + 16}" x2="764" y2="${y + 16}" stroke="#E5DDD3" stroke-width="1"/>`;

    // A reversed payment still gets a receipt, and the receipt says so. Hiding
    // it would leave the resident holding proof of a payment we no longer
    // recognise, which is how disputes start.
    const voidBand = voided
        ? `
  <rect x="0" y="130" width="820" height="34" fill="#B4462B"/>
  <text x="410" y="153" text-anchor="middle" font-family="Georgia, serif" font-size="15" letter-spacing="3" fill="#FAF7F2">THIS PAYMENT WAS REVERSED</text>`
        : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="560" viewBox="0 0 820 560" role="img" aria-label="Rent receipt ${escapeXml(receiptNo)}">
  <rect width="820" height="560" fill="#FAF7F2"/>
  <rect x="0" y="0" width="820" height="6" fill="#B4462B"/>

  <text x="56" y="76" font-family="Georgia, serif" font-size="26" letter-spacing="4" fill="#3A2F26">HOMETOWN MEADOWS</text>
  <text x="56" y="100" font-family="Georgia, serif" font-size="13" letter-spacing="2" fill="#B4462B">A FAMILY COMMUNITY · NASHVILLE, ARKANSAS</text>

  <text x="764" y="76" text-anchor="end" font-family="Georgia, serif" font-size="13" letter-spacing="2.5" fill="#8A7B6E">RECEIPT</text>
  <text x="764" y="102" text-anchor="end" font-family="Georgia, serif" font-size="20" font-weight="600" fill="#3A2F26">${escapeXml(receiptNo)}</text>

  <line x1="56" y1="130" x2="764" y2="130" stroke="#3A2F26" stroke-width="1.5"/>
  ${voidBand}

  <text x="56" y="198" font-family="Georgia, serif" font-size="22" fill="#3A2F26">Rent payment received</text>

  ${row(252, "Received from", name || "Resident")}
  ${row(304, "Lot", String(lotNumber ?? "—"))}
  ${row(356, "Date", when)}
  ${row(408, "Method", method || "—")}
  ${row(460, "Amount paid", "$" + money, "700")}

  <text x="56" y="512" font-family="Georgia, serif" font-size="12" fill="#6F6259">121 Smith Lane, Nashville, AR 71852 · (870) 233-9798</text>
  <text x="56" y="534" font-family="Georgia, serif" font-size="11" fill="#8A7B6E">Keep this receipt for your records. Your full history is at portal.hometownmeadows.com</text>
</svg>`;
}

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

    
    // One receipt, drawn on demand.
    //
    // Scoped to the lot from the session, so a resident who guesses another
    // payment's id gets nothing. Drawn each time rather than stored, because a
    // stored image can drift from the ledger it claims to describe.
    if (req.method === "GET" && req.query.receipt) {
        const paymentId = String(req.query.receipt);

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
            return res.status(400).json({ error: "Which receipt?" });
        }

        try {
            const supabase = getClient();

            const [paymentRes, reversalRes] = await Promise.all([
                supabase
                    .from("payments")
                    .select("id, amount, received_at, method, receipt_number, reverses_id")
                    .eq("id", paymentId)
                    .eq("lot_id", lot.id)
                    .maybeSingle(),
                supabase
                    .from("payments")
                    .select("id")
                    .eq("reverses_id", paymentId)
                    .limit(1),
            ]);

            if (paymentRes.error || reversalRes.error) {
                return res.status(500).json({ error: "Could not read that receipt" });
            }

            const payment = paymentRes.data;

            if (!payment) return res.status(404).json({ error: "No such receipt" });

            // A reversal entry is the undoing of a payment, not a payment. It
            // has no receipt of its own.
            if (payment.reverses_id) {
                return res.status(409).json({ error: "That entry is a reversal, not a payment" });
            }

            const svg = rentReceiptSvg({
                receiptNo: payment.receipt_number || payment.id.slice(0, 8).toUpperCase(),
                name: lot.tenant_name || account.display_name || "Resident",
                lotNumber: lot.lot_number,
                amount: payment.amount,
                paidAt: payment.received_at,
                method: RECEIPT_METHOD[payment.method ?? ""] ?? "Payment",
                voided: Boolean(reversalRes.data?.length),
            });

            res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
            res.setHeader("Cache-Control", "private, no-store");
            return res.status(200).send(svg);
        } catch (err) {
            console.error("portal receipt failed", err?.message ?? err);
            return res.status(500).json({ error: "Could not draw that receipt" });
        }
    }

    // A resident opening a job.
    //
    // The lot comes from the session, never the body, so nobody can raise
    // work against another home. Everything else is checked against the same
    // vocabulary the database enforces - a rejected check constraint reaches
    // the resident as a blank failure, which teaches them the portal is
    // broken when in fact they picked a valid-looking option.
    if (req.method === "POST" && req.query.workorder === "1") {
        const CATEGORIES = new Set([
            "plumbing",
            "electrical",
            "hvac",
            "roof",
            "skirting",
            "appliance",
            "grounds",
            "pest",
            "other",
        ]);

        // "cosmetic" is missing on purpose. It is the office's own triage
        // word, not something a resident should have to grade their own
        // problem with.
        const PRIORITIES = new Set(["routine", "urgent", "emergency"]);

        const LOCATIONS = new Set([
            "kitchen",
            "primary_bath",
            "second_bath",
            "living_room",
            "bedroom",
            "utility",
            "exterior",
            "driveway",
        ]);

        const category = String(req.body?.category ?? "").trim();
        const priority = String(req.body?.priority ?? "routine").trim();
        const location = String(req.body?.location ?? "").trim();
        const title = String(req.body?.title ?? "").trim();
        const note = String(req.body?.note ?? "").trim();

        if (!CATEGORIES.has(category)) {
            return res.status(400).json({ error: "Pick a category" });
        }
        if (!PRIORITIES.has(priority)) {
            return res.status(400).json({ error: "Pick how urgent this is" });
        }
        if (location && !LOCATIONS.has(location)) {
            return res.status(400).json({ error: "Pick a location" });
        }
        if (title.length < 3) {
            return res.status(400).json({ error: "Give it a short summary" });
        }
        if (note.length < 3) {
            return res.status(400).json({ error: "Tell us what is happening" });
        }

        const photoPaths = (Array.isArray(req.body?.photoPaths) ? req.body.photoPaths : [])
            .map((p) => String(p))
            .filter(Boolean)
            .slice(0, 4);

        // Every photo has to live in this resident's own folder. Without this
        // a request could quietly attach a photo belonging to another lot.
        const prefix = `portal/${lot.id}/`;

        if (photoPaths.some((p) => !p.startsWith(prefix))) {
            return res.status(400).json({ error: "Those photos do not belong to this home" });
        }

        try {
            const supabase = getClient();

            // Double-tap protection. A resident on a slow phone presses Submit
            // twice, and two identical jobs waste a visit.
            const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();

            const { data: recent, error: recentError } = await supabase
                .from("work_orders")
                .select("id")
                .eq("lot_id", lot.id)
                .eq("title", title.slice(0, 120))
                .gte("opened_at", since)
                .limit(1);

            if (recentError) throw new Error(recentError.message);

            if (recent?.length) {
                // Signed links for whatever the resident photographed. They expire:
        // nothing here is a permanent URL, so a link that leaks stops working
        // rather than sitting on the internet forever.
        const pathsToSign = [
            ...new Set(
                (ordersRes.data ?? []).flatMap((w) => {
                    const many = Array.isArray(w.opened_photo_paths) ? w.opened_photo_paths : [];
                    if (many.length) return many;
                    return w.opened_photo_path ? [w.opened_photo_path] : [];
                }),
            ),
        ];

        const photoUrlByPath = new Map();

        if (pathsToSign.length) {
            const { data: signed } = await supabase.storage
                .from("collections-photos")
                .createSignedUrls(pathsToSign, 3600);

            for (const item of signed ?? []) {
                if (item?.path && item?.signedUrl) photoUrlByPath.set(item.path, item.signedUrl);
            }
        }

        return res.status(200).json({ ok: true, id: recent[0].id, duplicate: true });
            }

            const { data: created, error: insertError } = await supabase
                .from("work_orders")
                .insert({
                    lot_id: lot.id,
                    title: title.slice(0, 120),
                    note: note.slice(0, 2000),
                    category,
                    priority,
                    status: "new",
                    location: location || null,
                    preferred_window: req.body?.preferredWindow
                        ? String(req.body.preferredWindow).slice(0, 120)
                        : null,
                    // Null rather than false when nothing was asked. False is
                    // a claim that they said no.
                    entry_permission:
                        typeof req.body?.entryPermission === "boolean"
                            ? req.body.entryPermission
                            : null,
                    pets_on_site:
                        typeof req.body?.petsOnSite === "boolean"
                            ? req.body.petsOnSite
                            : null,
                    opened_photo_paths: photoPaths,
                    // Kept in step with the array so screens still reading the
                    // single column show the first photo rather than none.
                    opened_photo_path: photoPaths[0] ?? null,
                    occupant_name: lot.tenant_name ?? account.display_name ?? null,
                    opened_by: "resident",
                })
                .select("id, title, priority, status, opened_at")
                .single();

            if (insertError) throw new Error(insertError.message);

            // Zo dispatches, so Zo is told. Raj is told too - a system that
            // speaks up only when something is on fire teaches him that
            // silence means nothing is happening.
            const heading =
                priority === "emergency"
                    ? `EMERGENCY - Lot ${lot.lot_number}`
                    : `Lot ${lot.lot_number} raised a request`;

            const body = `${title.slice(0, 120)} - ${priority}. Opened by the resident in the portal.`;

            await supabase.from("notifications").insert([
                { recipient: "zo", type: "work_order_opened", title: heading, body, link: "/zo/jobs" },
                { recipient: "raj", type: "work_order_opened", title: heading, body, link: "/raj" },
            ]);

            return res.status(201).json({ ok: true, workOrder: created });
        } catch (err) {
            console.error("portal work order failed", err?.message ?? err);
            return res.status(500).json({ error: "Could not open that request" });
        }
    }

    // Signed upload slots for a resident's photos.
    //
    // The browser uploads straight to storage rather than posting megabytes
    // through a serverless function that would time out on a bad phone
    // signal. Each slot names one path inside this resident's own folder, so
    // a slot cannot be turned into a way to overwrite another lot's photo.
    if (req.method === "POST" && req.query.upload === "1") {
        const BUCKET = "collections-photos";

        const ALLOWED = new Map([
            ["image/jpeg", "jpg"],
            ["image/jpg", "jpg"],
            ["image/png", "png"],
            ["image/webp", "webp"],
            ["image/heic", "heic"],
        ]);

        const types = (Array.isArray(req.body?.types) ? req.body.types : [])
            .map((t) => String(t).toLowerCase().trim())
            .slice(0, 4);

        if (!types.length) {
            return res.status(400).json({ error: "Nothing to upload" });
        }

        if (types.some((t) => !ALLOWED.has(t))) {
            return res.status(400).json({ error: "Photos only - JPEG, PNG, WebP or HEIC" });
        }

        try {
            const supabase = getClient();
            const slots = [];

            for (const type of types) {
                const path = `portal/${lot.id}/${crypto.randomUUID()}.${ALLOWED.get(type)}`;

                const { data, error } = await supabase.storage
                    .from(BUCKET)
                    .createSignedUploadUrl(path);

                if (error) throw new Error(error.message);

                slots.push({ path, token: data.token });
            }

            return res.status(200).json({ ok: true, bucket: BUCKET, slots });
        } catch (err) {
            console.error("portal upload slots failed", err?.message ?? err);
            return res.status(500).json({ error: "Could not prepare the upload" });
        }
    }

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
                    "id, title, note, category, priority, status, opened_at, completed_at, fix, receipt_number, location, preferred_window, entry_permission, pets_on_site, opened_photo_path, opened_photo_paths",
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
                location: w.location,
                preferredWindow: w.preferred_window,
                entryPermission: w.entry_permission,
                petsOnSite: w.pets_on_site,
                photos: (
                    Array.isArray(w.opened_photo_paths) && w.opened_photo_paths.length
                        ? w.opened_photo_paths
                        : w.opened_photo_path
                          ? [w.opened_photo_path]
                          : []
                )
                    .map((path) => photoUrlByPath.get(path))
                    .filter(Boolean),
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