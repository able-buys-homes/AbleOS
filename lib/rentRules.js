// lib/rentRules.js
// The rent rule for Hometown Meadows, in one place.
//
// Rent is due on the day of the month the tenancy started, and on that day
// every month after. Five days of grace follow. From the sixth day the lot is
// late and a $75 fee applies.
//
// It used to be the 1st for everybody, with the 5th as the last day. That made
// a resident who moved in on the 11th late on the 6th, for money that was not
// due for another five days. The due day now lives on the lot, as
// lots.rent_due_day, and is null until somebody has actually asked the
// resident - a lot with no due day is not billed and cannot be late, because a
// guessed due day is a guessed late fee.
//
// Standing caveat: a late fee is only chargeable if the lease provides for it.
// Nothing in this system has read a lease.

export const GRACE_DAYS = 5;
export const LATE_FEE = 75;

/**
 * The old park-wide terms. Kept so anything still importing them keeps
 * compiling - nothing should be deciding lateness from these any more.
 *
 * @deprecated Use the lot's rent_due_day with dueDateFor and isLateOn.
 */
export const RENT_DUE_DAY = 1;
/** @deprecated Use GRACE_DAYS against the lot's own due date. */
export const LAST_DAY_TO_PAY = 5;

// The park is in Nashville, Arkansas. Deciding "what day is it" in UTC moves
// the boundary to six in the evening the day before for part of the year -
// which is how a resident gets charged a late fee on the evening of the 5th
// while the office is still open.
const ZONE = "America/Chicago";

function iso(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
        2,
        "0",
    )}`;
}

function daysInMonth(year, month) {
    // Day 0 of the next month is the last day of this one.
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Today at the park, as { year, month, day }. Not UTC. */
export function parkToday(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);

    const get = (type) => Number(parts.find((p) => p.type === type).value);

    return { year: get("year"), month: get("month"), day: get("day") };
}

/** Today at the park as YYYY-MM-DD, which compares correctly as a string. */
export function parkTodayISO(now = new Date()) {
    const { year, month, day } = parkToday(now);
    return iso(year, month, day);
}

/** The first of the current month at the park, as YYYY-MM-01. */
export function currentPeriod(now = new Date()) {
    const { year, month } = parkToday(now);
    return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** The billing month a date falls in, as YYYY-MM-01. */
export function periodOf(dateIso) {
    const [y, m] = String(dateIso).split("-");
    return `${y}-${m}-01`;
}

/**
 * When rent is due for one lot in one billing month.
 *
 * A tenancy that pays on the 31st is due on the 30th in April and the 28th in
 * February. Clamping down rather than spilling into the next month keeps the
 * charge inside the month it belongs to, and keeps two charges from landing in
 * the same one.
 *
 * Returns null when the lot has no due day - which is a real answer, not a
 * failure: nobody has asked that resident yet.
 */
export function dueDateFor(dueDay, period) {
    const day = Number(dueDay);
    if (!Number.isFinite(day) || day < 1 || day > 31) return null;

    const [year, month] = String(period).split("-").map(Number);
    if (!year || !month) return null;

    return iso(year, month, Math.min(day, daysInMonth(year, month)));
}

/** The last day a payment still counts as on time. */
export function lastDayToPay(dueDateIso) {
    if (!dueDateIso) return null;

    const [y, m, d] = String(dueDateIso).split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + GRACE_DAYS));

    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** True once the grace period on that due date has run out at the park. */
export function isLateOn(dueDateIso, now = new Date()) {
    const last = lastDayToPay(dueDateIso);
    if (!last) return false;

    return parkTodayISO(now) > last;
}

/**
 * True once the grace period has run out for the current month.
 *
 * @deprecated Park-wide lateness. Use isLateOn with the lot's own due date.
 */
export function pastGrace(now = new Date()) {
    return parkToday(now).day > LAST_DAY_TO_PAY;
}