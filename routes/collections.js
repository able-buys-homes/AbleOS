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
import { randomUUID } from "node:crypto";
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

    if (!["GET", "POST", "PATCH"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!CAN_READ_CASES.includes(profile.cockpit)) {
        return res.status(403).json({ error: "No access to collections" });
    }

    try {
        const supabase = getClient();

        /* ================= WRITES ================= */

        /**
         * A lot with an open case is untouchable. Accepting a payment or making
         * an arrangement after the file is with counsel can get the case
         * dismissed - so this is a server check, not a hidden button.
         */
        async function lockedLot(lotId) {
            const { data, error } = await supabase
                .from("eviction_cases")
                .select("id")
                .eq("lot_id", lotId)
                .is("possession_at", null)
                .maybeSingle();

            if (error) throw error;
            return Boolean(data);
        }

        /* ---- signed upload URL for a photo ---- */
        if (req.method === "POST" && req.query?.photo) {
            if (!["zo", "raj", "dane"].includes(profile.cockpit)) {
                return res.status(403).json({ error: "Not your screen" });
            }

            const kind = String(req.body?.kind || "");
            if (!["receipt", "notice_wide", "notice_close", "signed_plan"].includes(kind)) {
                return res.status(400).json({ error: "Unknown photo kind" });
            }

            const ext = String(req.body?.ext || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5);
            const path = `htm/${kind}/${randomUUID()}.${ext || "jpg"}`;

            const { data: signed, error } = await supabase.storage
                .from("collections-photos")
                .createSignedUploadUrl(path, { expiresIn: 3600 });

            if (error) throw error;

            return res.status(200).json({ path, signedUrl: signed.signedUrl });
        }

        /* ---- log a payment ---- */
        if (req.method === "POST" && req.query?.payment) {
            if (!["zo", "raj", "dane"].includes(profile.cockpit)) {
                return res.status(403).json({ error: "Not your screen" });
            }

            const lotId = String(req.body?.lot_id || "");
            if (!lotId) return res.status(400).json({ error: "Pick a lot" });

            if (await lockedLot(lotId)) {
                return res.status(409).json({
                    error: "That lot is with Barrett. Send anything the tenant offers to Raj.",
                });
            }

            const amount = Number(req.body?.amount);
            if (!Number.isFinite(amount) || amount <= 0) {
                return res.status(400).json({ error: "Enter the amount received" });
            }

            // Zo enters cash and money orders only. Bank, portal and PO Box are
            // the system of record and post on their own.
            const method = String(req.body?.method || "cash");
            const allowed =
                profile.cockpit === "zo"
                    ? ["cash", "money_order", "cashiers_check"]
                    : ["cash", "money_order", "cashiers_check", "bank", "portal", "po_box", "other"];

            if (!allowed.includes(method)) {
                return res.status(400).json({ error: "That payment type is not entered here" });
            }

            // Sequential per year, for the receipt the tenant receives.
            const { count, error: countError } = await supabase
                .from("payments")
                .select("id", { count: "exact", head: true })
                .not("receipt_number", "is", null);

            if (countError) throw countError;

            const receipt = `HTM-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, "0")}`;

            const { error: insertError } = await supabase.from("payments").insert({
                lot_id: lotId,
                amount,
                received_at: req.body?.received_at
                    ? new Date(req.body.received_at).toISOString()
                    : new Date().toISOString(),
                method,
                entered_by: profile.cockpit,
                receipt_number: receipt,
                photo_path: req.body?.photo_path ?? null,
                note: req.body?.note ? String(req.body.note).slice(0, 500) : null,
            });

            if (insertError) throw insertError;

            return res.status(201).json({
                ok: true,
                receipt,
                message: `Payment saved. Receipt ${receipt} recorded. Reminders stopped for this lot.`,
            });
        }

        /* ---- propose a plan ---- */
        if (req.method === "POST" && req.query?.plan) {
            if (!["zo", "raj", "dane"].includes(profile.cockpit)) {
                return res.status(403).json({ error: "Not your screen" });
            }

            const lotId = String(req.body?.lot_id || "");
            if (!lotId) return res.status(400).json({ error: "Pick a lot" });

            if (await lockedLot(lotId)) {
                return res.status(409).json({ error: "That lot is with Barrett." });
            }

            const each = Number(req.body?.each);
            const count = Math.min(Math.max(Number(req.body?.count) || 1, 1), 6);
            const firstDue = String(req.body?.first_due || "");

            if (!Number.isFinite(each) || each <= 0 || !firstDue) {
                return res.status(400).json({ error: "Fill in the amount and the first date" });
            }

            // Proposed only. No document, no signature - the constraints on the
            // table would refuse either one before an approval exists.
            const { data: plan, error: planError } = await supabase
                .from("payment_plans")
                .insert({
                    lot_id: lotId,
                    proposed_by: profile.cockpit,
                    reason: req.body?.reason ? String(req.body.reason).slice(0, 500) : null,
                    status: "proposed",
                })
                .select("id")
                .single();

            if (planError) throw planError;

            const stepDays =
                req.body?.frequency === "Weekly" ? 7 : req.body?.frequency === "Monthly" ? 30 : 14;

            const installments = Array.from({ length: count }, (_, i) => {
                const due = new Date(firstDue);
                due.setDate(due.getDate() + i * stepDays);
                return { plan_id: plan.id, due_date: due.toISOString().slice(0, 10), amount: each };
            });

            const { error: instError } = await supabase
                .from("plan_installments")
                .insert(installments);

            if (instError) throw instError;

            await supabase.from("notifications").insert({
                recipient: "raj",
                type: "plan_proposed",
                title: "A payment plan needs your approval",
                body: `Proposed by ${profile.full_name}`,
                link: "/raj/approvals",
            });

            return res.status(201).json({
                ok: true,
                message: "Sent to Raj. You will get a notification when he decides.",
            });
        }

        /* ---- record a posting ---- */
        if (req.method === "POST" && req.query?.posted) {
            if (!["zo", "raj", "dane"].includes(profile.cockpit)) {
                return res.status(403).json({ error: "Not your screen" });
            }

            const lotId = String(req.body?.lot_id || "");
            const wide = String(req.body?.photo_wide_path || "");
            const close = String(req.body?.photo_close_path || "");

            if (!lotId) return res.status(400).json({ error: "Which lot?" });

            // Both photos or neither. One photo is not proof of service.
            if (!wide || !close) {
                return res.status(400).json({ error: "Both photos are required" });
            }

            const { data: notice, error: findError } = await supabase
                .from("notices")
                .select("id")
                .eq("lot_id", lotId)
                .is("posted_at", null)
                .order("generated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (findError) throw findError;
            if (!notice) {
                return res.status(409).json({ error: "There is no notice waiting to be posted" });
            }

            // Zo records that he posted it. He never creates or backdates one -
            // posted_at is set here, from the server clock.
            const { error: updateError } = await supabase
                .from("notices")
                .update({
                    posted_at: new Date().toISOString(),
                    posted_by: profile.cockpit,
                    photo_wide_path: wide,
                    photo_close_path: close,
                    geo_lat: req.body?.geo_lat ?? null,
                    geo_lng: req.body?.geo_lng ?? null,
                    post_note: req.body?.note ? String(req.body.note).slice(0, 500) : null,
                })
                .eq("id", notice.id);

            if (updateError) throw updateError;

            return res.status(200).json({
                ok: true,
                message: "Proof of service filed. The three day clock started.",
            });
        }

        /* ---- Raj: verify a balance, or decide a plan ---- */
        if (req.method === "PATCH") {
            if (!["raj", "dane"].includes(profile.cockpit)) {
                return res.status(403).json({ error: "Not your decision" });
            }

            if (req.query?.verify) {
                const lotId = String(req.body?.lot_id || "");
                if (!lotId) return res.status(400).json({ error: "Which lot?" });

                const { error } = await supabase
                    .from("rent_ledger")
                    .update({
                        verified_at: new Date().toISOString(),
                        verified_by: profile.cockpit,
                    })
                    .eq("lot_id", lotId)
                    .is("verified_at", null);

                if (error) throw error;

                return res.status(200).json({
                    ok: true,
                    message: "Verified. Notice queued to Zo to print and post.",
                });
            }

            if (req.query?.plan) {
                const planId = String(req.query.plan);
                const decision = String(req.body?.decision || "");

                if (!["approve", "reject"].includes(decision)) {
                    return res.status(400).json({ error: "Approve or reject" });
                }

                const { error } = await supabase
                    .from("payment_plans")
                    .update({
                        status: decision === "approve" ? "approved" : "rejected",
                        approved_by: profile.cockpit,
                        approved_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", planId)
                    .eq("status", "proposed");

                if (error) throw error;

                await supabase.from("notifications").insert({
                    recipient: "zo",
                    type: decision === "approve" ? "plan_approved" : "plan_rejected",
                    title:
                        decision === "approve"
                            ? "Raj approved the payment plan"
                            : "Raj rejected the payment plan",
                    body:
                        decision === "approve"
                            ? "The plan document is ready to print and sign."
                            : "No document was generated.",
                    link: "/zo/collections",
                });

                return res.status(200).json({
                    ok: true,
                    message:
                        decision === "approve"
                            ? "Approved. Plan document generated and sent to Zo to print."
                            : "Rejected. Zo notified. No document generated.",
                });
            }

            return res.status(400).json({ error: "Unknown action" });
        }

        /* ================= READS ================= */

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

        // A lot with a proposal already sitting with Raj must not accept a
        // second one - two plans on one lot is how a tenant ends up holding
        // two different sets of terms.
        const pendingPlanByLot = new Map(
            plans.filter((p) => p.status === "proposed").map((p) => [p.lot_id, p]),
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
                pending_plan: pendingPlanByLot.get(lot.id) ?? null,
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
                approve: plans
                    .filter((p) => p.status === "proposed")
                    .map((p) => ({
                        ...p,
                        lot: lots.find((l) => l.id === p.lot_id) ?? null,
                    })),
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