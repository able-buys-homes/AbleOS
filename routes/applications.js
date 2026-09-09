// routes/applications.js
// Residency applications.
//
// GET   /api/applications          the list, without the identifying details
// GET   /api/applications?id=<id>  one application, in full
// POST  /api/applications          submit one, then hand a copy to n8n
// PATCH /api/applications?drive=1  n8n reporting back where it filed the PDF
//
// The submit used to go straight from the browser to the database. It moved
// here because the n8n webhook needs a shared secret, and a secret in a
// browser is not a secret.
//
// Order matters: the application is saved first and the copy attempted after.
// Somebody filled in thirteen sections standing in a driveway - that must
// never be lost to a webhook being down.
import { createClient } from "@supabase/supabase-js";
import { applicationPdf } from "../lib/applicationPdf.js";
import { requireUser } from "../lib/apiAuth.js";

const CAN_TAKE = ["zo", "raj", "dane"];
const CAN_SEE_ALL = ["raj", "dane"];

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

/** 2026-09-09_Dowey-Jeffery_Lot-14_Application.pdf */
function pdfName(row) {
    const date = String(row?.created_at ?? "").slice(0, 10) || "undated";

    const parts = String(row?.applicant_name ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    // Surname first, so the folder sorts and searches by the name somebody
    // would actually go looking for.
    const last = parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? "");
    const first = parts.length > 1 ? parts.slice(0, -1).join("-") : "";

    const who =
        [last, first].filter(Boolean).join("-").replace(/[^A-Za-z0-9-]/g, "") ||
        "Unnamed";

    const lot = row?.lot_number
        ? `Lot-${String(row.lot_number).replace(/[^A-Za-z0-9]/g, "-")}`
        : "No-lot";

    return `${date}_${who}_${lot}_Application.pdf`;
}

/** Columns safe for a list. `data` holds the SSN and licence number. */
const LIST_COLUMNS =
    "id, created_at, status, applicant_name, applicant_phone, lot_number, applying_for, taken_by, drive_url, drive_error, drive_synced_at";

