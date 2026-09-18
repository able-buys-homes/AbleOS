// routes/mcp.js
// A read-only MCP server so Raj's Claude can ask the cockpit what is actually
// happening, instead of relying on a document it has to remember.
//
// POST /api/mcp?key=...   JSON-RPC 2.0, Streamable HTTP transport
//
// Read-only, and deliberately aggregate. Every tool answers with counts,
// totals and operational facts - never a resident's name, an applicant's
// employment or anyone's contact details. If a person needs a specific
// file they open the cockpit, which is what it is for. That keeps this URL
// from being a way to read tenant records.

import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

const PROTOCOL_VERSION = "2025-06-18";

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

/** Constant-time, so the token can't be guessed a character at a time. */
function tokenMatches(supplied) {
    const expected = process.env.MCP_TOKEN;
    if (!expected) return true;
    if (typeof supplied !== "string" || !supplied) return false;

    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
}

function suppliedToken(req) {
    const header = req.headers?.authorization ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const query = req.query?.key;
    return bearer || (Array.isArray(query) ? query[0] : query) || "";
}

/* ---------------- small helpers ---------------- */

/** Group rows by a field and count. Nulls become "unset" rather than vanish. */
function countBy(rows, field) {
    const out = {};
    for (const row of rows ?? []) {
        const key = row?.[field] ?? "unset";
        out[key] = (out[key] ?? 0) + 1;
    }
    return out;
}

function sum(rows, field) {
    return Math.round(
        (rows ?? []).reduce((total, row) => total + Number(row?.[field] ?? 0), 0) * 100,
    ) / 100;
}

/** Today in the park's own timezone. Dates here are local business dates. */
function todayISO() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function currentPeriod() {
    return todayISO().slice(0, 7);
}

