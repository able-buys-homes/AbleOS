// routes/applicants.js
// Ellery's applicant pipeline, across both books of business.
//
// GET   /api/applicants          the list, with each card's stage worked out
// POST  /api/applicants          log a new applicant
// PATCH /api/applicants?id=<id>  move one along
//
// The stage is never stored. It is read from the dates on every request, so
// correcting a date moves the card immediately and the two can never end up
// telling Ellery different things.
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../lib/apiAuth.js";
import { parkTodayISO } from "../lib/rentRules.js";

const CAN_USE = ["ellery", "raj", "dane"];
const PORTFOLIOS = ["ahtx", "htm"];
const DECISIONS = ["approved", "conditions", "denied"];

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

function cleanDate(value) {
    const raw = value ? String(value).slice(0, 10) : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function text(value, max) {
    const s = value === null || value === undefined ? "" : String(value).trim();
    return s ? s.slice(0, max) : null;
}

function daysBefore(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d - n));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(
        2,
        "0",
    )}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Read off the record, never stored. */
function stageOf(a) {
    if (a.notified_on) return "notified";
    if (a.decision) return "result";
    if (a.screening_ordered_on) return "screening";
    if (a.fee_paid_on) return "fee_paid";
    return "received";
}

/**
 * Which pile the card sits in.
 *
 * "turn" is the only one that means Ellery has something to do. Everything
 * else is waiting on somebody else, and saying so plainly is what stops her
 * re-reading the whole list looking for work that is not hers yet.
 */
