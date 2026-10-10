// lib/lateFeeDecision.js
// Whether one lot owes the $75 late fee for one billing month. Pure - no
// database, no clock of its own - so the rules can be tested with a fake
// date. Used by routes/late-fees.js (Dev #12, 11 Oct 2026).
//
// Why a second month at all: a resident due on the 28th has a grace period
// that ends on the 2nd or 3rd of the NEXT month. By then the job is looking
// at the new month, so the old one was never assessed. The job now also asks
// about the previous month - but only when that month's grace ended in the
// current month. Older months were assessed in their own time, and this
// keeps a resume after a pause from back-charging anybody.

import { dueDateFor, lastDayToPay, parkTodayISO } from "./rentRules.js";

const DAY = 86400000;

function shift(isoDate, days) {
    const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The billing month before the given one, as YYYY-MM-01. */
export function previousPeriod(period) {
    const [y, m] = String(period).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 10);
}

/**
 * @param {object} a
 * @param {object} a.lot          { id, rent_due_day, rent_placeholder }
 * @param {string} a.period       the month being assessed, YYYY-MM-01
 * @param {string} a.currentPeriod the month the job is running in, YYYY-MM-01
 * @param {string} a.today        today at the park, YYYY-MM-DD
 * @param {Array}  a.charges      this lot's current-tenancy ledger rows (any period)
 * @param {Array}  a.payments     this lot's current-tenancy payments
 * @param {boolean} a.paused      LATENESS_PAUSED
 * @returns {{ charge: boolean, why: string, short?: number, due?: string }}
 */
export function decideLateFee({ lot, period, currentPeriod, today, charges, payments, paused }) {
    if (paused) return { charge: false, why: "late fees are paused" };
    if (lot.rent_placeholder) return { charge: false, why: "rent is a placeholder" };

    const due = dueDateFor(lot.rent_due_day, period);
    if (!due) return { charge: false, why: "no due day on file" };

    const last = lastDayToPay(due);
    if (!(today > last)) {
        return { charge: false, why: `still inside the grace period, due ${due}`, due };
    }

    // The previous month only counts when its grace ran out this month.
    if (period !== currentPeriod && last < currentPeriod) {
        return { charge: false, why: `grace ended ${last}, assessed in its own month`, due };
    }

    const inPeriod = charges.filter((c) => String(c.period).slice(0, 10) === period);
    const rent = inPeriod.filter((c) => c.charge_type === "rent");

    // Prior balances, fees and anything else are never a reason for a fee.
    const rentDue = rent.reduce((s, c) => s + Number(c.amount), 0);
    if (rentDue <= 0) return { charge: false, why: "nothing charged", due };

    // A resident cannot be late for a bill that did not exist yet.
    const first = [...rent].sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)),
    )[0];
    if (first && parkTodayISO(new Date(first.created_at)) > (lastDayToPay(first.due_date ?? due) ?? "0000-01-01")) {
        return { charge: false, why: "rent recorded after its grace period had passed", due };
    }

    if (inPeriod.some((c) => c.charge_type === "late_fee")) {
        return { charge: false, why: "fee already applied", due };
    }

    // Early payments count. For this month the window opens a week before the
    // 1st (as before); for last month it opens a week before its due date, so
    // a resident due on the 28th who paid on the 30th or the 2nd is paid.
    const from = period === currentPeriod ? shift(period, -7) : shift(due, -7);
    const paid = payments
        .filter((p) => String(p.received_at).slice(0, 10) >= from)
        .reduce((s, p) => s + Number(p.amount), 0);

    if (paid >= rentDue) return { charge: false, why: "paid", due };

    return { charge: true, why: "late", short: Math.round((rentDue - paid) * 100) / 100, due };
}
