// lib/depositRules.js
// Security-deposit rules for T-25 (11 Oct 2026). Pure - no database, no clock
// of its own - so every rule can be tested with fixed dates.
//
// Source: Lex's research memo /workspace/legal/t25_legal_memo_2026-10-11.md
// (research findings, not a formal legal opinion - counsel reviews before
// go-live), plus Knox's review and Raj's/Coco's decisions of 11 Oct 2026.
// A deadline is never typed in or hard-coded elsewhere: it is always worked
// out here from the deposit's jurisdiction_rule and its dates. Changing a
// rule means editing RULES below, with a dated note and its source.

export const RULES = {
    // Hometown Meadows (Arkansas). Ark. Code 18-16-301 et seq.
    "AR_18-16": {
        portfolio: "htm",
        state: "AR",
        startsFrom: "surrender_on",      // move-out
        refundDays: 60,
        itemizedNotice: true,
        capMonthsRent: 2,                // refused above this unless Raj/Dane override with a note
        requiresFirstClassMail: true,    // at least one first_class mail-log entry before closing
        returnedMailHoldDays: 180,       // notice returned undeliverable -> hold this long from that day
        alertWithoutForwardingAddress: false,
        firstLeaseOnly: false,
    },
    // AHTX houses (Texas). Tex. Prop. Code ch. 92.
    TX_92: {
        portfolio: "ahtx",
        state: "TX",
        startsFrom: "surrender_on",
        refundDays: 30,
        itemizedNotice: true,
        capMonthsRent: null,
        requiresFirstClassMail: false,
        returnedMailHoldDays: null,
        alertWithoutForwardingAddress: true, // alert at 30 days even if no forwarding address came in
        firstLeaseOnly: false,
    },
    // Tenant-owned home on a leased lot (Texas). Tex. Prop. Code ch. 94.
    TX_94: {
        portfolio: "ahtx",
        state: "TX",
        startsFrom: "surrender_on",      // lot surrender
        refundDays: 30,
        itemizedNotice: true,
        capMonthsRent: null,
        requiresFirstClassMail: false,
        returnedMailHoldDays: null,
        alertWithoutForwardingAddress: true,
        firstLeaseOnly: true,            // a deposit may only be taken at the first lease
    },
};

/** Which rule a new deposit gets by default. Raj or Dane can change it. */
export const DEFAULT_RULE = { htm: "AR_18-16", ahtx: "TX_92" };

/** Returned-payment fee (Part 3). HTM: Raj, 11 Oct 2026. Texas: empty = no fee until Lex researches. */
export const RETURNED_PAYMENT_FEE = { AR: 30, TX: null };

/** Alert points, in days left before the refund deadline. */
export const ALERT_DAYS = [14, 3];

/** Deduction kinds the database accepts. Wear and tear is never one of them. */
export const DEDUCTION_KINDS = ["damage", "unpaid_rent", "cleaning", "other"];

