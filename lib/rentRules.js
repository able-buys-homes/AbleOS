// lib/rentRules.js
// The rent rule for Hometown Meadows, in one place.
//
// Rent is due on the 1st. The 5th is the last day to pay. From the 6th the
// lot is late and a $75 fee applies.
//
// These are park policy, not per-lot terms. The day a second park arrives, or
// a lease carries different terms, this has to become a table - and every
// reader of these constants will break loudly rather than quietly charging
// the wrong fee, which is the point of putting them here.
//
// Standing caveat: a late fee is only chargeable if the lease provides for
// it. Nothing in this system has read a lease.

export const RENT_DUE_DAY = 1;
export const LAST_DAY_TO_PAY = 5;  
export const LATE_FEE = 75;

// The park is in Nashville, Arkansas. Deciding "what day is it" in UTC moves
// the boundary to six in the evening the day before for part of the year -
// which is how a resident gets charged a late fee on the evening of the 5th
// while the office is still open.
const ZONE = "America/Chicago";

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

/** The first of the current month at the park, as YYYY-MM-01. */
export function currentPeriod(now = new Date()) {
    const { year, month } = parkToday(now);
    return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** True once the grace period has run out for the current month. */
export function pastGrace(now = new Date()) {
    return parkToday(now).day > LAST_DAY_TO_PAY;
}