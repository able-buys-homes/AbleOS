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
import {
    LAST_DAY_TO_PAY,
    currentPeriod,
    parkToday,
    pastGrace,
} from "../lib/rentRules.js";

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

        /* ---- proof of service for one notice ---- */
        // Signed links, minted per request and short-lived. These photos show
        // residents' doors - they are evidence, not content, and never sit
        // behind a public URL.
        if (req.method === "GET" && req.query?.proof) {
            const noticeId = String(req.query.proof);

            const { data: notice, error } = await supabase
                .from("notices")
                .select("*, lots(lot_number, tenant_name)")
                .eq("id", noticeId)
                .maybeSingle();

            if (error) throw error;
            if (!notice) return res.status(404).json({ error: "Not found" });

            const sign = async (path) => {
                if (!path) return null;
                const { data } = await supabase.storage
                    .from("collections-photos")
                    .createSignedUrl(path, 600);
                return data?.signedUrl ?? null;
            };

            const [wideUrl, closeUrl] = await Promise.all([
                sign(notice.photo_wide_path),
                sign(notice.photo_close_path),
            ]);

            return res.status(200).json({ notice, wideUrl, closeUrl });
        }

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
                    error: "That lot is with Barrett. Send anything the resident offers to Raj.",
                });
            }

            // No rent recorded means a payment against nothing. It cannot
            // reduce a balance, cannot count towards a month, and leaves a
            // receipt that says somebody paid without saying what for - which
            // is worse than no receipt when they ask about it in March.
            const { data: payLot, error: payLotError } = await supabase
                .from("lots")
                .select("lot_number, contract_rent")
                .eq("id", lotId)
                .maybeSingle();

            if (payLotError) throw payLotError;
            if (!payLot) return res.status(404).json({ error: "No such lot" });

            if (payLot.contract_rent == null) {
                return res.status(409).json({
                    error: `No rent is recorded for Lot ${payLot.lot_number}. Set the rent first — a payment with no rent behind it cannot be applied to anything.`,
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

            // From a Postgres sequence, so two payments saved in the same
            // second cannot share a number. A duplicate receipt reads as
            // tampering later, however innocent it was.
            const { data: receipt, error: receiptError } = await supabase.rpc(
                "next_receipt_number",
            );

            if (receiptError) throw receiptError;

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

        /* ---- record the rent on a lot ---- */
        // The amount is a lease term, but nobody has typed it in yet, so Zo
        // enters it when a home becomes occupied. It shows on the roll
        // immediately and drives nothing until Raj confirms it. A $75 late fee
        // charged against a figure one person typed unreviewed is the version
        // of this that ends up in front of a judge.
        if (req.method === "POST" && req.query?.rent) {
            if (!["zo", "raj", "dane"].includes(profile.cockpit)) {
                return res.status(403).json({ error: "Not your screen" });
            }

            const lotId = String(req.body?.lot_id || "");
            if (!lotId) return res.status(400).json({ error: "Pick a lot" });

            const contractRent = Number(req.body?.contract_rent);
            if (!Number.isFinite(contractRent) || contractRent <= 0) {
                return res
                    .status(400)
                    .json({ error: "Enter the monthly rent from the lease" });
            }

            const { data: lot, error: lotError } = await supabase
                .from("lots")
                .select("id, lot_number, hap_household")
                .eq("id", lotId)
                .maybeSingle();

            if (lotError) throw lotError;
            if (!lot) return res.status(404).json({ error: "No such lot" });

            // An assisted household pays a share, not the contract rent. If the
            // split is missing it is not assumed - a guess here overcharges
            // someone on a fixed income.
            let tenantPortion;
            if (lot.hap_household) {
                tenantPortion = Number(req.body?.tenant_portion);
                if (!Number.isFinite(tenantPortion) || tenantPortion < 0) {
                    return res.status(400).json({
                        error:
                            "This is an assisted household. Enter the tenant's portion as well as the contract rent.",
                    });
                }
                if (tenantPortion > contractRent) {
                    return res.status(400).json({
                        error: "The tenant's portion cannot be more than the contract rent.",
                    });
                }
            } else {
                tenantPortion = contractRent;
            }

            const now = new Date();
            const period = `${now.getUTCFullYear()}-${String(
                now.getUTCMonth() + 1,
            ).padStart(2, "0")}-01`;

            const { error: updateError } = await supabase
                .from("lots")
                .update({
                    contract_rent: contractRent,
                    tenant_portion: tenantPortion,
                    hap_portion: lot.hap_household
                        ? money(contractRent - tenantPortion)
                        : null,
                    rent_set_by: profile.cockpit,
                    rent_set_at: now.toISOString(),
                    // The figure comes from Raj and is entered as he gave it,
                    // so it binds on entry. Who typed it and when is recorded
                    // here, because that record is now the only check standing
                    // between a mistyped number and a resident being chased
                    // for it.
                    rent_confirmed_by: profile.cockpit,
                    rent_confirmed_at: now.toISOString(),
                    rent_note: req.body?.note
                        ? String(req.body.note).slice(0, 500)
                        : null,
                    updated_at: now.toISOString(),
                })
                .eq("id", lotId);

            if (updateError) throw updateError;

            // This month's charge, at the amount just entered. A correction has
            // to move the charge with it or the roll goes on chasing the old
            // number - so this updates in place rather than inserting a second
            // row the unique index would refuse anyway.
            const { data: existingCharge, error: findError } = await supabase
                .from("rent_ledger")
                .select("id")
                .eq("lot_id", lotId)
                .eq("period", period)
                .eq("charge_type", "rent")
                .maybeSingle();

            if (findError) throw findError;

            const chargeRow = {
                lot_id: lotId,
                period,
                charge_type: "rent",
                amount: tenantPortion,
                due_date: period,
                source: "manual",
                verified_at: now.toISOString(),
                verified_by: profile.cockpit,
            };

            const { error: chargeError } = existingCharge
                ? await supabase
                    .from("rent_ledger")
                    .update(chargeRow)
                    .eq("id", existingCharge.id)
                : await supabase.from("rent_ledger").insert(chargeRow);

            if (chargeError) throw chargeError;

            await supabase.from("notifications").insert({
                recipient: "raj",
                type: "rent_set",
                title: `Rent set on Lot ${lot.lot_number}`,
                body: `${profile.cockpit} entered $${money(tenantPortion)} a month, and this month is charged at that amount. If it is wrong, have it entered again — the charge moves with it.`,
                // Raj cannot open /zo/collections - that route is Zo's. A
                // notification that lands on a locked screen is worse than one
                // with no link at all.
                link: "/raj",
            });

            return res.status(200).json({
                ok: true,
                message: `Rent set at $${money(tenantPortion)} a month. This month is charged at that amount.`,
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

            const FREQUENCIES = ["Weekly", "Every two weeks", "Monthly"];
            const frequency = FREQUENCIES.includes(String(req.body?.frequency))
                ? String(req.body.frequency)
                : "Every two weeks";

            // Proposed only. No document, no signature - the constraints on the
            // table would refuse either one before an approval exists.
            const { data: plan, error: planError } = await supabase
                .from("payment_plans")
                .insert({
                    lot_id: lotId,
                    proposed_by: profile.cockpit,
                    reason: req.body?.reason ? String(req.body.reason).slice(0, 500) : null,
                    frequency,
                    status: "proposed",
                })
                .select("id")
                .single();

            if (planError) throw planError;

            const [fy, fm, fd] = firstDue.split("-").map(Number);

            // Monthly means the same date next month, not thirty days later.
            // Thirty days from 31 January is 2 March, and a resident who paid
            // on the date they were given would be marked late for it. The
            // 31st in a short month lands on that month's last day rather
            // than sliding into the next one.
            const installments = Array.from({ length: count }, (_, i) => {
                let due;

                if (frequency === "Monthly") {
                    const target = new Date(Date.UTC(fy, fm - 1 + i, 1));
                    const lastDay = new Date(
                        Date.UTC(
                            target.getUTCFullYear(),
                            target.getUTCMonth() + 1,
                            0,
                        ),
                    ).getUTCDate();

                    due = new Date(
                        Date.UTC(
                            target.getUTCFullYear(),
                            target.getUTCMonth(),
                            Math.min(fd, lastDay),
                        ),
                    );
                } else {
                    const stepDays = frequency === "Weekly" ? 7 : 14;
                    due = new Date(Date.UTC(fy, fm - 1, fd + i * stepDays));
                }

                return {
                    plan_id: plan.id,
                    due_date: due.toISOString().slice(0, 10),
                    amount: each,
                };
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
                    // Recorded, not inferred. A blank would leave Barrett
                    // guessing whether the phone failed or nobody asked.
                    geo_status: req.body?.geo_lat ? "captured" : "unavailable",
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
                            ? "Raj approved it. The plan document is coming — do not collect a signature yet."
                            : "No document was generated.",
                    link: "/zo/collections",
                });

                return res.status(200).json({
                    ok: true,
                    message:
                        decision === "approve"
                            // Says only what happened. The document does not
                            // exist yet, and the cockpit must not claim it does.
                            ? "Approved — plan document coming."
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
        // second one - two plans on one lot is how a resident ends up holding
        // two different sets of terms.
        const pendingPlanByLot = new Map(
            plans.filter((p) => p.status === "proposed").map((p) => [p.lot_id, p]),
        );

        const noticeByLot = new Map();
        for (const n of notices) {
            if (!noticeByLot.has(n.lot_id)) noticeByLot.set(n.lot_id, n);
        }

        const now = new Date();
        // The same answer for every lot this month, so it is decided once.
        const graceOver = pastGrace();
        const thisPeriod = currentPeriod();

        const enriched = lots.map((lot) => {
            const owed = balanceFor(lot.id, charges, payments);
            const openCase = openCaseByLot.get(lot.id) ?? null;
            const plan = activePlanByLot.get(lot.id) ?? null;
            const notice = noticeByLot.get(lot.id) ?? null;

            // Earliest due date first, so "payment 3 of 6" counts in the order
            // the resident was given.
            const planRows = plan
                ? [
                    ...(plans.find((p) => p.id === plan.id)
                        ?.plan_installments ?? []),
                ].sort((a, b) =>
                    String(a.due_date).localeCompare(String(b.due_date)),
                )
                : [];

            // A resident cannot be late for a bill that did not exist yet.
            // If the rent was first recorded after the 5th, this month is due
            // but not late and no fee may rest on it. From next month it
            // behaves normally.
            //
            // Money owed from an earlier month is a different matter - that
            // was always late, whatever was entered when.
            const thisRentCharge =
                charges
                    .filter(
                        (c) =>
                            c.lot_id === lot.id &&
                            c.charge_type === "rent" &&
                            String(c.period) === thisPeriod,
                    )
                    .sort((a, b) =>
                        String(a.created_at).localeCompare(String(b.created_at)),
                    )[0] ?? null;

            const chargedInTime = thisRentCharge
                ? parkToday(new Date(thisRentCharge.created_at)).day <=
                LAST_DAY_TO_PAY
                : false;

            const hasOlderCharge = charges.some(
                (c) => c.lot_id === lot.id && String(c.period) < thisPeriod,
            );

            const lateEligible = hasOlderCharge || chargedInTime;

            return {
                ...lot,
                owed,
                // Payment status without a ledger. Charges are not recorded
                // for the real residents yet, so a balance of zero means
                // "nothing is known", not "they paid". A payment Zo logged is
                // the only thing we can honestly call proof of payment today.
                paid_this_month: payments.some(
                    (p) =>
                        p.lot_id === lot.id &&
                        new Date(p.received_at).getMonth() === now.getMonth() &&
                        new Date(p.received_at).getFullYear() ===
                        now.getFullYear(),
                ),
                has_ledger: charges.some((c) => c.lot_id === lot.id),
                // The most recent payment, so the row can say what was taken
                // and when. A boolean told Zo that a payment happened and
                // nothing about it - he could not check his own work.
                last_payment:
                    payments
                        .filter((p) => p.lot_id === lot.id)
                        .sort((a, b) =>
                            String(b.received_at).localeCompare(
                                String(a.received_at),
                            ),
                        )[0] ?? null,
                verified: isVerified(lot.id, charges),
                // Owing money is not the same as being late. Inside the grace
                // period a resident who has not paid is simply not late yet -
                // the 5th is the last day. Filing them under Late is how
                // someone gets chased on the 3rd for rent they still have two
                // days to pay.
                is_late: owed > 0 && graceOver && lateEligible,
                // A lot with counsel is locked to everyone but Raj. Taking
                // money on it can get the case dismissed.
                locked: Boolean(openCase),
                open_case: openCase,
                active_plan: plan,
                pending_plan: pendingPlanByLot.get(lot.id) ?? null,
                latest_notice: notice,
                installments: planRows,
                // This month on its own, so a row can show how much of what
                // was charged has actually come in. The lifetime balance
                // cannot do that - a resident in credit from August would
                // read as having paid September.
                month_charged: money(
                    charges
                        .filter(
                            (c) =>
                                c.lot_id === lot.id &&
                                String(c.period) === thisPeriod,
                        )
                        .reduce((sum, c) => sum + Number(c.amount), 0),
                ),
                month_paid: money(
                    payments
                        .filter(
                            (p) =>
                                p.lot_id === lot.id &&
                                String(p.received_at).slice(0, 10) >= thisPeriod,
                        )
                        .reduce((sum, p) => sum + Number(p.amount), 0),
                ),
                // Where the plan is up to.
                //
                // plan_installments.paid_at is never written by anything yet -
                // payments are logged against the lot, not allocated to an
                // installment - so progress is derived from what has been paid
                // since Raj approved the plan. That is the same number as long
                // as every payment on this lot is going towards the plan,
                // which is exactly why allocating payments to installments is
                // worth doing properly.
                plan_progress: plan
                    ? (() => {
                        const total = money(
                            planRows.reduce((sum, r) => sum + Number(r.amount), 0),
                        );

                        // From the start of the day Raj approved it, not the
                        // exact minute. Zo enters a payment as a date, which
                        // lands at midnight, so a payment taken on the same
                        // day the plan was approved read as earlier than the
                        // approval and was ignored.
                        const planDayStart = plan.approved_at
                            ? new Date(
                                `${String(plan.approved_at).slice(0, 10)}T00:00:00Z`,
                            )
                            : null;

                        const paidSince = planDayStart
                            ? money(
                                payments
                                    .filter(
                                        (p) =>
                                            p.lot_id === lot.id &&
                                            new Date(p.received_at) >=
                                            planDayStart,
                                    )
                                    .reduce((sum, p) => sum + Number(p.amount), 0),
                            )
                            : 0;

                        let nextNumber = null;
                        let nextDue = null;
                        let nextAmount = null;
                        let running = 0;

                        for (let i = 0; i < planRows.length; i += 1) {
                            running = money(running + Number(planRows[i].amount));
                            if (running > paidSince) {
                                nextNumber = i + 1;
                                nextDue = planRows[i].due_date;
                                // The unpaid part of this instalment, not the
                                // scheduled figure. $500 agreed over two
                                // payments with $450 already in means $50 is
                                // due, and asking for $250 would be asking
                                // for money she does not owe.
                                nextAmount = money(running - paidSince);
                                break;
                            }
                        }

                        return {
                            count: planRows.length,
                            total,
                            paid: paidSince,
                            remaining: money(Math.max(total - paidSince, 0)),
                            next_number: nextNumber,
                            next_due: nextDue,
                            next_amount: nextAmount,
                        };
                    })()
                    : null,
            };
        });

        // Rent is about people who owe rent. An empty home cannot pay, cannot
        // be late and cannot be chased, so it has no business on this screen.
        // The Map is where every lot lives, occupied or not.
        const roll = enriched.filter((l) => l.occupied);

        const withCounsel = roll.filter((l) => l.locked);
        const pastDue = roll.filter((l) => !l.locked && l.owed > 0);
        const current = roll.filter((l) => !l.locked && l.owed <= 0);

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