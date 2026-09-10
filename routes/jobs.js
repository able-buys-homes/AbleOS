// routes/jobs.js
// Work orders at Hometown Meadows.
//
// GET   /api/jobs                  the board, plus the lots for the picker
// GET   /api/jobs?photo=<path>     a short-lived link to one photo
// POST  /api/jobs?photo=1          a signed URL to upload a photo to
// POST  /api/jobs                  open a job
// PATCH /api/jobs?id=<id>          save the close-out, or finish the job
//
// The photos live in the same private bucket as the collections evidence and
// are only ever reached through a link minted per request. A repair photo
// shows the inside of someone's home.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { requireUser } from "../lib/apiAuth.js";

const PROPERTY = "Hometown Meadows MHP";
const CAN_USE = ["zo", "raj", "dane"];
const BUCKET = "collections-photos";

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

function money(value) {
    return Math.round(Number(value ?? 0) * 100) / 100;
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

    if (!["GET", "POST", "PATCH"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST, PATCH");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const supabase = getClient();

        /* ---- one photo, as a link that expires ---- */
        if (req.method === "GET" && req.query?.photo) {
            const path = String(req.query.photo);

            // Only ever inside the jobs folder. Without this, any stored path
            // in the bucket could be fetched by asking for it.
            if (
                !path.startsWith("htm/job_done/") &&
                !path.startsWith("htm/job_open/")
            ) {
                return res.status(400).json({ error: "Not a job photo" });
            }

            const { data, error } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(path, 3600);

            if (error) throw error;

            return res.status(200).json({ url: data.signedUrl });
        }

        /* ---- the board ---- */
        if (req.method === "GET") {
            const [jobsRes, lotsRes] = await Promise.all([
                supabase
                    .from("work_orders")
                    .select("*")
                    .order("opened_at", { ascending: true }),
                supabase
                    .from("lots")
                    .select("id, lot_number, tenant_name, home_status")
                    .eq("property", PROPERTY),
            ]);

            if (jobsRes.error) throw jobsRes.error;
            if (lotsRes.error) throw lotsRes.error;

            const lots = lotsRes.data ?? [];
            const byId = new Map(lots.map((l) => [l.id, l]));

            const jobs = (jobsRes.data ?? []).map((job) => {
                const lot = byId.get(job.lot_id) ?? null;
                return {
                    ...job,
                    lot_number: lot?.lot_number ?? null,
                    // Only when someone lives there. A name on an empty home
                    // makes a former resident look like the person who called.
                    tenant_name:
                        lot?.home_status === "occupied"
                            ? (lot?.tenant_name ?? null)
                            : null,
                };
            });

            // One call for every photo rather than one per job. These links
            // expire - nothing here is a permanent URL.
            const paths = jobs
                .flatMap((j) => [j.photo_path, j.opened_photo_path])
                .filter((p) => typeof p === "string" && p.length > 0);

            if (paths.length > 0) {
                const { data: signedList } = await supabase.storage
                    .from(BUCKET)
                    .createSignedUrls(paths, 3600);

                const urlByPath = new Map(
                    (signedList ?? []).map((s) => [s.path, s.signedUrl]),
                );

                for (const j of jobs) {
                    j.photo_url = j.photo_path
                        ? (urlByPath.get(j.photo_path) ?? null)
                        : null;
                    j.opened_photo_url = j.opened_photo_path
                        ? (urlByPath.get(j.opened_photo_path) ?? null)
                        : null;
                }
            }

            return res.status(200).json({ jobs, lots });
        }

        /* ---- a signed URL to upload a photo to ---- */
        if (req.method === "POST" && req.query?.photo) {
            const ext = String(req.body?.ext || "jpg")
                .replace(/[^a-z0-9]/gi, "")
                .slice(0, 5);

            // "open" is the photo of the problem, "done" is the photo of the
            // finished work. Both sit in the same private bucket and are only
            // ever reached through a link minted per request.
            const folder =
                String(req.body?.kind) === "open" ? "job_open" : "job_done";

            const path = `htm/${folder}/${randomUUID()}.${ext || "jpg"}`;

            const { data: signed, error } = await supabase.storage
                .from(BUCKET)
                .createSignedUploadUrl(path, { expiresIn: 3600 });

            if (error) throw error;

            return res.status(200).json({ path, signedUrl: signed.signedUrl });
        }

        /* ---- open a job ---- */
        if (req.method === "POST") {
            // The form asks "what's wrong?" as a paragraph, because that is
            // how somebody says it standing at a door. The card needs
            // something short, so the first line becomes the title and the
            // whole thing is kept as the note. Nothing the resident said is
            // thrown away to make a heading fit.
            const said = String(req.body?.title ?? req.body?.note ?? "").trim();

            if (said.length < 3) {
                return res.status(400).json({ error: "Say what is wrong" });
            }

            const firstLine = said.split("\n")[0].trim();
            const title =
                firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine;

            // A job has to hang off a real lot, so it can be found again by
            // walking to it.
            let lotId = req.body?.lot_id ? String(req.body.lot_id) : "";

            if (!lotId && req.body?.lot_number != null) {
                const { data: lot, error } = await supabase
                    .from("lots")
                    .select("id")
                    .eq("property", PROPERTY)
                    .eq("lot_number", String(req.body.lot_number))
                    .maybeSingle();

                if (error) throw error;
                if (!lot) return res.status(404).json({ error: "No such lot" });
                lotId = lot.id;
            }

            if (!lotId) return res.status(400).json({ error: "Which lot?" });

            const category = String(req.body?.category || "other");
            const priority = String(req.body?.priority || "routine");

            const { data: created, error: insertError } = await supabase
                .from("work_orders")
                .insert({
                    lot_id: lotId,
                    title,
                    note: said.slice(0, 2000),
                    occupant_name: req.body?.occupant_name
                        ? String(req.body.occupant_name).trim().slice(0, 120)
                        : null,
                    opened_photo_path: req.body?.opened_photo_path
                        ? String(req.body.opened_photo_path)
                        : null,
                    category,
                    priority,
                    status: "new",
                    opened_by: profile.cockpit,
                })
                .select("id")
                .maybeSingle();

            if (insertError) throw insertError;

            // Every job gets a notification, not only the emergencies. A
            // system that speaks up only when something is on fire teaches
            // Raj that silence means nothing is happening - and the routine
            // job nobody mentioned is the one that turns into a complaint.
            //
            // The link goes to /raj, not Zo's board. Raj cannot open that
            // route, and a notification that leads to a locked screen is
            // worse than one with no link at all.
            const { data: openedLot } = await supabase
                .from("lots")
                .select("lot_number")
                .eq("id", lotId)
                .maybeSingle();

            await supabase.from("notifications").insert({
                recipient: "raj",
                type: priority === "emergency" ? "job_emergency" : "job_opened",
                title:
                    priority === "emergency"
                        ? `Emergency — Lot ${openedLot?.lot_number ?? "?"}`
                        : `New job — Lot ${openedLot?.lot_number ?? "?"}`,
                body: `${profile.cockpit} opened "${title}" as ${priority}. Nobody is assigned to it yet.`,
                // The id in the link is what opens the right job when Raj taps
                // the notification, instead of dropping him on the cockpit to
                // go and find it himself.
                link: `/raj?job=${created?.id ?? ""}`,
            });

            return res.status(201).json({
                ok: true,
                id: created?.id ?? null,
                message: "Job opened.",
            });
        }

        /* ---- save the close-out, or finish it ---- */
        const jobId = String(req.query?.id || "");
        if (!jobId) return res.status(400).json({ error: "Which job?" });

        const { data: job, error: jobError } = await supabase
            .from("work_orders")
            .select("id, lot_id, status, fix, photo_path")
            .eq("id", jobId)
            .maybeSingle();

        if (jobError) throw jobError;
        if (!job) return res.status(404).json({ error: "No such job" });

        if (job.status === "completed") {
            return res.status(409).json({
                error: "That job is already finished. Open a new one if something else needs doing.",
            });
        }

        const patch = { updated_at: new Date().toISOString() };

        if (req.body?.fix !== undefined) {
            patch.fix = req.body.fix ? String(req.body.fix).slice(0, 2000) : null;
        }
        if (req.body?.parts_cost !== undefined) {
            patch.parts_cost =
                req.body.parts_cost === null ? null : money(req.body.parts_cost);
        }
        if (req.body?.hours !== undefined) {
            patch.hours = req.body.hours === null ? null : Number(req.body.hours);
        }
        if (req.body?.receipt_number !== undefined) {
            patch.receipt_number = req.body.receipt_number
                ? String(req.body.receipt_number).trim().slice(0, 80)
                : null;
        }
        if (req.body?.photo_path !== undefined) {
            patch.photo_path = req.body.photo_path
                ? String(req.body.photo_path)
                : null;
        }
        if (req.body?.assigned_to !== undefined) {
            patch.assigned_to = req.body.assigned_to
                ? String(req.body.assigned_to).slice(0, 120)
                : null;
        }

        // Moving a job between states. "completed" is deliberately not in this
        // list - it goes through the branch below, which insists on the proof.
        if (req.body?.status !== undefined) {
            const next = String(req.body.status);
            const allowed = [
                "new",
                "assigned",
                "in_progress",
                "waiting_parts",
                "cancelled",
            ];

            if (!allowed.includes(next)) {
                return res
                    .status(400)
                    .json({ error: "That is not a job status" });
            }

            patch.status = next;
        }

        if (req.body?.complete) {
            const fix = patch.fix ?? job.fix;
            const photo = patch.photo_path ?? job.photo_path;

            // The database refuses this too. Saying it here means Zo gets a
            // sentence instead of a constraint violation.
            if (!fix) {
                return res
                    .status(400)
                    .json({ error: "Say what you fixed — a sentence is enough." });
            }
            if (!photo) {
                return res.status(400).json({
                    error: "Add a photo of the finished work before marking it done.",
                });
            }

            patch.status = "completed";
            patch.completed_at = new Date().toISOString();
            patch.completed_by = profile.cockpit;
        } else if (job.status === "new" && patch.status === undefined) {
            // Somebody has started writing it up, so it is no longer
            // untouched - unless they said explicitly what it is now.
            patch.status = "in_progress";
        }

        const { error: updateError } = await supabase
            .from("work_orders")
            .update(patch)
            .eq("id", jobId);

        if (updateError) throw updateError;

        // Told, not left to be discovered. Finished and stuck are both things
        // Raj wants to hear without opening a screen - one is a bill coming,
        // the other is a resident still waiting.
        if (patch.status === "completed" || patch.status === "waiting_parts") {
            const { data: patchedLot } = await supabase
                .from("lots")
                .select("lot_number")
                .eq("id", job.lot_id)
                .maybeSingle();

            const lotLabel = patchedLot?.lot_number ?? "?";

            await supabase.from("notifications").insert({
                recipient: "raj",
                type:
                    patch.status === "completed"
                        ? "job_completed"
                        : "job_waiting_parts",
                title:
                    patch.status === "completed"
                        ? `Job finished — Lot ${lotLabel}`
                        : `Job stuck — Lot ${lotLabel}`,
                body:
                    patch.status === "completed"
                        ? `${profile.cockpit} closed it out with a photo${
                              patch.parts_cost ? ` · parts $${patch.parts_cost}` : ""
                          }.`
                        : `${profile.cockpit} is waiting on parts. The resident is still waiting too.`,
                link: `/raj?job=${jobId}`,
            });
        }

        return res.status(200).json({
            ok: true,
            message: req.body?.complete ? "Job closed out." : "Saved.",
        });
    } catch (err) {
        console.error("jobs failed:", err);
        return res.status(500).json({ error: "Could not load or save the jobs" });
    }
}