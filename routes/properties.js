// routes/properties.js
// Everything Able Housing Texas owns, and every door inside it.
//
// GET    /api/properties               the list, with each card's status worked out
// POST   /api/properties               add a property
// POST   /api/properties?unit=1        add a door to one
// PATCH  /api/properties?id=<id>       edit a property
// PATCH  /api/properties?unit=<id>     edit a door
// DELETE /api/properties?unit=<id>     remove a door typed in error
//
// The status pill is never stored. "Missing lease" is what it means for a door
// to be occupied with nothing signed, and storing that alongside the facts
// would give us two versions of it - one of which would go stale.
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "../lib/apiAuth.js";

const CAN_USE = ["ellery", "raj", "dane"];
const SALE = ["hold", "for_sale", "sold"];
const LEASE = ["none", "draft", "out_for_signature", "signed"];

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

function text(value, max) {
    const s = value === null || value === undefined ? "" : String(value).trim();
    return s ? s.slice(0, max) : null;
}

function cleanDate(value) {
    const raw = value ? String(value).slice(0, 10) : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function amount(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Read off the doors, never stored. */
function statusOf(property, units) {
    if (property.sale_status === "sold") return "sold";
    if (property.sale_status === "for_sale") return "for_sale";

    // Somebody living in a home nobody has signed for. This is the one that
    // is legal and lender exposure, so it outranks everything else.
    if (units.some((u) => u.occupied && u.lease_state !== "signed")) {
        return "missing_lease";
    }
    if (units.some((u) => u.lease_state === "draft" || u.lease_state === "out_for_signature")) {
        return "lease_pending";
    }
    if (units.some((u) => u.occupied)) return "occupied";

    return "vacant";
}

export default async function handler(req, res) {
    let caller;
    try {
        caller = await requireUser(req);
    } catch (err) {
        return res
            .status(err?.status || 401)
            .json({ error: err?.message || "Not authorised" });
    }

    const { profile } = caller;

    if (!CAN_USE.includes(profile.cockpit)) {
        return res.status(403).json({ error: "Not your screen" });
    }

    if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST, PATCH, DELETE");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const supabase = getClient();

        /* ---- the list ---- */
        if (req.method === "GET") {
            const [propsRes, unitsRes] = await Promise.all([
                supabase.from("properties").select("*").order("name"),
                supabase
                    .from("property_units")
                    .select("*")
                    .order("label"),
            ]);

            if (propsRes.error) throw propsRes.error;
            if (unitsRes.error) throw unitsRes.error;

            const byProperty = new Map();
            for (const u of unitsRes.data ?? []) {
                const list = byProperty.get(u.property_id) ?? [];
                list.push(u);
                byProperty.set(u.property_id, list);
            }

            const properties = (propsRes.data ?? []).map((p) => {
                const units = byProperty.get(p.id) ?? [];
                return { ...p, units, status: statusOf(p, units) };
            });

            // Every figure is a door count, so the four read against each
            // other. Mixing doors and buildings in one row of tiles is how
            // somebody reads "2" as two buildings.
            const allUnits = unitsRes.data ?? [];

            return res.status(200).json({
                properties,
                counts: {
                    doors: allUnits.length,
                    occupied: allUnits.filter((u) => u.occupied).length,
                    lease_pending: allUnits.filter(
                        (u) =>
                            u.lease_state === "draft" ||
                            u.lease_state === "out_for_signature",
                    ).length,
                    missing_lease: allUnits.filter(
                        (u) => u.occupied && u.lease_state !== "signed",
                    ).length,
                },
            });
        }

        /* ---- add a door ---- */
        if (req.method === "POST" && req.query?.unit) {
            const propertyId = String(req.body?.property_id || "");
            if (!propertyId) {
                return res.status(400).json({ error: "Which property?" });
            }

            const label = text(req.body?.label, 80);
            if (!label) {
                return res.status(400).json({ error: "Name the door" });
            }

            const { error } = await supabase.from("property_units").insert({
                property_id: propertyId,
                label,
            });

            if (error) throw error;

            return res.status(201).json({ ok: true, message: "Door added." });
        }

        /* ---- add a property ---- */
        if (req.method === "POST") {
            const name = text(req.body?.name, 160);
            if (!name) return res.status(400).json({ error: "Name it" });

            const { data: created, error } = await supabase
                .from("properties")
                .insert({
                    portfolio: req.body?.portfolio === "htm" ? "htm" : "ahtx",
                    name,
                    address: text(req.body?.address, 200),
                    city: text(req.body?.city, 80),
                    state: text(req.body?.state, 40),
                    market_note: text(req.body?.market_note, 200),
                    owner_name: text(req.body?.owner_name, 80),
                    drive_url: text(req.body?.drive_url, 500),
                })
                .select("id")
                .maybeSingle();

            if (error) throw error;

            return res
                .status(201)
                .json({ ok: true, id: created?.id ?? null, message: "Added." });
        }

        /* ---- remove a door ---- */
        if (req.method === "DELETE") {
            const unitId = String(req.query?.unit || "");
            if (!unitId) return res.status(400).json({ error: "Which door?" });

            const { error } = await supabase
                .from("property_units")
                .delete()
                .eq("id", unitId);

            if (error) throw error;

            return res.status(200).json({ ok: true, message: "Removed." });
        }

        /* ---- edit a door ---- */
        if (req.query?.unit) {
            const unitId = String(req.query.unit);
            const patch = { updated_at: new Date().toISOString() };

            if (req.body?.label !== undefined) {
                const label = text(req.body.label, 80);
                if (!label) return res.status(400).json({ error: "Name the door" });
                patch.label = label;
            }
            if (req.body?.occupied !== undefined) {
                patch.occupied = Boolean(req.body.occupied);
            }
            if (req.body?.tenant_name !== undefined) {
                patch.tenant_name = text(req.body.tenant_name, 160);
            }
            if (req.body?.lease_state !== undefined) {
                const state = String(req.body.lease_state);
                if (!LEASE.includes(state)) {
                    return res.status(400).json({ error: "That is not a lease state" });
                }
                patch.lease_state = state;
            }
            for (const key of ["lease_version", "rent_note"]) {
                if (req.body?.[key] !== undefined) patch[key] = text(req.body[key], 160);
            }
            if (req.body?.lease_url !== undefined) {
                patch.lease_url = text(req.body.lease_url, 500);
            }
            if (req.body?.notes !== undefined) {
                patch.notes = text(req.body.notes, 2000);
            }
            for (const key of ["move_in_on", "rent_starts_on"]) {
                if (req.body?.[key] !== undefined) patch[key] = cleanDate(req.body[key]);
            }
            if (req.body?.rent_amount !== undefined) {
                patch.rent_amount = amount(req.body.rent_amount);
            }
            if (req.body?.applicant_id !== undefined) {
                patch.applicant_id = req.body.applicant_id
                    ? String(req.body.applicant_id)
                    : null;
            }

            // A door cannot be occupied by nobody. The same rule the rent roll
            // uses, for the same reason - a tenancy with no name cannot be
            // chased, and cannot be told apart from an empty home.
            if (patch.occupied === true) {
                const incoming = patch.tenant_name;
                if (incoming === null || incoming === undefined) {
                    const { data: existing } = await supabase
                        .from("property_units")
                        .select("tenant_name")
                        .eq("id", unitId)
                        .maybeSingle();

                    if (!existing?.tenant_name) {
                        return res.status(400).json({
                            error: "Who lives there? A door cannot be occupied by nobody.",
                        });
                    }
                }
            }

            const { error } = await supabase
                .from("property_units")
                .update(patch)
                .eq("id", unitId);

            if (error) throw error;

            return res.status(200).json({ ok: true, message: "Saved." });
        }

        /* ---- edit a property ---- */
        const id = String(req.query?.id || "");
        if (!id) return res.status(400).json({ error: "Which property?" });

        const patch = { updated_at: new Date().toISOString() };

        for (const key of ["name", "address", "city", "state", "market_note", "owner_name"]) {
            if (req.body?.[key] !== undefined) patch[key] = text(req.body[key], 200);
        }
        if (req.body?.drive_url !== undefined) {
            patch.drive_url = text(req.body.drive_url, 500);
        }
        for (const key of ["appraisal_note", "payoff_note", "notes"]) {
            if (req.body?.[key] !== undefined) patch[key] = text(req.body[key], 2000);
        }
        if (req.body?.appraisal_on_file !== undefined) {
            patch.appraisal_on_file = Boolean(req.body.appraisal_on_file);
        }
        if (req.body?.details_confirmed !== undefined) {
            patch.details_confirmed = Boolean(req.body.details_confirmed);
        }
        if (req.body?.sale_status !== undefined) {
            const status = String(req.body.sale_status);
            if (!SALE.includes(status)) {
                return res.status(400).json({ error: "That is not a sale status" });
            }
            patch.sale_status = status;
        }

        const { error } = await supabase
            .from("properties")
            .update(patch)
            .eq("id", id);

        if (error) throw error;

        return res.status(200).json({ ok: true, message: "Saved." });
    } catch (err) {
        console.error("properties failed:", err);
        return res
            .status(500)
            .json({ error: "Could not load or save the properties" });
    }
}