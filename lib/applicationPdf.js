// lib/applicationPdf.js
// A residency application, as a PDF.
//
// Built here rather than in n8n on purpose. This is the document a family's
// details end up in, and it belongs somewhere it can be read, reviewed and
// changed deliberately - not inside a workflow node.
//
// It prints the SSN last four and the licence number, because that was the
// decision for the Shared Drive copy. The banner near the top says so, so
// that whoever opens the file knows what they are holding before they forward
// it to anybody.
import PDFDocument from "pdfkit";

const QUESTIONS = [
    ["evicted", "Ever evicted or asked to leave a residence?"],
    ["brokeLease", "Ever broken a lease or been sued for unpaid rent?"],
    ["bankruptcy", "Ever filed for bankruptcy?"],
    ["felony", "Ever convicted of a felony?"],
    [
        "courtOrder",
        "Subject to a court order or registration requirement affecting where you may live?",
    ],
    ["smoke", "Smoke or vape?"],
];

const APPLYING_FOR = {
    community_home: "A community-owned home",
    lot_only: "Lot only - they own the home",
    rent_to_own: "Rent to own",
};

const JOB_TYPE = {
    full: "Full-time",
    part: "Part-time",
    self: "Self-employed",
};

export function applicationPdf(app, meta = {}) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "LETTER", margin: 50 });
        const chunks = [];

        doc.on("data", (c) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const show = (v) =>
            v === null || v === undefined || String(v).trim() === ""
                ? "—"
                : String(v);

        function h1(text) {
            doc.moveDown(0.7);
            doc
                .font("Helvetica-Bold")
                .fontSize(12)
                .fillColor("#1E3A8A")
                .text(text.toUpperCase(), { characterSpacing: 0.4 });
            doc.moveDown(0.25);
        }

        function line(label, value) {
            doc
                .font("Helvetica-Bold")
                .fontSize(9.5)
                .fillColor("#6C7484")
                .text(`${label}   `, { continued: true });
            doc
                .font("Helvetica")
                .fontSize(10.5)
                .fillColor("#1B2231")
                .text(show(value));
        }

        function para(text) {
            doc
                .font("Helvetica")
                .fontSize(10)
                .fillColor("#4A5464")
                .text(text, { width: 500 });
        }

        function yesNo(v) {
            if (v === true) return "Yes";
            if (v === false) return "No";
            return "Not answered";
        }

        function person(p) {
            line("Full legal name", p?.name);
            line("Date of birth", p?.dob);
            line("SSN / ITIN last 4", p?.ssnLast4);
            line("Phone", p?.phone);
            line("Email", p?.email);
            line("Licence / ID", p?.idNumber);
        }

        function residence(r, past = false) {
            line("Address", r?.address);
            line("Moved in", r?.moveIn);
            // Only a former address has an end date. Printing an empty one on
            // the current address would read as missing rather than absent.
            if (past) line("Moved out", r?.moveOut);
            line("Monthly payment", r?.payment);
            line("Rent or own", r?.rentOrOwn);
            line("Reason for leaving", r?.reason);
            line("Landlord", r?.landlord);
            line("Landlord phone", r?.landlordPhone);
            line("Landlord email", r?.landlordEmail);
        }

        function job(j, label) {
            h1(label);
            line("Employer", j?.employer);
            line("Position", j?.position);
            line("Started", j?.start);
            line("Supervisor", j?.supervisor);
            line("Gross monthly income", j?.income);
            line("Type", JOB_TYPE[j?.type] ?? j?.type);
        }

        /* ---------- header ---------- */
        doc
            .font("Helvetica-Bold")
            .fontSize(19)
            .fillColor("#1B2231")
            .text("Application for Residency");
        doc
            .font("Helvetica")
            .fontSize(11)
            .fillColor("#6C7484")
            .text("Hometown Meadows MHP · 121 Smith Lane, Nashville AR");

        doc.moveDown(0.6);
        doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor("#B3261E")
            .text(
                "This file contains identifying details, including the last four of a social security number and a driver's licence number. Do not forward it outside the company.",
                { width: 500 },
            );

        doc.moveDown(0.4);
        line("Application id", meta.id);
        line("Taken by", meta.takenBy);
        line("Filed", new Date().toLocaleString());

        /* ---------- what they want ---------- */
        h1("What they are applying for");
        line("Applying for", APPLYING_FOR[app?.applyingFor] ?? app?.applyingFor);
        line("Lot", app?.lot);
        line("Date of application", app?.date);
        line("Hoped move-in", app?.moveIn);

        /* ---------- people ---------- */
        h1("Applicant");
        person(app?.applicant);

        if (app?.coApplicant?.name) {
            h1("Co-applicant");
            line("Relationship to applicant", app?.coRelationship);
            person(app?.coApplicant);
        }

        if (Array.isArray(app?.occupants) && app.occupants.length) {
            h1("Everyone else who would live there");
            app.occupants.forEach((o, i) => {
                line(
                    `Occupant ${i + 1}`,
                    `${show(o?.name)} · ${show(o?.relationship)} · age ${show(
                        o?.age,
                    )}${o?.adultApplied ? " · applied as an adult" : ""}`,
                );
            });
        }

        /* ---------- where they live ---------- */
        h1("Where they live now");
        residence(app?.current);

        if (app?.previous?.address) {
            h1("Where they lived before");
            residence(app?.previous, true);
        }

        /* ---------- money ---------- */
        job(app?.job, "Employment");

        if (app?.coJob?.employer) {
            job(app?.coJob, "Co-applicant employment");
        }

        if (Array.isArray(app?.otherIncome) && app.otherIncome.length) {
            h1("Other income");
            app.otherIncome.forEach((inc, i) => {
                line(
                    `Source ${i + 1}`,
                    `${show(inc?.source)} · ${show(inc?.amount)} · to ${show(
                        inc?.recipient,
                    )}`,
                );
            });
        }

        /* ---------- vehicles, pets, their own home ---------- */
        if (Array.isArray(app?.vehicles) && app.vehicles.length) {
            h1("Vehicles");
            app.vehicles.forEach((v, i) => {
                line(
                    `Vehicle ${i + 1}`,
                    `${show(v?.ymm)} · ${show(v?.color)} · plate ${show(
                        v?.plate,
                    )} · registered to ${show(v?.owner)}`,
                );
            });
        }

        if (Array.isArray(app?.pets) && app.pets.length) {
            h1("Pets");
            app.pets.forEach((p, i) => {
                line(
                    `Pet ${i + 1}`,
                    `${show(p?.type)} · ${show(p?.name)} · ${show(
                        p?.weight,
                    )} lb · ${show(p?.age)} · ${p?.fixed ? "fixed" : "not fixed"}`,
                );
            });
        }

        if (app?.ownHome?.ymm || app?.ownHome?.serial) {
            h1("The home they own");
            line("Year, make, model", app?.ownHome?.ymm);
            line("Size", app?.ownHome?.size);
            line("Serial number", app?.ownHome?.serial);
            line("Lienholder", app?.ownHome?.lienholder);
            line(
                "Titled in their name",
                app?.ownHome?.titled === null
                    ? "Not answered"
                    : yesNo(app?.ownHome?.titled),
            );
            line("Transport", app?.ownHome?.transport);
            line("Insurance", app?.ownHome?.insurance);
        }

        /* ---------- background ---------- */
        h1("Background");
        QUESTIONS.forEach(([key, question]) => {
            line(question, yesNo(app?.background?.[key]));
        });
        if (app?.backgroundNote) {
            doc.moveDown(0.3);
            para(`Explanation given: ${app.backgroundNote}`);
        }

        /* ---------- references ---------- */
        if (Array.isArray(app?.references) && app.references.length) {
            h1("References");
            app.references.forEach((r, i) => {
                if (!r?.name && !r?.phone) return;
                line(
                    `Reference ${i + 1}`,
                    `${show(r?.name)} · ${show(r?.relationship)} · ${show(r?.phone)}`,
                );
            });
        }

        h1("Emergency contact");
        line(
            "Contact",
            `${show(app?.emergency?.name)} · ${show(
                app?.emergency?.relationship,
            )} · ${show(app?.emergency?.phone)}`,
        );

        /* ---------- how they heard ---------- */
        h1("How they heard about us");
        line("Source", app?.source);
        if (app?.sourceOther) line("Detail", app.sourceOther);

        /* ---------- the part that binds them ---------- */
        h1("Authorisation and signature");
        para(
            "The applicant certified that everything in this application is true and complete, and authorised Hometown Meadows and its agents to obtain a consumer credit report, criminal background and eviction history, and to verify employment, income and rental history.",
        );
        doc.moveDown(0.3);
        line("Certified", yesNo(app?.certify));
        line("Applicant signature (typed)", app?.signature);
        line("Co-applicant signature (typed)", app?.coSignature);
        line("Signed", app?.signDate);

        doc.moveDown(1);
        doc
            .font("Helvetica")
            .fontSize(8.5)
            .fillColor("#8A929E")
            .text(
                "Filed from Able OS. The application of record is the one in the cockpit; this is a copy.",
                { width: 500 },
            );

        doc.end();
    });
}