export default async function handler(req, res) {
    /* ---- n8n reporting back. Not a signed-in user. ---- */
    if (req.method === "PATCH" && req.query?.drive) {
        const secret = process.env.N8N_SHARED_SECRET;

        if (!secret) {
            return res.status(500).json({ error: "N8N_SHARED_SECRET is not set" });
        }
        if (req.headers.authorization !== `Bearer ${secret}`) {
            return res.status(401).json({ error: "Not authorised" });
        }

        const id = String(req.body?.id || "");
        if (!id) return res.status(400).json({ error: "Which application?" });

        try {
            const supabase = getClient();

            // Only ever the Drive columns. This endpoint is reachable with a
            // shared secret rather than a person's session, so it must not be
            // able to touch a status, a name, or the application itself.
            const { error } = await supabase
                .from("htm_applications")
                .update({
                    drive_file_id: req.body?.file_id
                        ? String(req.body.file_id)
                        : null,
                    drive_url: req.body?.url ? String(req.body.url) : null,
                    drive_error: req.body?.error
                        ? String(req.body.error).slice(0, 500)
                        : null,
                    drive_synced_at: new Date().toISOString(),
                })
                .eq("id", id);

            if (error) throw error;

            return res.status(200).json({ ok: true });
        } catch (err) {
            console.error("applications drive callback failed:", err);
            return res.status(500).json({ error: "Could not record the file" });
        }
    }

    /* ---- the application as a PDF ---- */
    //
    // Reachable two ways: by a signed-in person for the button in the
    // cockpit, and by n8n with the shared secret so it can file the copy.
    // The visibility rule is applied for people and skipped for n8n, which is
    // filing the document it was just told about.
    if (req.method === "GET" && req.query?.pdf) {
        const id = String(req.query.pdf);
        const hookSecret = process.env.N8N_SHARED_SECRET;
        const viaSecret =
            Boolean(hookSecret) &&
            req.headers.authorization === `Bearer ${hookSecret}`;

        let restrictTo = null;

        if (!viaSecret) {
            let pdfCaller;
            try {
                pdfCaller = await requireUser(req);
            } catch (err) {
                return res
                    .status(err?.status || 401)
                    .json({ error: err?.message || "Not authorised" });
            }

            if (!CAN_TAKE.includes(pdfCaller.profile.cockpit)) {
                return res.status(403).json({ error: "Not your screen" });
            }

            if (!CAN_SEE_ALL.includes(pdfCaller.profile.cockpit)) {
                restrictTo = pdfCaller.user.id;
            }
        }

        try {
            const supabase = getClient();

            let query = supabase
                .from("htm_applications")
                .select(
                    "id, data, taken_by, applicant_name, lot_number, created_at",
                )
                .eq("id", id);

            if (restrictTo) query = query.eq("taken_by", restrictTo);

            const { data: row, error } = await query.maybeSingle();

            if (error) throw error;
            if (!row) return res.status(404).json({ error: "Not found" });

            const { data: taker } = await supabase
                .from("profiles")
                .select("cockpit")
                .eq("id", row.taken_by)
                .maybeSingle();

            const pdf = await applicationPdf(row.data, {
                id: row.id,
                takenBy: taker?.cockpit ?? "unknown",
            });

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader(
                "Content-Disposition",
                `inline; filename="${pdfName(row)}"`,
            );

            return res.status(200).send(pdf);
        } catch (err) {
            console.error("application pdf failed:", err);
            return res.status(500).json({ error: "Could not build the PDF" });
        }
    }

    let caller;
    try {
        caller = await requireUser(req);
    } catch (err) {
        return res
            .status(err?.status || 401)
            .json({ error: err?.message || "Not authorised" });
    }

    const { profile, user } = caller;

    if (!CAN_TAKE.includes(profile.cockpit)) {
        return res.status(403).json({ error: "Not your screen" });
    }

    if (!["GET", "POST"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const seesAll = CAN_SEE_ALL.includes(profile.cockpit);

    try {
        const supabase = getClient();

        /* ---- one application, in full ---- */
        if (req.method === "GET" && req.query?.id) {
            let query = supabase
                .from("htm_applications")
                .select("*")
                .eq("id", String(req.query.id));

            // The same rule the table's own policy uses. Written twice on
            // purpose: this route holds the service key, so the policy is not
            // protecting it.
            if (!seesAll) query = query.eq("taken_by", user.id);

            const { data, error } = await query.maybeSingle();

            if (error) throw error;
            if (!data) return res.status(404).json({ error: "Not found" });

            return res.status(200).json({ application: data });
        }

        /* ---- the list ---- */
        if (req.method === "GET") {
            let query = supabase
                .from("htm_applications")
                .select(LIST_COLUMNS)
                .order("created_at", { ascending: false })
                .limit(200);

            if (!seesAll) query = query.eq("taken_by", user.id);

            const { data, error } = await query;
            if (error) throw error;

            return res.status(200).json({ applications: data ?? [] });
        }

        /* ---- submit ---- */
        const app = req.body?.data;

        if (!app || typeof app !== "object") {
            return res.status(400).json({ error: "No application was sent" });
        }

        const name = String(app?.applicant?.name || "").trim();
        const phone = String(app?.applicant?.phone || "").trim();

        if (!name || !phone) {
            return res
                .status(400)
                .json({ error: "Applicant name and phone are required" });
        }

        const { data: created, error: insertError } = await supabase
            .from("htm_applications")
            .insert({
                applicant_name: name.slice(0, 200),
                applicant_phone: phone.slice(0, 40),
                lot_number: app?.lot ? String(app.lot).slice(0, 40) : null,
                applying_for: app?.applyingFor || null,
                data: app,
                taken_by: user.id,
            })
            .select("id, created_at")
            .single();

        if (insertError) throw insertError;

        await supabase.from("notifications").insert({
            recipient: "raj",
            type: "application_received",
            title: `Application from ${name}`,
            body: `${profile.cockpit} took it${app?.lot ? ` for Lot ${app.lot}` : ""
                }. It is in the cockpit and a PDF is being filed to the Shared Drive.`,
            link: "/raj",
        });

        // The copy. Everything below this point can fail without the
        // application being lost - which is the whole reason it is below.
        const hook = process.env.N8N_APPLICATION_WEBHOOK;
        const secret = process.env.N8N_SHARED_SECRET;

        if (!hook || !secret) {
            await supabase
                .from("htm_applications")
                .update({
                    drive_error:
                        "No n8n webhook is configured, so no PDF was filed.",
                    drive_synced_at: new Date().toISOString(),
                })
                .eq("id", created.id);

            return res.status(201).json({
                ok: true,
                id: created.id,
                message:
                    "Application saved. No Shared Drive copy was filed — the automation is not configured yet.",
            });
        }

        try {
            const hookRes = await fetch(hook, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${secret}`,
                },
                body: JSON.stringify({
                    id: created.id,
                    taken_by: profile.cockpit,
                    // n8n gets the name and the URL so it does no templating
                    // and holds no applicant details of its own.
                    file_name: pdfName({
                        created_at: created.created_at,
                        applicant_name: name,
                        lot_number: app?.lot ?? null,
                    }),
                    pdf_url: `${
                        process.env.APP_BASE_URL ??
                        `https://${process.env.VERCEL_URL}`
                    }/api/applications?pdf=${created.id}`,
                    application: app,
                }),
            });

            if (!hookRes.ok) {
                throw new Error(`n8n answered ${hookRes.status}`);
            }
        } catch (err) {
            console.error("application webhook failed:", err);

            await supabase
                .from("htm_applications")
                .update({
                    drive_error:
                        err instanceof Error
                            ? err.message.slice(0, 500)
                            : "The Shared Drive copy failed.",
                    drive_synced_at: new Date().toISOString(),
                })
                .eq("id", created.id);

            return res.status(201).json({
                ok: true,
                id: created.id,
                message:
                    "Application saved. The Shared Drive copy did not go through — it is recorded on the application so nobody goes looking for a file that is not there.",
            });
        }

        return res.status(201).json({
            ok: true,
            id: created.id,
            message: "Application saved and sent to the Shared Drive.",
        });
    } catch (err) {
        console.error("applications failed:", err);
        return res.status(500).json({ error: "Could not save the application" });
    }
}