function bucketOf(a, stage, weekAgo) {
    if (a.decision) {
        return a.decision_on && a.decision_on >= weekAgo ? "decided" : "done";
    }
    if (stage === "screening" && !a.screening_result) return "report";
    if (stage === "received") return "fee";
    // Fee paid and not yet ordered, or a report back and no decision made.
    return "turn";
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

    if (!["GET", "POST", "PATCH"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const supabase = getClient();

        /* ---- the list ---- */
        if (req.method === "GET") {
            const [rowsRes, lotsRes] = await Promise.all([
                supabase
                    .from("applicants")
                    .select("*")
                    .order("arrived_at", { ascending: true }),
                supabase
                    .from("lots")
                    .select("id, lot_number, home_status")
                    .order("lot_number"),
            ]);

            if (rowsRes.error) throw rowsRes.error;
            if (lotsRes.error) throw lotsRes.error;

            const today = parkTodayISO();
            const weekAgo = daysBefore(today, 7);

            const applicants = (rowsRes.data ?? []).map((a) => {
                const stage = stageOf(a);
                return { ...a, stage, bucket: bucketOf(a, stage, weekAgo) };
            });

            return res.status(200).json({
                applicants,
                lots: lotsRes.data ?? [],
                counts: {
                    received: applicants.filter((a) => a.stage === "received")
                        .length,
                    your_turn: applicants.filter((a) => a.bucket === "turn")
                        .length,
                    screening: applicants.filter((a) => a.bucket === "report")
                        .length,
                    decided_this_week: applicants.filter(
                        (a) => a.bucket === "decided",
                    ).length,
                },
            });
        }

        /* ---- log a new applicant ---- */
        if (req.method === "POST") {
            const name = text(req.body?.name, 160);
            if (!name) return res.status(400).json({ error: "Who applied?" });

            const portfolio = String(req.body?.portfolio || "");
            if (!PORTFOLIOS.includes(portfolio)) {
                return res
                    .status(400)
                    .json({ error: "Pick AHTX or Hometown Meadows" });
            }

            const { data: created, error } = await supabase
                .from("applicants")
                .insert({
                    portfolio,
                    name,
                    property_label: text(req.body?.property_label, 160),
                    lot_id: req.body?.lot_id ? String(req.body.lot_id) : null,
                    application_id: req.body?.application_id
                        ? String(req.body.application_id)
                        : null,
                    came_in_by: text(req.body?.came_in_by, 160),
                    who_else_knows: text(req.body?.who_else_knows, 160),
                    fee_amount:
                        req.body?.fee_amount === undefined ||
                            req.body?.fee_amount === null ||
                            req.body?.fee_amount === ""
                            ? null
                            : Number(req.body.fee_amount),
                    fee_paid_on: cleanDate(req.body?.fee_paid_on),
                    notes: text(req.body?.notes, 2000),
                })
                .select("id")
                .maybeSingle();

            if (error) throw error;

            return res
                .status(201)
                .json({ ok: true, id: created?.id ?? null, message: "Logged." });
        }

        /* ---- move one along ---- */
        const id = String(req.query?.id || "");
        if (!id) return res.status(400).json({ error: "Which applicant?" });

        const { data: current, error: findError } = await supabase
            .from("applicants")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (findError) throw findError;
        if (!current) return res.status(404).json({ error: "No such applicant" });

        const today = parkTodayISO();
        const patch = { updated_at: new Date().toISOString() };

        for (const key of ["property_label", "came_in_by", "who_else_knows"]) {
            if (req.body?.[key] !== undefined) patch[key] = text(req.body[key], 160);
        }
        if (req.body?.notes !== undefined) {
            patch.notes = text(req.body.notes, 2000);
        }
        if (req.body?.fee_amount !== undefined) {
            patch.fee_amount =
                req.body.fee_amount === null || req.body.fee_amount === ""
                    ? null
                    : Number(req.body.fee_amount);
        }
        if (req.body?.fee_paid_on !== undefined) {
            patch.fee_paid_on = cleanDate(req.body.fee_paid_on);
        }
        if (req.body?.screening_result !== undefined) {
            patch.screening_result = text(req.body.screening_result, 2000);
        }

        // Screening costs money and is ordered against somebody's name. It does
        // not happen before they have paid the fee they were told to pay.
        if (req.body?.order_screening) {
            const paid = patch.fee_paid_on ?? current.fee_paid_on;
            if (!paid) {
                return res.status(409).json({
                    error: "The application fee has not been paid yet.",
                });
            }
            patch.screening_ordered_on = today;
        }

        if (req.body?.decision !== undefined) {
            const decision = String(req.body.decision);

            if (!DECISIONS.includes(decision)) {
                return res.status(400).json({ error: "That is not a decision" });
            }

            // A decision with no report behind it is a decision nobody can
            // account for later - including to the applicant, who is entitled
            // to know what it rested on.
            const report = patch.screening_result ?? current.screening_result;
            if (!report) {
                return res.status(409).json({
                    error: "The screening report is not back yet.",
                });
            }

            patch.decision = decision;
            patch.decision_on = today;
            patch.decision_note = text(req.body?.decision_note, 2000);
        }

        if (req.body?.notified) {
            const decided = patch.decision ?? current.decision;
            if (!decided) {
                return res
                    .status(409)
                    .json({ error: "Nothing has been decided to tell them." });
            }
            patch.notified_on = today;
        }

        const { error: updateError } = await supabase
            .from("applicants")
            .update(patch)
            .eq("id", id)
            .select("id");

        if (updateError) throw updateError;

        // Told, not left to be discovered. A decision changes what happens to a
        // home, so the people holding that home hear about it.
        if (patch.decision) {
            const word = {
                approved: "approved",
                conditions: "approved with conditions",
                denied: "declined",
            }[patch.decision];

            const where = current.property_label
                ? ` for ${current.property_label}`
                : "";

            const recipients = ["raj"];
            if (current.portfolio === "htm") recipients.push("zo");

            await supabase.from("notifications").insert(
                recipients.map((recipient) => ({
                    recipient,
                    type: "applicant_decided",
                    title: `${current.name} ${word}`,
                    body: `${profile.cockpit} ${word} ${current.name}${where}.`,
                    link: `/${recipient}`,
                })),
            );
        }

        return res.status(200).json({ ok: true, message: "Saved." });
    } catch (err) {
        console.error("applicants failed:", err);
        return res
            .status(500)
            .json({ error: "Could not load or save the applicants" });
    }
}