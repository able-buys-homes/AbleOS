// lib/websiteApplication.js
// Turning what the Hometown Meadows website posts into the shape the cockpit
// stores and the PDF is built from.
//
// The two forms ask the same thirteen sections and name about a dozen fields
// differently - ssn vs ssnLast4, job1 vs job, rentOwn vs rentOrOwn, "no" vs
// false. Left untranslated, a website application arrives with the right name
// on it and a blank PDF underneath, which reads as though the applicant left
// everything empty.
//
// This lives here rather than in an n8n Code node so there is one copy of it,
// next to lib/applicationPdf.js which is the thing that depends on it.

/** "no" -> false, "yes" -> true, anything else -> null. Never a guess. */
function yesNo(value) {
    const v = String(value ?? "").trim().toLowerCase();
    if (v === "yes" || v === "true") return true;
    if (v === "no" || v === "false") return false;
    return null;
}

function text(value) {
    return value === null || value === undefined ? "" : String(value);
}

/**
 * The website asks previous address dates as one "from – to" string. Ours holds
 * two dates. Split when there is clearly a separator, and put the whole thing
 * in "moved in" when there is not - printing half a range under "moved out"
 * would be inventing a date.
 */
function splitRange(value) {
    const raw = text(value).trim();
    if (!raw) return { moveIn: "", moveOut: "" };

    const parts = raw.split(/\s*(?:–|—|-|to)\s*/i).filter(Boolean);

    if (parts.length >= 2) {
        return { moveIn: parts[0], moveOut: parts.slice(1).join(" ") };
    }
    return { moveIn: raw, moveOut: "" };
}

function person(p, extra = {}) {
    return {
        name: text(p?.name),
        dob: text(p?.dob),
        // The website calls it ssn. It is the last four either way, and the
        // form label on both sides says so.
        ssnLast4: text(p?.ssnLast4 ?? p?.ssn).replace(/\D/g, "").slice(0, 4),
        phone: text(p?.phone),
        email: text(p?.email),
        idNumber: text(p?.idNumber),
        ...extra,
    };
}

function residence(r, isPrevious) {
    const range = splitRange(r?.dates ?? r?.moveIn);

    return {
        address: text(r?.address),
        moveIn: text(r?.moveIn) || range.moveIn,
        moveOut: isPrevious ? (text(r?.moveOut) || range.moveOut) : undefined,
        payment: text(r?.payment),
        rentOrOwn: text(r?.rentOrOwn ?? r?.rentOwn),
        reason: text(r?.reason),
        landlord: text(r?.landlord),
        landlordPhone: text(r?.landlordPhone),
        landlordEmail: text(r?.landlordEmail),
    };
}

function job(j) {
    return {
        employer: text(j?.employer).trim(),
        position: text(j?.position).trim(),
        start: text(j?.start),
        supervisor: text(j?.supervisor),
        income: text(j?.income),
        type: text(j?.type),
    };
}

/**
 * The repeating sections. The website sent all of these empty on the first real
 * submission, so their item shape is unconfirmed - each field is read from our
 * name or the website's, whichever is present, rather than assumed.
 */
function occupant(o) {
    return {
        name: text(o?.name),
        relationship: text(o?.relationship),
        age: text(o?.age),
        // Never asked on the website form, so it arrives false. The form's own
        // instruction is that every adult 18+ submits their own application -
        // so an adult listed here with no application of their own is worth
        // Ellery noticing, not something to paper over with a guess.
        adultApplied: Boolean(o?.adultApplied ?? o?.applied),
    };
}

function vehicle(v) {
    return {
        // One "description" box on the website where ours asks for year, make
        // and model. Same question on the page, different name in the payload.
        ymm: text(v?.ymm ?? v?.yearMakeModel ?? v?.description),
        color: text(v?.color),
        plate: text(v?.plate),
        // Never asked on the website form. Left empty rather than assumed to be
        // the applicant - a vehicle registered to somebody else is precisely
        // what that box exists to catch.
        owner: text(v?.owner),
    };
}

function pet(p) {
    return {
        // "breed" on the website, "type" here. The website's answer is the more
        // useful one anyway - "Dog/Samoyed&ChowChow" rather than "Dog".
        type: text(p?.type ?? p?.breed),
        name: text(p?.name),
        weight: text(p?.weight),
        // Never asked on the website form.
        age: text(p?.age),
        fixed: Boolean(p?.fixed),
    };
}

function income(i) {
    return {
        source: text(i?.source),
        amount: text(i?.amount),
        recipient: text(i?.recipient),
    };
}

function reference(r) {
    return {
        name: text(r?.name),
        relationship: text(r?.relationship),
        phone: text(r?.phone),
    };
}

/**
 * Takes the whole body the website posts and returns an application in the
 * cockpit's shape. Returns null when there is nothing usable, so the caller can
 * refuse rather than store an empty record.
 */
export function websiteApplication(body) {
    const p = body?.payload;

    if (!p || typeof p !== "object") return null;

    const background = {};
    for (const [key, value] of Object.entries(p.background ?? {})) {
        background[key] = yesNo(value);
    }

    return {
        date: text(p.date),
        lot: text(p.lot ?? body?.lot),
        moveIn: text(p.moveIn),
        applyingFor: text(p.applyingFor ?? body?.applying_for),

        applicant: person(p.applicant),
        coApplicant: person(p.coApplicant),
        // Ours keeps the relationship on the application, not on the person -
        // it describes the pair, not either one of them.
        coRelationship: text(p.coApplicant?.relationship),

        occupants: (p.occupants ?? []).map(occupant),
        current: residence(p.current, false),
        previous: residence(p.previous, true),

        job: job(p.job1 ?? p.job),
        coJob: job(p.job2 ?? p.coJob),
        otherIncome: (p.otherIncome ?? []).map(income),

        vehicles: (p.vehicles ?? []).map(vehicle),
        pets: (p.pets ?? []).map(pet),

        ownHome: {
            ymm: text(p.ownHome?.ymm ?? p.ownHome?.yearMakeModel),
            size: text(p.ownHome?.size),
            serial: text(p.ownHome?.serial),
            lienholder: text(p.ownHome?.lienholder),
            titled: yesNo(p.ownHome?.titled),
            transport: text(p.ownHome?.transport),
            insurance: text(p.ownHome?.insurance),
        },

        background,
        backgroundNote: text(p.backgroundNote),

        references: (p.references ?? []).map(reference),
        emergency: reference(p.emergency),

        source: text(p.source),
        sourceOther: text(p.sourceOther),

        certify: Boolean(p.certify),
        signature: text(p.signature),
        coSignature: text(p.coSignature),

        // The website's payload, kept exactly as it arrived. The repeating
        // sections - pets, vehicles, occupants, other income - have never been
        // seen filled in, so the mapping above is educated guessing for those.
        // If it misses a field, nothing an applicant typed is lost: it is still
        // here, and the record can be corrected later from what they actually
        // sent. The PDF ignores it.
        websiteRaw: p,
        // Nobody typed a date on the website form. When it arrived is the only
        // honest answer, and it is ours to record.
        signDate: new Date().toISOString(),
    };
}