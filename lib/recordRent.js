// lib/recordRent.js
// Recording a rent amount, in one place.
//
// Two screens set rent now: the Map, when somebody moves in, and the Rent tab,
// when an existing amount is corrected. Both have to mean exactly the same
// thing by it - the figure on the lot, this month's charge moved to match, and
// the assisted-household split handled identically - or the two screens will
// eventually disagree about what a resident owes, and the resident is the one
// who finds out.

import { dueDateFor } from "./rentRules.js";

export function money(value) {
    return Math.round(Number(value ?? 0) * 100) / 100;
}

/**
 * Writes the rent and charges the month.
 *
 * Returns { ok: false, status, error } for anything the caller should refuse,
 * so the route can hand the sentence straight back to Zo, or
 * { ok: true, lot, tenantPortion, period } once it is written.
 */
export async function recordRent({
    supabase,
    lotId,
    contractRent,
    tenantPortion: givenPortion,
    /** Day of the month this tenancy pays. Falls back to the lot's own. */
    dueDay,
    /** When the tenancy started. Only sent on a move-in. */
    moveInOn = null,
    note = null,
    by,
    /** True only for a stand-in figure nobody has confirmed with the resident. */
    placeholder = false,    
}) {
    const rent = Number(contractRent);

    if (!Number.isFinite(rent) || rent <= 0) {
        return {
            ok: false,
            status: 400,
            error: "Enter the monthly rent from the lease",
        };
    }

    const { data: lot, error: lotError } = await supabase
        .from("lots")
        .select("id, lot_number, hap_household, rent_due_day")
        .eq("id", lotId)
        .maybeSingle();

    if (lotError) throw lotError;
    if (!lot) return { ok: false, status: 404, error: "No such lot" };

    // An assisted household pays a share, not the contract rent. If the split
    // is missing it is not assumed - a guess here overcharges someone on a
    // fixed income.
    let tenantPortion;

    if (lot.hap_household) {
        tenantPortion = Number(givenPortion);

        if (!Number.isFinite(tenantPortion) || tenantPortion < 0) {
            return {
                ok: false,
                status: 400,
                error: "This is an assisted household. Enter the tenant's portion as well as the contract rent.",
            };
        }
        if (tenantPortion > rent) {
            return {
                ok: false,
                status: 400,
                error: "The tenant's portion cannot be more than the contract rent.",
            };
        }
    } else {
        tenantPortion = rent;
    }

    // The due day comes from the move-in on a new tenancy, and from the lot
    // itself when an existing amount is being corrected - Zo should not have to
    // re-answer a question he has already answered.
    const askedDay = Number(dueDay);
    const effectiveDueDay = Number.isFinite(askedDay)
        ? askedDay
        : lot.rent_due_day;

    if (
        !Number.isFinite(Number(effectiveDueDay)) ||
        Number(effectiveDueDay) < 1 ||
        Number(effectiveDueDay) > 31
    ) {
        return {
            ok: false,
            status: 400,
            error: "Which day of the month do they pay? It comes from the move-in date.",
        };
    }

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(
        now.getUTCMonth() + 1,
    ).padStart(2, "0")}-01`;

    const { error: updateError } = await supabase
        .from("lots")
        .update({
            contract_rent: rent,
            tenant_portion: tenantPortion,
            hap_portion: lot.hap_household ? money(rent - tenantPortion) : null,
            rent_set_by: by,
            rent_set_at: now.toISOString(),
            // Who typed it and when. That record is the only thing standing
            // between a mistyped number and a resident being chased for it.
            rent_confirmed_by: by,
            rent_confirmed_at: now.toISOString(),
            rent_note: note ? String(note).slice(0, 500) : null,
            // Any real entry clears the stand-in flag, including one typed over
            // the top of a placeholder.
            rent_placeholder: placeholder,
            rent_due_day: Number(effectiveDueDay),
            // Only written on a move-in. Correcting a rent must not rewrite
            // when somebody moved in.
            ...(moveInOn ? { move_in_on: moveInOn } : {}),
            updated_at: now.toISOString(),
        })
        .eq("id", lotId);

    if (updateError) throw updateError;

    // This month's charge, at the amount just entered. A correction has to move
    // the charge with it or the roll goes on chasing the old number - so this
    // updates in place rather than inserting a second row the unique index
    // would refuse anyway.
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
        // The tenancy's own day, not the 1st. Clamped down in short months, so
        // a 31st tenancy is due the 28th in February rather than spilling into
        // March and colliding with the next charge.
        due_date: dueDateFor(effectiveDueDay, period),
        source: "manual",
        verified_at: now.toISOString(),
        verified_by: by,
    };

    const { error: chargeError } = existingCharge
        ? await supabase
              .from("rent_ledger")
              .update(chargeRow)
              .eq("id", existingCharge.id)
        : await supabase.from("rent_ledger").insert(chargeRow);

    if (chargeError) throw chargeError;

    return { ok: true, lot, tenantPortion, period };
}