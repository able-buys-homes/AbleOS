// routes/deposits.js
// Security deposits (T-25, 11 Oct 2026). Rules live in lib/depositRules.js;
// this route only records facts and asks the rules what they mean.
//
// GET  /api/deposits                 open deposits (+ last 90 days closed) with
//                                    their deadline, days left and warnings
// POST /api/deposits?record=1        take a deposit
// POST /api/deposits?moveout=1       record move-out / surrender (starts the clock)
// POST /api/deposits?deduct=1        add an itemized deduction
// POST /api/deposits?mail=1          log the mailed notice
// POST /api/deposits?returned=1      a mailed notice came back undeliverable
// POST /api/deposits?close=1         refunded / applied / partly refunded
// POST /api/deposits?import=1        existing deposits from a CSV (Raj/Dane)
//
// Who: Raj and Dane see and do everything. The recorders in deposit_settings
// (HTM: Zo, AHTX: Ellery) work their own portfolio only. Nothing here touches
// rent_ledger or QuickBooks - a deposit is not rent and not income.

import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../lib/apiAuth.js";
import {
    DEFAULT_RULE,
    RULES,
    checkAmount,
    checkClose,
    checkDeduction,
    checkFirstLease,
    depositClock,
} from "../lib/depositRules.js";

const ADMINS = ["raj", "dane"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

let cached = null;
function db() {
    if (cached) return cached;
    cached = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return cached;
}

function todayCentral() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function fail(res, status, error) {
    return res.status(status).json({ error });
}

/** Portfolios this person may work, from deposit_settings. */
async function portfoliosFor(supabase, cockpit) {
    if (ADMINS.includes(cockpit)) return ["htm", "ahtx"];
    const { data, error } = await supabase.from("deposit_settings").select("portfolio, recorders");
    if (error) throw error;
    return (data ?? []).filter((s) => (s.recorders ?? []).includes(cockpit)).map((s) => s.portfolio);
}

async function loadDeposit(supabase, id) {
    const { data, error } = await supabase.from("deposits").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { data: mail, error: mErr } = await supabase
        .from("deposit_mail_log").select("*").eq("deposit_id", id).order("sent_on");
    if (mErr) throw mErr;
    return { ...data, mail: mail ?? [] };
}

async function audit(supabase, by, action, id, detail) {
    await supabase
        .from("audit_log")
        .insert({ actor: by, cockpit: by, action, entity: "deposit", entity_id: id, reason: detail ?? null })
        .then(() => null, () => null);
}

/** Validates and builds one deposit row. Shared by record and import. */
async function buildDeposit(supabase, input, by, source) {
    const portfolio = input.portfolio === "ahtx" ? "ahtx" : input.portfolio === "htm" ? "htm" : null;
    if (!portfolio) return { error: "Pick HTM or AHTX" };

    const rule = String(input.jurisdiction_rule || DEFAULT_RULE[portfolio]);
    if (!RULES[rule]) return { error: "Unknown legal rule" };
    if (RULES[rule].portfolio !== portfolio) return { error: `${rule} does not apply to ${portfolio.toUpperCase()}` };
    if (rule !== DEFAULT_RULE[portfolio] && !ADMINS.includes(by)) {
        return { error: "Only Raj or Dane can change the legal rule" };
    }

    if (!ISO.test(String(input.received_on || ""))) return { error: "Enter the date the deposit was received" };

    let lot = null;
    let unit = null;
    // A bad id must be a polite refusal, not a database error.
    const UUID = /^[0-9a-f-]{36}$/i;
    if (portfolio === "htm" && !UUID.test(String(input.lot_id || ""))) return { error: "Pick a lot on the rent roll" };
    if (portfolio === "ahtx" && !UUID.test(String(input.unit_id || ""))) return { error: "Pick an AHTX door" };
    if (portfolio === "htm") {
        const { data, error } = await supabase
            .from("lots").select("id, lot_number, contract_rent, tenancy_started_at, archived_at")
            .eq("id", String(input.lot_id || "")).maybeSingle();
        if (error) throw error;
        if (!data || data.archived_at) return { error: "Pick a lot on the rent roll" };
        lot = data;
    } else {
        const { data, error } = await supabase
            .from("property_units").select("*").eq("id", String(input.unit_id || "")).maybeSingle();
        if (error) throw error;
        if (!data) return { error: "Pick an AHTX door" };
        unit = data;
    }

    const monthlyRent = input.monthly_rent ?? lot?.contract_rent ?? unit?.rent_amount ?? null;
    const amountCheck = checkAmount({
        rule,
        amount: input.amount,
        monthlyRent,
        override: input.override_note ? { by, note: input.override_note } : null,
    });
    if (!amountCheck.ok) return { error: amountCheck.reason };

    if (RULES[rule].firstLeaseOnly) {
        const key = lot ? "lot_id" : "unit_id";
        const { count, error } = await supabase
            .from("deposits").select("id", { count: "exact", head: true }).eq(key, (lot ?? unit).id);
        if (error) throw error;
        const first = checkFirstLease({ rule, earlierDepositsOnLot: count ?? 0 });
        if (!first.ok) return { error: first.reason };
    }

    const cap = RULES[rule].capMonthsRent ? Number(monthlyRent) * RULES[rule].capMonthsRent : null;
    const overCap = cap !== null && Number(input.amount) > cap;

    return {
        row: {
            portfolio,
            lot_id: lot?.id ?? null,
            unit_id: unit?.id ?? null,
            tenancy_started_at: lot?.tenancy_started_at ?? null,
            amount: Number(input.amount),
            received_on: input.received_on,
            method: input.method ? String(input.method).slice(0, 40) : null,
            jurisdiction_rule: rule,
            monthly_rent_at_receipt: monthlyRent === null ? null : Number(monthlyRent),
            cap_override_by: overCap ? by : null,
            cap_override_note: overCap ? String(input.override_note).trim().slice(0, 500) : null,
            surrender_on: ISO.test(String(input.surrender_on || "")) ? input.surrender_on : null,
            source,
            import_ref: input.import_ref ? String(input.import_ref).slice(0, 120) : null,
            note: input.note ? String(input.note).trim().slice(0, 500) : null,
            created_by: by,
        },
    };
}

export default async function handler(req, res) {
    let caller;
    try {
        caller = await requireUser(req);
    } catch (err) {
        return fail(res, err?.status || 401, err?.message || "Not authorised");
    }
    const by = caller.profile.cockpit;
    const supabase = db();

    try {
        const mine = await portfoliosFor(supabase, by);
        if (mine.length === 0) return fail(res, 403, "Deposits are not part of your cockpit");

        /* ---- list ---- */
        if (req.method === "GET") {
            const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
            const { data, error } = await supabase
                .from("deposits").select("*").in("portfolio", mine)
                .or(`closed_on.is.null,closed_on.gte.${since}`)
                .order("created_at", { ascending: false });
            if (error) throw error;

            const ids = (data ?? []).map((d) => d.id);
            const [mailRes, dedRes, lotRes, unitRes, propRes] = await Promise.all([
                ids.length ? supabase.from("deposit_mail_log").select("*").in("deposit_id", ids) : { data: [] },
                ids.length ? supabase.from("deposit_deductions").select("*").in("deposit_id", ids) : { data: [] },
                supabase.from("lots").select("id, lot_number, contract_rent, archived_at"),
                supabase.from("property_units").select("id, property_id, label, rent_amount"),
                supabase.from("properties").select("id, name, portfolio"),
            ]);
            for (const r of [mailRes, dedRes, lotRes, unitRes, propRes]) if (r.error) throw r.error;

            const lotNo = new Map((lotRes.data ?? []).map((l) => [l.id, l.lot_number]));
            const propName = new Map((propRes.data ?? []).map((p) => [p.id, p.name]));
            const ahtxProps = new Set((propRes.data ?? []).filter((p) => p.portfolio === "ahtx").map((p) => p.id));
            const nameOf = (u) => [propName.get(u.property_id), u.label && u.label !== "Whole home" ? u.label : null].filter(Boolean).join(" · ") || "AHTX door";
            const unitName = new Map((unitRes.data ?? []).map((u) => [u.id, nameOf(u)]));

            // Pick lists for "Take a deposit" - only what this person may record.
            const options = {
                lots: mine.includes("htm")
                    ? (lotRes.data ?? []).filter((l) => !l.archived_at)
                        .sort((a, b) => (Number(a.lot_number) || 0) - (Number(b.lot_number) || 0))
                        .map((l) => ({ id: l.id, lot_number: l.lot_number, contract_rent: l.contract_rent }))
                    : [],
                units: mine.includes("ahtx")
                    ? (unitRes.data ?? []).filter((u) => ahtxProps.has(u.property_id))
                        .map((u) => ({ id: u.id, name: nameOf(u), rent_amount: u.rent_amount }))
                    : [],
            };
            const today = todayCentral();

            const deposits = (data ?? []).map((d) => {
                const mail = (mailRes.data ?? []).filter((m) => m.deposit_id === d.id);
                const deductions = (dedRes.data ?? []).filter((x) => x.deposit_id === d.id);
                return {
                    ...d,
                    where: d.lot_id ? `Lot ${lotNo.get(d.lot_id) ?? "?"}` : unitName.get(d.unit_id) ?? "AHTX door",
                    mail,
                    deductions,
                    deductions_total: deductions.reduce((s, x) => s + Number(x.amount), 0),
                    clock: depositClock({ ...d, mail }, today),
                };
            });
            return res.status(200).json({ today, deposits, options });
        }

        if (req.method !== "POST") {
            res.setHeader("Allow", "GET, POST");
            return fail(res, 405, "Method not allowed");
        }
        const body = req.body || {};
        const q = req.query || {};

        /* ---- import existing deposits (Raj / Dane) ---- */
        if (q.import) {
            if (!ADMINS.includes(by)) return fail(res, 403, "Only Raj or Dane can import deposits");
            const rows = Array.isArray(body.rows) ? body.rows.slice(0, 200) : [];
            if (!rows.length) return fail(res, 400, "No rows to import");
            const results = [];
            for (const [i, input] of rows.entries()) {
                const built = await buildDeposit(supabase, input, by, "csv_import");
                if (built.error) { results.push({ row: i + 1, ok: false, error: built.error }); continue; }
                const { data, error } = await supabase.from("deposits").insert(built.row).select("id").single();
                if (error) { results.push({ row: i + 1, ok: false, error: error.message }); continue; }
                results.push({ row: i + 1, ok: true, id: data.id });
            }
            await audit(supabase, by, "deposit_import", null, `${results.filter((r) => r.ok).length} of ${rows.length} rows`);
            return res.status(200).json({ results });
        }

        /* ---- take a deposit ---- */
        if (q.record) {
            if (!mine.includes(body.portfolio)) return fail(res, 403, "Not your portfolio");
            const built = await buildDeposit(supabase, body, by, "manual");
            if (built.error) return fail(res, 400, built.error);
            const { data, error } = await supabase.from("deposits").insert(built.row).select("id").single();
            if (error) throw error;
            await audit(supabase, by, "deposit_record", data.id, built.row.cap_override_note);
            return res.status(200).json({ ok: true, id: data.id });
        }

        // Every other action works on one existing deposit.
        const id = String(body.id || body.deposit_id || "");
        const dep = id ? await loadDeposit(supabase, id) : null;
        if (!dep && !q.returned) return fail(res, 404, "No such deposit");
        if (dep && !mine.includes(dep.portfolio)) return fail(res, 403, "Not your portfolio");
        if (dep?.closed_on && !q.returned) return fail(res, 409, "That deposit is already closed");
        const now = new Date().toISOString();

        if (q.moveout) {
            if (!ISO.test(String(body.surrender_on || ""))) return fail(res, 400, "Enter the move-out date");
            const patch = {
                surrender_on: body.surrender_on,
                forwarding_address_received: Boolean(body.forwarding_address_received),
                forwarding_address_on: ISO.test(String(body.forwarding_address_on || "")) ? body.forwarding_address_on : null,
                status: "due",
                updated_at: now,
            };
            const { error } = await supabase.from("deposits").update(patch).eq("id", id);
            if (error) throw error;
            await audit(supabase, by, "deposit_moveout", id, body.surrender_on);
            return res.status(200).json({ ok: true, clock: depositClock({ ...dep, ...patch }, todayCentral()) });
        }

        if (q.deduct) {
            const check = checkDeduction(body);
            if (!check.ok) return fail(res, 400, check.reason);
            const { error } = await supabase.from("deposit_deductions").insert({
                deposit_id: id,
                kind: body.kind,
                description: String(body.description).trim().slice(0, 300),
                amount: Number(body.amount),
                created_by: by,
            });
            if (error) throw error;
            await audit(supabase, by, "deposit_deduct", id, `${body.kind} ${body.amount}`);
            return res.status(200).json({ ok: true });
        }

        if (q.mail) {
            if (!ISO.test(String(body.sent_on || ""))) return fail(res, 400, "Enter the date it was mailed");
            if (String(body.to_address || "").trim().length < 8) return fail(res, 400, "Enter the full address it was sent to");
            if (!["first_class", "certified", "hand"].includes(body.method)) return fail(res, 400, "Pick how it was sent");
            const { error } = await supabase.from("deposit_mail_log").insert({
                deposit_id: id,
                sent_on: body.sent_on,
                to_address: String(body.to_address).trim().slice(0, 300),
                method: body.method,
                tracking: body.tracking ? String(body.tracking).slice(0, 80) : null,
                created_by: by,
            });
            if (error) throw error;
            await supabase.from("deposits").update({ itemized_notice_sent_on: body.sent_on, updated_at: now }).eq("id", id);
            await audit(supabase, by, "deposit_mail", id, body.method);
            return res.status(200).json({ ok: true });
        }

        if (q.returned) {
            const mailId = String(body.mail_id || "");
            if (!ISO.test(String(body.returned_on || ""))) return fail(res, 400, "Enter the date it came back");
            const { data: m, error: mErr } = await supabase.from("deposit_mail_log").select("deposit_id").eq("id", mailId).maybeSingle();
            if (mErr) throw mErr;
            if (!m) return fail(res, 404, "No such mailing");
            const parent = await loadDeposit(supabase, m.deposit_id);
            if (!parent || !mine.includes(parent.portfolio)) return fail(res, 403, "Not your portfolio");
            const { error } = await supabase.from("deposit_mail_log").update({ returned_undeliverable_on: body.returned_on }).eq("id", mailId);
            if (error) throw error;
            await supabase.from("deposits").update({ status: "returned_mail", updated_at: now }).eq("id", m.deposit_id);
            await audit(supabase, by, "deposit_mail_returned", m.deposit_id, body.returned_on);
            return res.status(200).json({ ok: true });
        }

        if (q.close) {
            const outcome = String(body.outcome || "");
            if (!["refunded", "applied", "partly_refunded"].includes(outcome)) return fail(res, 400, "Pick refunded, applied or partly refunded");
            const check = checkClose(dep);
            if (!check.ok) return fail(res, 400, check.reason);
            const refund = outcome === "applied" ? 0 : Number(body.refund_amount);
            if (outcome !== "applied" && !(refund > 0)) return fail(res, 400, "Enter the amount refunded");
            const { error } = await supabase.from("deposits").update({
                status: outcome,
                refund_amount: refund,
                closed_on: todayCentral(),
                updated_at: now,
            }).eq("id", id);
            if (error) throw error;
            await audit(supabase, by, "deposit_close", id, `${outcome} ${refund}`);
            return res.status(200).json({ ok: true });
        }

        return fail(res, 400, "Unknown action");
    } catch (err) {
        console.error("deposits error:", err?.message ?? err);
        return fail(res, 500, "Could not complete that just now");
    }
}