async function all(supabase, table, columns, build) {
    let query = supabase.from(table).select(columns).limit(2000);
    if (build) query = build(query);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

/* ---------------- the tools ---------------- */

const TOOLS = [
    {
        name: "verification_status",
        description:
            "The ten rows of the Able OS verification work order, with their current state and the evidence that closes each one. Use when asked whether something has been verified, or what still needs proving.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "open_work",
        description:
            "Everything still outstanding on Able OS - open or blocked - with who or what each item waits on. Use when asked what is left to do, or what is holding something up.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "project_log",
        description:
            "The dated record of work on Able OS: what was built, fixed, decided and discovered, with the evidence for each. Use when asked what has been done, or what happened on a given day.",
        inputSchema: {
            type: "object",
            properties: {
                kind: { type: "string", description: "verification, build, fix, finding or decision." },
                status: { type: "string", description: "done, open, blocked or superseded." },
                since: { type: "string", description: "Only entries on or after this date, YYYY-MM-DD." },
                limit: { type: "number", description: "How many entries. Defaults to 50." },
            },
        },
    },
    {
        name: "system_snapshot",
        description:
            "Headline live figures across the whole cockpit - deals, lots, applicants, and when a deal last arrived. Use when asked how the system is doing right now.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "task_status",
        description:
            "Tasks across the cockpit, by person and by state, including how many are in progress, overdue, and awaiting approval. Covers both the daily task board and assigned tasks. Use when asked what anyone is working on or how many tasks are in progress.",
        inputSchema: {
            type: "object",
            properties: {
                cockpit: {
                    type: "string",
                    description:
                        "Limit to one person's cockpit, for example dane, raj, zo or ellery.",
                },
            },
        },
    },
    {
        name: "work_order_status",
        description:
            "Work orders at Hometown Meadows - open, by status, by priority, emergencies, and jobs waiting on parts including parts that are overdue. Use when asked about maintenance, repairs or jobs.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "rent_status",
        description:
            "Rent for the current month: charged, collected, outstanding, how many residents are past their grace period, and how many lots still have no confirmed rent. Use when asked about collections or who is late.",
        inputSchema: {
            type: "object",
            properties: {
                period: { type: "string", description: "A month as YYYY-MM. Defaults to the current one." },
            },
        },
    },
    {
        name: "occupancy_status",
        description:
            "The lot map at Hometown Meadows by status - occupied, ready to rent, moving out, needing repair, in full rehab - plus scheduled inspections. Use when asked about occupancy or the state of the park.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "applicant_status",
        description:
            "Applicants by stage and outcome, by portfolio, with how many are waiting on a decision. Counts only, no applicant details. Use when asked about the leasing pipeline.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "documents_and_dates",
        description:
            "Transaction documents by stage, and critical dates that are overdue, due this week, or coming. Use when asked what Ellery is waiting on or what deadlines are approaching.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "deal_status",
        description:
            "The deal pipeline by stage, by where deals came from, how many await Raj's review, and how many carry the numbers needed for a buy-box verdict. Use when asked about deal flow.",
        inputSchema: { type: "object", properties: {} },
    },
];

async function verificationStatus(supabase) {
    const data = await all(
        supabase,
        "project_log",
        "ref, title, detail, evidence, status, owner, blocked_on",
        (q) => q.eq("kind", "verification").order("ref", { ascending: true }),
    );

    const rows = data.map((r) => ({
        row: r.ref,
        item: r.title,
        state: r.status,
        detail: r.detail,
        evidence: r.evidence ?? "Not yet evidenced",
        waiting_on: r.blocked_on ?? null,
    }));

    const closed = rows.filter((r) => r.state === "done").length;

    return { summary: `${closed} of ${rows.length} rows closed with evidence.`, rows };
}

async function openWork(supabase) {
    const data = await all(
        supabase,
        "project_log",
        "kind, ref, title, detail, status, owner, blocked_on",
        (q) => q.in("status", ["open", "blocked"]).order("occurred_on", { ascending: false }),
    );

    return {
        count: data.length,
        items: data.map((r) => ({
            reference: r.ref,
            kind: r.kind,
            item: r.title,
            detail: r.detail,
            state: r.status,
            owner: r.owner,
            waiting_on: r.blocked_on,
        })),
    };
}

async function projectLog(supabase, args) {
    const data = await all(
        supabase,
        "project_log",
        "kind, ref, title, detail, evidence, status, owner, blocked_on, occurred_on",
        (q) => {
            let query = q.order("occurred_on", { ascending: false });
            if (typeof args?.kind === "string") query = query.eq("kind", args.kind);
            if (typeof args?.status === "string") query = query.eq("status", args.status);
            if (typeof args?.since === "string") query = query.gte("occurred_on", args.since);
            return query.limit(Number.isFinite(args?.limit) ? Math.min(args.limit, 200) : 50);
        },
    );

    return { count: data.length, entries: data };
}

async function taskStatus(supabase, args) {
    const cockpit = typeof args?.cockpit === "string" ? args.cockpit.toLowerCase() : null;
    const today = todayISO();

    // The daily board. Deleted rows are gone from the person's view, so they
    // are gone from the count too.
    const daily = await all(
        supabase,
        "daily_tasks",
        "owner_cockpit, title, priority, state, due_on, completed_on",
        (q) => {
            let query = q.is("deleted_at", null);
            if (cockpit) query = query.eq("owner_cockpit", cockpit);
            return query;
        },
    );

    // Assigned tasks, which carry an approval step the daily board does not.
    const assigned = await all(
        supabase,
        "tasks",
        "assigned_to, task_type, title, priority, status, due_date, completed_at, approved_at",
        (q) => (cockpit ? q.eq("assigned_to", cockpit) : q),
    );

    const openDaily = daily.filter((t) => t.state !== "done" && !t.completed_on);
    const openAssigned = assigned.filter((t) => t.status !== "done" && !t.completed_at);

    return {
        scope: cockpit ?? "everyone",
        daily_board: {
            total: daily.length,
            by_state: countBy(daily, "state"),
            by_person: countBy(daily, "owner_cockpit"),
            still_open: openDaily.length,
            overdue: openDaily.filter((t) => t.due_on && t.due_on < today).length,
        },
        assigned_tasks: {
            total: assigned.length,
            by_status: countBy(assigned, "status"),
            by_person: countBy(assigned, "assigned_to"),
            by_type: countBy(assigned, "task_type"),
            still_open: openAssigned.length,
            overdue: openAssigned.filter((t) => t.due_date && t.due_date < today).length,
            done_but_not_approved: assigned.filter((t) => t.completed_at && !t.approved_at).length,
        },
        as_of: new Date().toISOString(),
    };
}

async function workOrderStatus(supabase) {
    const today = todayISO();

    const orders = await all(
        supabase,
        "work_orders",
        "id, lot_id, title, category, priority, status, opened_at, completed_at",
    );

    const open = orders.filter((o) => o.status !== "completed" && !o.completed_at);

    const parts = await all(
        supabase,
        "work_order_parts",
        "work_order_id, name, ordered_on, expected_on, arrived_on",
    );

    const outstanding = parts.filter((p) => !p.arrived_on);

    return {
        total: orders.length,
        open: open.length,
        by_status: countBy(orders, "status"),
        by_priority: countBy(open, "priority"),
        by_category: countBy(open, "category"),
        emergencies_open: open.filter((o) => o.priority === "emergency").length,
        jobs_waiting_on_parts: new Set(outstanding.map((p) => p.work_order_id)).size,
        parts_outstanding: outstanding.length,
        parts_overdue: outstanding.filter((p) => p.expected_on && p.expected_on < today).length,
        as_of: new Date().toISOString(),
    };
}

async function rentStatus(supabase, args) {
    const period = typeof args?.period === "string" ? args.period : currentPeriod();
    const today = todayISO();

    // period is a date column, so match a range rather than the YYYY-MM
    // string. Works whichever day of the month the charge is stamped with.
    const monthStart = `${period}-01`;
    const nextMonth = new Date(`${monthStart}T00:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const monthEnd = nextMonth.toISOString().slice(0, 10);

    const charges = await all(
        supabase,
        "rent_ledger",
        "lot_id, period, charge_type, amount, due_date, verified_at",
        (q) => q.gte("period", monthStart).lt("period", monthEnd),
    );

    // Payments are stamped with a moment, not a period, so bound them by month
    // at both ends - otherwise next month's payments count towards this one.
    const payments = await all(
        supabase,
        "payments",
        "lot_id, amount, received_at, reverses_id",
        (q) => q.gte("received_at", monthStart).lt("received_at", monthEnd),
    );

    const live = payments.filter((p) => !p.reverses_id);

    const lots = await all(
        supabase,
        "lots",
        "lot_number, occupied, contract_rent, rent_placeholder, rent_due_day",
    );

    const occupied = lots.filter((l) => l.occupied);

    // Five days of grace, then it is late. Measured per resident, from their
    // own due date, not a date shared across the park.
    const lateLots = new Set(
        charges
            .filter((c) => {
                if (!c.due_date) return false;
                const last = new Date(`${c.due_date}T00:00:00Z`);
                last.setUTCDate(last.getUTCDate() + 5);
                return today > last.toISOString().slice(0, 10);
            })
            .map((c) => c.lot_id),
    );

    const charged = sum(charges, "amount");
    const collected = sum(live, "amount");

    return {
        period,
        charged,
        collected,
        outstanding: Math.round((charged - collected) * 100) / 100,
        charges_raised: charges.length,
        payments_received: live.length,
        by_charge_type: countBy(charges, "charge_type"),
        occupied_lots: occupied.length,
        lots_without_confirmed_rent: occupied.filter((l) => l.rent_placeholder).length,
        lots_past_grace: lateLots.size,
        as_of: new Date().toISOString(),
    };
}

async function occupancyStatus(supabase) {
    const today = todayISO();

    const lots = await all(
        supabase,
        "lots",
        "lot_number, occupied, home_status, rent_placeholder, next_inspection_at",
    );

    const rentable = lots.filter((l) =>
        ["occupied", "ready", "moving_out", "needs_repair", "full_rehab"].includes(l.home_status),
    );

    const occupied = lots.filter((l) => l.home_status === "occupied").length;

    return {
        property: "Hometown Meadows MHP",
        lots_total: lots.length,
        doors: rentable.length,
        occupied,
        occupancy_percent: rentable.length
            ? Math.round((occupied / rentable.length) * 100)
            : null,
        by_status: countBy(lots, "home_status"),
        inspections_scheduled: lots.filter((l) => l.next_inspection_at).length,
        inspections_overdue: lots.filter(
            (l) => l.next_inspection_at && l.next_inspection_at < today,
        ).length,
        as_of: new Date().toISOString(),
    };
}

async function applicantStatus(supabase) {
    const applicants = await all(
        supabase,
        "applicants",
        "portfolio, came_in_by, fee_paid_on, screening_ordered_on, screening_result, decision, arrived_at",
    );

    return {
        total: applicants.length,
        by_portfolio: countBy(applicants, "portfolio"),
        by_decision: countBy(applicants, "decision"),
        by_screening_result: countBy(applicants, "screening_result"),
        by_source: countBy(applicants, "came_in_by"),
        fee_unpaid: applicants.filter((a) => !a.fee_paid_on).length,
        screening_not_ordered: applicants.filter((a) => !a.screening_ordered_on).length,
        awaiting_decision: applicants.filter((a) => !a.decision).length,
        as_of: new Date().toISOString(),
    };
}

async function documentsAndDates(supabase) {
    const today = todayISO();

    const inAWeek = new Date(`${today}T00:00:00Z`);
    inAWeek.setUTCDate(inAWeek.getUTCDate() + 7);
    const weekEnd = inAWeek.toISOString().slice(0, 10);

    const docs = await all(supabase, "documents", "doc_type, stage, due_on");

    const dates = await all(
        supabase,
        "critical_dates",
        "label, due_on, kind, portfolio, completed_at",
        (q) => q.is("completed_at", null),
    );

    return {
        documents: {
            total: docs.length,
            by_stage: countBy(docs, "stage"),
            by_type: countBy(docs, "doc_type"),
            overdue: docs.filter(
                (d) => d.due_on && d.due_on < today && !["executed", "filed", "cancelled"].includes(d.stage),
            ).length,
        },
        critical_dates: {
            outstanding: dates.length,
            overdue: dates.filter((d) => d.due_on < today).length,
            due_this_week: dates.filter((d) => d.due_on >= today && d.due_on <= weekEnd).length,
            by_portfolio: countBy(dates, "portfolio"),
            next_three: dates
                .filter((d) => d.due_on >= today)
                .sort((a, b) => a.due_on.localeCompare(b.due_on))
                .slice(0, 3)
                .map((d) => ({ what: d.label, due_on: d.due_on, book: d.portfolio })),
        },
        as_of: new Date().toISOString(),
    };
}

async function dealStatus(supabase) {
    const deals = await all(
        supabase,
        "pipeline_deals",
        "stage, origin, bird_dog, confirmed, dismissed_at, purchase_price, monthly_cash_flow, dscr",
    );

    const live = deals.filter((d) => !d.dismissed_at);

    // A verdict needs both numbers. Anything short of that reads "not
    // measured" on the board, and it should read that way here too.
    const measurable = live.filter((d) => d.dscr !== null && d.monthly_cash_flow !== null);

    return {
        total: deals.length,
        live: live.length,
        filed_or_dismissed: deals.length - live.length,
        awaiting_review: live.filter((d) => !d.confirmed).length,
        by_stage: countBy(live, "stage"),
        by_origin: countBy(live, "origin"),
        by_bird_dog: countBy(live, "bird_dog"),
        can_be_measured_against_the_buy_box: measurable.length,
        not_measurable: live.length - measurable.length,
        as_of: new Date().toISOString(),
    };
}

async function systemSnapshot(supabase) {
    const counted = async (table, build) => {
        let q = supabase.from(table).select("id", { count: "exact", head: true });
        if (build) q = build(q);
        const { count, error } = await q;
        if (error) throw new Error(error.message);
        return count ?? 0;
    };

    const [deals, awaitingReview, lotsTotal, lotsOccupied, applicants, gated, openJobs] =
        await Promise.all([
            counted("pipeline_deals"),
            counted("pipeline_deals", (q) => q.eq("confirmed", false).is("dismissed_at", null)),
            counted("lots"),
            counted("lots", (q) => q.eq("occupied", true)),
            counted("applicants"),
            counted("unqualified_intake"),
            counted("work_orders", (q) => q.neq("status", "completed")),
        ]);

    const { data: lastIntake } = await supabase
        .from("intake_messages")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    return {
        deals_in_pipeline: deals,
        deals_awaiting_review: awaitingReview,
        lots_total: lotsTotal,
        lots_occupied: lotsOccupied,
        applicants: applicants,
        open_work_orders: openJobs,
        emails_filed_by_the_gate: gated,
        last_deal_email_at: lastIntake?.created_at ?? null,
        as_of: new Date().toISOString(),
    };
}

async function runTool(name, args) {
    const supabase = getClient();

    if (name === "verification_status") return verificationStatus(supabase);
    if (name === "open_work") return openWork(supabase);
    if (name === "project_log") return projectLog(supabase, args);
    if (name === "system_snapshot") return systemSnapshot(supabase);
    if (name === "task_status") return taskStatus(supabase, args);
    if (name === "work_order_status") return workOrderStatus(supabase);
    if (name === "rent_status") return rentStatus(supabase, args);
    if (name === "occupancy_status") return occupancyStatus(supabase);
    if (name === "applicant_status") return applicantStatus(supabase);
    if (name === "documents_and_dates") return documentsAndDates(supabase);
    if (name === "deal_status") return dealStatus(supabase);

    throw new Error(`Unknown tool: ${name}`);
}

/* ---------------- JSON-RPC ---------------- */

function result(id, value) {
    return { jsonrpc: "2.0", id, result: value };
}

function failure(id, code, message) {
    return { jsonrpc: "2.0", id, error: { code, message } };
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "content-type, authorization, mcp-protocol-version",
    );
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    if (!tokenMatches(suppliedToken(req))) {
        return res.status(401).json({ error: "Not authorised" });
    }

    const message = req.body ?? {};
    const { id, method, params } = message;

    const isNotification = id === undefined || id === null;

    try {
        if (method === "initialize") {
            return res.status(200).json(
                result(id, {
                    protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: { name: "able-os", version: "2.0.0" },
                    instructions:
                        "Able OS is the operations cockpit for Able Buys Homes and Hometown Meadows MHP. Ask task_status for what anyone is working on, work_order_status for maintenance, rent_status for collections, occupancy_status for the park, applicant_status for leasing, documents_and_dates for deadlines, deal_status for deal flow, and verification_status, open_work and project_log for the state of the build. Everything is read-only and reported as counts and totals - to see an individual resident, applicant or deal, open the cockpit.",
                }),
            );
        }

        if (method === "notifications/initialized" || isNotification) {
            return res.status(202).end();
        }

        if (method === "ping") return res.status(200).json(result(id, {}));

        if (method === "tools/list") return res.status(200).json(result(id, { tools: TOOLS }));

        if (method === "tools/call") {
            const name = params?.name;
            const args = params?.arguments ?? {};

            try {
                const value = await runTool(name, args);

                return res.status(200).json(
                    result(id, {
                        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
                        structuredContent: value,
                        isError: false,
                    }),
                );
            } catch (toolError) {
                // Reported inside the result, not as a protocol error - the
                // model should see it went wrong and say so.
                return res.status(200).json(
                    result(id, {
                        content: [{ type: "text", text: `That failed: ${toolError.message}` }],
                        isError: true,
                    }),
                );
            }
        }

        if (method === "resources/list") return res.status(200).json(result(id, { resources: [] }));
        if (method === "prompts/list") return res.status(200).json(result(id, { prompts: [] }));

        return res.status(200).json(failure(id, -32601, `Unknown method: ${method}`));
    } catch (err) {
        console.error("mcp error:", err);
        return res.status(200).json(failure(id ?? null, -32603, "Internal error"));
    }
}