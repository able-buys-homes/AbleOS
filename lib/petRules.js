// lib/petRules.js
// T-25 Part 2 (15 Oct 2026, Coco's spec): pet charges are SETTINGS with no
// defaults, and service / assistance animals are always exempt.
//
// This file only decides what MAY be charged. It never charges anyone.
//
// Rules (from the T-25 spec + Lex's memo; counsel reviews before go-live):
//   - "service_trained": no pet fee, deposit or pet rent - ever. Actual damage
//     can still be itemized like any other damage.
//   - "esa_untrained": blocked (esa_fee_policy = blocked_pending_counsel).
//   - "request_pending": an accommodation request is never charged.
//   - "pet": allowed, but ONLY amounts that have been set. An empty setting
//     means nothing is charged.
//   - No pet fee is ever added mid-lease (caller passes midLease).

export const ANIMAL_STATUSES = ["pet", "service_trained", "esa_untrained", "request_pending"];
export const ANIMAL_KINDS = ["dog", "cat", "other"];

const EXEMPT = {
    service_trained: "Service animal - no pet fee, deposit or pet rent.",
    esa_untrained: "Assistance animal - pet charges blocked until counsel confirms.",
    request_pending: "Accommodation request pending - never charged.",
};

const amount = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

/**
 * @param {{pet_fee?:number|null, pet_deposit?:number|null, pet_rent_monthly?:number|null}} settings
 * @param {{status:string}} animal
 * @param {{midLease?:boolean}} [opts]
 * @returns {{allowed:boolean, reason:string, charges:{type:string, amount:number}[]}}
 */
export function petCharges(settings, animal, opts = {}) {
    const status = animal?.status;
    if (!ANIMAL_STATUSES.includes(status)) {
        return { allowed: false, reason: "Unknown animal status - nothing charged.", charges: [] };
    }
    if (EXEMPT[status]) return { allowed: false, reason: EXEMPT[status], charges: [] };

    const charges = [];
    const fee = amount(settings?.pet_fee);
    const deposit = amount(settings?.pet_deposit);
    const rent = amount(settings?.pet_rent_monthly);

    if (fee && !opts.midLease) charges.push({ type: "pet_fee", amount: fee });
    if (deposit && !opts.midLease) charges.push({ type: "pet_deposit", amount: deposit });
    if (rent) charges.push({ type: "pet_rent_monthly", amount: rent });

    if (!charges.length) {
        return {
            allowed: false,
            reason: opts.midLease && (fee || deposit) && !rent
                ? "No pet fee or deposit is added mid-lease."
                : "Pet amounts are not set yet - nothing charged.",
            charges: [],
        };
    }
    return { allowed: true, reason: "Pet - set amounts only.", charges };
}