function addDays(isoDate, days) {
    const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
    const a = Date.UTC(...String(fromIso).slice(0, 10).split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
    const b = Date.UTC(...String(toIso).slice(0, 10).split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
    return Math.round((b - a) / 86400000);
}

export function ruleFor(code) {
    const rule = RULES[code];
    if (!rule) throw new Error(`Unknown deposit rule: ${code}`);
    return rule;
}

/**
 * Is this amount allowed when the deposit is taken?
 * Returns { ok, reason }. An AR deposit above 2x monthly rent is refused unless
 * Raj or Dane overrides it with a note.
 */
export function checkAmount({ rule: code, amount, monthlyRent, override }) {
    const rule = ruleFor(code);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: "Enter the deposit amount" };
    if (rule.capMonthsRent) {
        const rent = Number(monthlyRent);
        if (!Number.isFinite(rent) || rent <= 0) {
            return { ok: false, reason: "Enter the monthly rent so the legal cap can be checked" };
        }
        const cap = Math.round(rent * rule.capMonthsRent * 100) / 100;
        if (value > cap) {
            const allowed = override && ["raj", "dane"].includes(override.by) && String(override.note ?? "").trim().length >= 5;
            if (!allowed) {
                return { ok: false, reason: `Above the ${rule.capMonthsRent}-month cap ($${cap}). Raj or Dane can override with a note.` };
            }
        }
    }
    return { ok: true, reason: null };
}

/** TX_94: a deposit may only be taken at the first lease on that lot. */
export function checkFirstLease({ rule: code, earlierDepositsOnLot }) {
    const rule = ruleFor(code);
    if (rule.firstLeaseOnly && Number(earlierDepositsOnLot) > 0) {
        return { ok: false, reason: "Under TX_94 a deposit can only be taken at the first lease on this lot" };
    }
    return { ok: true, reason: null };
}

/**
 * Where a deposit stands today: deadline, days left, and any warnings.
 * deposit: { jurisdiction_rule, surrender_on, forwarding_address_received,
 *            closed_on, mail: [{ method, returned_undeliverable_on }] }
 */
export function depositClock(deposit, today) {
    const rule = ruleFor(deposit.jurisdiction_rule);
    const out = { rule: deposit.jurisdiction_rule, due_on: null, days_left: null, state: "held", warnings: [] };

    if (deposit.closed_on) return { ...out, state: "closed" };
    if (!deposit.surrender_on) return out; // still living there - no clock yet

    out.due_on = addDays(deposit.surrender_on, rule.refundDays);
    out.days_left = daysBetween(today, out.due_on);
    out.state = out.days_left < 0 ? "overdue" : ALERT_DAYS.some((d) => out.days_left <= d) ? "due_soon" : "due";

    if (rule.alertWithoutForwardingAddress && !deposit.forwarding_address_received) {
        out.warnings.push("No forwarding address yet - the deadline still applies");
    }

    if (rule.returnedMailHoldDays) {
        const returned = (deposit.mail ?? [])
            .map((m) => m.returned_undeliverable_on)
            .filter(Boolean)
            .sort()
            .pop();
        if (returned) {
            out.state = "returned_mail";
            out.hold_until = addDays(returned, rule.returnedMailHoldDays);
            out.warnings.push(`Notice came back undeliverable on ${returned} - hold until ${out.hold_until}`);
        }
    }
    return out;
}

/** Which alert (if any) is due today: 14 days left, 3 days left, or overdue. */
export function alertToday(deposit, today) {
    const c = depositClock(deposit, today);
    if (c.state === "closed" || c.days_left === null || c.state === "returned_mail") return null;
    if (c.days_left < 0) return "overdue";
    if (ALERT_DAYS.includes(c.days_left)) return `${c.days_left}_days_left`;
    return null;
}

/** Can this deposit be closed? AR needs at least one first-class mailing. */
export function checkClose(deposit) {
    const rule = ruleFor(deposit.jurisdiction_rule);
    if (!deposit.surrender_on) return { ok: false, reason: "Record the move-out date first" };
    if (rule.requiresFirstClassMail && !(deposit.mail ?? []).some((m) => m.method === "first_class")) {
        return { ok: false, reason: "Arkansas: log the itemized notice sent by first-class mail before closing" };
    }
    return { ok: true, reason: null };
}

/** Refuse wear and tear anywhere, and any kind the table would refuse. */
export function checkDeduction({ kind, description, amount }) {
    if (/wear|tear/i.test(String(kind)) || /normal wear/i.test(String(description))) {
        return { ok: false, reason: "Normal wear and tear cannot be deducted" };
    }
    if (!DEDUCTION_KINDS.includes(kind)) return { ok: false, reason: "Pick damage, unpaid rent, cleaning or other" };
    if (!(Number(amount) > 0)) return { ok: false, reason: "Enter the amount" };
    if (String(description ?? "").trim().length < 3) return { ok: false, reason: "Say what it is for" };
    return { ok: true, reason: null };
}
