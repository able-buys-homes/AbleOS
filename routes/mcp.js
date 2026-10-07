// routes/mcp.js
// A read-only MCP server so Raj's Claude can answer anything about Able OS -
// what it is, what each cockpit holds, what the numbers are today, and how
// much moved this week - without anyone sending it a document first.
//
// POST /api/mcp?key=...   JSON-RPC 2.0, Streamable HTTP transport
//
// Read-only, and deliberately aggregate. Every tool answers with counts,
// totals and operational facts - never a resident's name, an applicant's
// employment or anyone's contact details. To see an individual record you
// open the cockpit, which is what it is for. That keeps this URL from
// becoming a way to read tenant files.

import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

const PROTOCOL_VERSION = "2025-06-18";

// Rehab gates still live in Notion, not in the cockpit's own database. When
// Notion is removed this constant and notionRehabGates() go with it, and the
// gate counts read from wherever the stages land instead.
const REHAB_DATABASE_ID = "39f97b1c96b680dd9a77d8d83da4793c";

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

/**
 * Constant-time, so a token can't be guessed a character at a time.
 *
 * MCP_TOKEN holds a comma-separated list, one per person, so a link can be
 * withdrawn from one holder without breaking it for everyone else.
 */
/**
 * Malli (Raj's agent) has its own key and a short list of tools: counts,
 * statuses and dates by lot number - nothing with a name, phone or email.
 * Malli can text and call people, so it gets the least it needs.
 * Remove MCP_TOKEN_MALLI in Vercel to cut it off without touching anyone else.
 */
/**
 * Keys with a short tool list, one variable per holder so each can be
 * withdrawn on its own (Raj's offboarding: revoke the MCP token). A key that
 * is not set in Vercel does nothing. Tools that do not exist yet are skipped.
 * Raj's and Alice's keys (MCP_TOKEN, MCP_TOKEN_ALICE) keep every tool.
 */
const KEY_SCOPES = [
    // Raj's Malli agent: lot-level counts and dates, no names.
    { env: "MCP_TOKEN_MALLI", holder: "malli", tools: ["occupancy_status", "rent_status", "lot_roll", "work_order_list", "dates_list"] },
    // Rex, AHTX only: vacant homes, access notes, never codes.
    { env: "MCP_TOKEN_REX", holder: "rex", tools: ["rex_units"] },
    // Ellery: her desk, dates and an applicant queue with no names.
    { env: "MCP_TOKEN_ELLERY", holder: "ellery", tools: ["ellery_desk", "dates_list", "applicant_queue"] },
    // Manita: read-only owner/ops view. QuickBooks status only, never the connection.
    { env: "MCP_TOKEN_MANITA", holder: "manita", tools: ["occupancy_status", "lot_roll", "rent_status", "work_order_list", "documents_and_dates", "dates_list", "qbo_sync_status"] },
];

function scopeFor(supplied) {
    if (typeof supplied !== "string" || !supplied) return null;
    const a = Buffer.from(supplied);
    for (const k of KEY_SCOPES) {
        const expected = String(process.env[k.env] ?? "").trim();
        if (!expected) continue;
        const b = Buffer.from(expected);
        if (a.length === b.length && timingSafeEqual(a, b)) return k;
    }
    return null;
}

function tokenMatches(supplied) {
    // One variable per holder, so one can be withdrawn without touching the others.
    const raw = [process.env.MCP_TOKEN, process.env.MCP_TOKEN_ALICE]
        .filter(Boolean)
        .join(",");
    if (!raw) return true;
    if (typeof supplied !== "string" || !supplied) return false;

    const a = Buffer.from(supplied);

    return raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .some((expected) => {
            const b = Buffer.from(expected);
            if (a.length !== b.length) return false;
            return timingSafeEqual(a, b);
        });
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
    return (
        Math.round(
            (rows ?? []).reduce((total, row) => total + Number(row?.[field] ?? 0), 0) * 100,
        ) / 100
    );
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

function daysAgoISO(days) {
    const d = new Date(`${todayISO()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
}

async function all(supabase, table, columns, build) {
    let query = supabase.from(table).select(columns).limit(5000);
    if (build) query = build(query);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

/* ---------------- what the system is ---------------- */

// Written down rather than inferred. A model guessing at architecture from
// table names gets it confidently wrong; this is the actual shape.
const SYSTEM_MAP = {
    what_it_is:
        "Able OS is the operations cockpit for two books of business: Hometown Meadows MHP, a 35-door manufactured home community trading as Kubera Homes, and Able Buys Homes deal flow. Each person signs in to their own cockpit and sees only their own work.",
    live_at: "https://cockpit.ablebuyshomes.com",
    built_with:
        "React, TypeScript, Vite and Tailwind, installable as a PWA so Zo runs it from his phone. Supabase for data with row level security keyed on the signed-in person's cockpit. One Vercel serverless function dispatches every API route, so new endpoints cost nothing.",
    cockpits: {
        zo: {
            role: "Site manager at Hometown Meadows",
            lands_on: "Map",
            tabs: {
                Map: "The lot map, and the first thing he sees. Every lot with its live status. Status is changed here rather than in a settings screen. Moving a lot from Ready to rent to Occupied asks for the resident's name and their monthly rent on the spot and will not proceed without them - that is the moment rent enters the system. Inspections are scheduled here, and a lot that already has one cannot be scheduled again.",
                Rehab: "Phase by phase progress with photo capture. Photos go to the shared drive automatically. Completing a phase requests Raj's approval and notifies him.",
                Jobs: "Work orders. The form changes with the status - choosing Waiting on parts swaps in parts fields, and a job can wait on several parts, each in its own collapsible card. Who lives there is read only and says No one lives there when the lot is vacant. Every date field is a picker.",
                Rent: "Who's paid, Take payment, Plans. Anniversary billing - rent is due on each resident's own move-in day, not a date shared across the park. Five days of grace, then a $75 late fee. A lot with no confirmed rent says so rather than showing a balance built on a placeholder. Fill it in here captures a paper application in person and generates a PDF.",
            },
        },
        raj: {
            role: "CEO and the single approver",
            tabs: {
                Cockpit:
                    "Tiles for gates awaiting him, gates approved, purchase requests, Dane's progress, unit inspections, collections to verify, open work orders, and stages ready to post.",
                Pipeline:
                    "Deals from three routes - the website form, the underwriting inbox, and manual entry. A review card shows exactly what the seller sent. Every deal carries a buy-box verdict: DSCR 1.25 or better and $2,500 a month net, in Florida, Arkansas or Texas. Without the numbers it reads Not measured rather than guessing.",
                Documents: "Shared drive folders per deal.",
                Switcher: "He can open anyone's cockpit and lands where they land.",
            },
        },
        ellery: {
            role: "Transaction coordination",
            tabs: {
                Applicants:
                    "Every application, from the website and from Zo's in-person capture. Stage and bucket are derived from the data rather than stored, so the screen cannot disagree with reality. Nothing an applicant typed is discarded - the original payload is kept whole beside the mapped fields.",
                "AHTX Properties": "Property records with status derived from occupancy.",
                "Documents & Dates":
                    "Documents move requested, draft, internal review, out for signature, executed, filed. Critical dates - option periods, response deadlines, rent commencement, lender notice windows - soonest first.",
            },
        },
        dane: { role: "Integration lead", tabs: { Tasks: "Task list with a filter by date." } },
    },
    websites: {
        "ablebuyshomes.com":
            "Marketing site and the deal submission form. The form writes straight into Raj's review queue and emails underwriting. It is public, so the defences matter more than the feature: a honeypot field, hard length caps, a rate limit on a hashed IP so nobody is tracked, at least one document required, and it can only ever create an unconfirmed draft - a stranger cannot put a deal on Raj's board. Rebuilt 18 Sep 2026 to split street, city and state apart, add units and gross monthly rent with a vacancy tick, and require a numeric asking price of at least $1,000.",
        "hometownmeadows.com":
            "The community site. Its rental application posts straight into Ellery's Applicants tab, creates the applicant record, notifies Ellery and Raj, mints a reference, emails the office and the applicant, and generates a PDF. It also carries a callback request form.",
    },
    automations: {
        "Underwriting inbox to Able OS v2":
            "Gmail trigger on underwriting@, through an intake gate, into the cockpit. Claude reads each email and decides whether it is a deal, pulling out address, price, cash flow and DSCR. The email is untrusted input - passed as data, never as instructions. Duplicates stop at the door. A later email about the same thread or property merges instead of creating a second deal. A thread that starts as chatter and later carries financials comes back out of the bin. If Claude is unreachable the email is stored unfilled, so an outage never costs a deal.",
        "The intake gate":
            "A screen in front of the whole thing, running in shadow mode - it files a reason rather than acting. Reasons: self_notification, out_of_box_geo, list_blast, link_only, asset_class, incomplete, qualified. It strips quoted chains and signature blocks before counting addresses, because a signature containing a street address makes a real broker email look like a mass blast.",
        "Website deal submission to underwriting email":
            "Turns a form submission into an email to underwriting, with signed links to the attached documents that expire after seven days.",
        "HTM Application Submission": "The community application, into Ellery's cockpit.",
        "Intake heartbeat":
            "Daily at 09:00, asks the cockpit whether any deal has arrived in 24 hours and raises an alert if not, skipping weekends. A broken Gmail credential and a quiet week look identical from outside; this is what tells them apart.",
        "n8n execution failed (to Dane)":
            "Set as the error workflow on the intake, payments and announcements, so a workflow cannot fail silently. Alerts go to the CTO.",
    },
    scheduled: {
        "rent-charges": "12:00 UTC daily. Raises each resident's rent charge on their own due date.",
        "late-fees": "13:00 UTC daily. Adds $75 once a resident is past their own five-day grace.",
    },
    integrations: [
        "Supabase - data and storage",
        "Anthropic claude-haiku-4-5 - reads each inbound email",
        "Google Drive via a service account - photos and deal documents",
        "Gmail via n8n - inbound intake and outbound notices",
        "Web Push - notifications to phones",
        "Notion - rehab stages only, and being removed",
    ],
    principles: [
        "The screen never claims something the data cannot support. Rent not confirmed instead of a balance built on a placeholder. Not measured instead of a buy-box verdict with no numbers behind it. Machine-created fees left unverified.",
        "Derive, don't store. Applicant stage, applicant bucket, property status, parts overdue and the buy-box verdict are all computed, so the display and the truth cannot drift apart.",
    ],
    known_gaps: [
        "Rehab gates live in Notion, which is being removed.",
        "Roughly 200 inbound deal emails in ten days land at president@hometownmeadows.com, which has no intake on it at all. The gate only screens underwriting@, which receives almost nothing.",
        "Eleven occupied lots still carry a placeholder rent rather than a confirmed figure.",
    ],
};

/* ---------------- the tools ---------------- */

const TOOLS = [
    {
        name: "system_map",
        description:
            "What Able OS actually is: every cockpit and what each tab does, both websites, the automations, the scheduled jobs, the integrations, the design principles and the known gaps. Use this first for any question about how the system works, what a feature does, or what exists.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "raj_desk",
        description:
            "Every tile on Raj's cockpit in one call: rehab gates awaiting his sign-off and gates approved, purchase requests awaiting a decision, Dane's progress, unit inspections, collections to verify and payment plans to approve, open work orders, and stages ready to post. Use for any question about Raj's cockpit.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "zo_desk",
        description:
            "Zo's cockpit: the lot map by status, open work orders and parts, rent for the month, and inspections. Use for any question about the community's day to day.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "ellery_desk",
        description:
            "Ellery's cockpit: applicants by stage, AHTX properties and their units, documents by stage and critical dates. Use for any question about leasing or transaction coordination.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "activity_report",
        description:
            "How much actually moved: today, over the last seven days, and over the last thirty - deals arriving, payments taken, work orders opened and closed, tasks finished, applicants, inspections and log entries. Use for any question about progress this day, week or month, or whether things are speeding up or slowing down.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "task_status",
        description:
            "Tasks across the cockpit, by person and by state, including how many are in progress, overdue, and finished but not yet approved. Covers both the daily board and assigned tasks.",
        inputSchema: {
            type: "object",
            properties: {
                cockpit: {
                    type: "string",
                    description: "Limit to one person: dane, raj, zo or ellery.",
                },
            },
        },
    },
    {
        name: "work_order_status",
        description:
            "Work orders at Hometown Meadows - open, by status, by priority, emergencies, and jobs waiting on parts including parts now overdue.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "rent_status",
        description:
            "Rent for a month: charged, collected, outstanding, how many residents are past their grace period, and how many lots have no confirmed rent.",
        inputSchema: {
            type: "object",
            properties: {
                period: { type: "string", description: "A month as YYYY-MM. Defaults to this one." },
            },
        },
    },
    {
        name: "occupancy_status",
        description:
            "The lot map at Hometown Meadows by status - occupied, ready to rent, moving out, needing repair, in full rehab - plus scheduled and overdue inspections.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "applicant_status",
        description:
            "Applicants by stage and outcome, by portfolio, with how many await a decision. Counts only, no applicant details.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "documents_and_dates",
        description:
            "Transaction documents by stage, and critical dates overdue, due this week, or coming.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "deal_status",
        description:
            "The deal pipeline by stage and by origin, how many await Raj's review, and how many carry the numbers needed for a buy-box verdict.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "recent_deals",
        description:
            "The most recent deals with their name, address, stage, asking price and where they came from. Property level only - the seller's name, phone and email are never returned. Use when asked which deals just arrived, or to find a deal by address.",
        inputSchema: {
            type: "object",
            properties: {
                limit: { type: "number", description: "How many. Defaults to 10, maximum 50." },
                search: { type: "string", description: "Match part of an address or deal name." },
                since: { type: "string", description: "Only deals created on or after YYYY-MM-DD." },
            },
        },
    },
    {
        name: "list_notes",
        description:
            "The documents kept in the project notes folder - plans, progress records, specifications and write-ups that Dane has uploaded. Use this to find out what written material exists before reading any of it.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "read_note",
        description:
            "Read one of the documents from the project notes folder, by its file name. Use after list_notes when a question needs the detail that only the written record holds - history before the log was kept, plans, or decisions and their reasoning.",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "The file name exactly as list_notes returned it.",
                },
            },
            required: ["name"],
        },
    },
    {
        name: "system_snapshot",
        description:
            "Headline live figures across the whole cockpit in one call - deals, lots, applicants, open jobs, and when a deal last arrived.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "verification_status",
        description:
            "The ten rows of the Able OS verification work order, with their current state and the evidence that closes each one.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "open_work",
        description:
            "Everything still outstanding on Able OS - open or blocked - with who or what each item waits on.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "project_log",
        description:
            "The dated record of work on Able OS: what was built, fixed, decided and discovered, with the evidence for each.",
        inputSchema: {
            type: "object",
            properties: {
                kind: { type: "string", description: "verification, build, fix, finding or decision." },
                status: { type: "string", description: "done, open, blocked or superseded." },
                since: { type: "string", description: "Entries on or after this date, YYYY-MM-DD." },
                limit: { type: "number", description: "How many entries. Defaults to 50." },
            },
        },
    },
    {
        name: "lot_roll",
        description:
            "Every lot at Hometown Meadows, one row each, by lot number: what the home is (occupied, vacant, ready, repair, rehab), the monthly rent, the due day, what the lot owes today, when it last paid, how many jobs are open and the next inspection. No resident names or contact details.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "work_order_list",
        description:
            "Every open work order, one row each: lot number, title, category, priority, status, days open and parts still awaited. Optionally include finished ones from the last N days. No resident names or contact details.",
        inputSchema: {
            type: "object",
            properties: {
                completed_days: { type: "number", description: "Also list jobs finished in the last N days. Defaults to 0." },
            },
        },
    },
    {
        name: "dates_list",
        description:
            "Every outstanding critical date, every open document and every scheduled home inspection, one row each, with what it is, when it is due, which book it belongs to and whether it is overdue. Inspections are by lot number only, no names. Soonest first.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "qbo_sync_status",
        description:
            "Whether QuickBooks is keeping up: when the last item synced, how many payments, rent invoices and application fees are still waiting to post since go-live, and any sync errors. Status only - never the QuickBooks connection or its keys.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "applicant_queue",
        description:
            "Every open rental applicant, one row each, by portfolio and lot: stage (received, fee paid, screening, decided), whether the fee is paid, and how many days they have waited. No names, contact details or screening results.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "rex_units",
        description:
            "AHTX vacant homes, one row per door: property, address, beds, baths, size, asking rent, how to get in, and whether the details are confirmed. Never a lockbox, gate or door code, and no resident names.",
        inputSchema: { type: "object", properties: {} },
    },
];

/* ---------------- implementations ---------------- */

async function qboSyncStatus(supabase) {
    const liveFrom = String(process.env.QBO_LIVE_FROM ?? "").slice(0, 10) || null;
    const since = liveFrom ?? "1970-01-01";
    const [paid, charges, fees, errored] = await Promise.all([
        all(supabase, "payments", "qbo_payment_id, qbo_synced_at, created_at", (q) => q.gte("created_at", since)),
        all(supabase, "rent_ledger", "qbo_txn_id, created_at", (q) => q.gte("created_at", since)),
        all(supabase, "applicants", "qbo_txn_id, fee_paid_on", (q) => q.not("fee_paid_on", "is", null).gte("fee_paid_on", since)),
        all(supabase, "payments", "qbo_error, created_at", (q) => q.not("qbo_error", "is", null)),
    ]);
    const lastSynced = paid.map((p) => p.qbo_synced_at).filter(Boolean).sort().pop() ?? null;
    return {
        live_since: liveFrom,
        last_payment_synced_at: lastSynced,
        waiting_to_post: {
            payments: paid.filter((p) => !p.qbo_payment_id).length,
            rent_invoices: charges.filter((c) => !c.qbo_txn_id).length,
            application_fees: fees.filter((a) => !a.qbo_txn_id).length,
        },
        posted_since_go_live: {
            payments: paid.filter((p) => p.qbo_payment_id).length,
            rent_invoices: charges.filter((c) => c.qbo_txn_id).length,
            application_fees: fees.filter((a) => a.qbo_txn_id).length,
        },
        errors: errored.map((e) => ({ at: e.created_at, error: String(e.qbo_error).slice(0, 200) })),
        note: "The sync runs hourly, so a few items waiting is normal. Errors are what need someone.",
    };
}

async function applicantQueue(supabase) {
    const today = todayISO();
    const [apps, lots] = await Promise.all([
        all(supabase, "applicants", "id, portfolio, lot_id, property_label, arrived_at, fee_paid_on, screening_ordered_on, decision, decision_on"),
        all(supabase, "lots", "id, lot_number"),
    ]);
    const lotNo = new Map(lots.map((l) => [l.id, l.lot_number]));
    const days = (d) => (d ? Math.max(0, Math.round((Date.parse(today) - Date.parse(String(d).slice(0, 10))) / 86400000)) : null);
    const rows = apps
        // Decided more than 30 days ago is history, not queue.
        .filter((a) => !a.decision || days(a.decision_on) == null || days(a.decision_on) <= 30)
        .map((a) => ({
            ref: String(a.id).slice(0, 8),
            portfolio: a.portfolio,
            lot: lotNo.get(a.lot_id) ?? a.property_label ?? null,
            stage: a.decision ? "decided" : a.screening_ordered_on ? "screening" : a.fee_paid_on ? "fee_paid" : "received",
            decision: a.decision ?? null,
            fee_paid: Boolean(a.fee_paid_on),
            days_waiting: days(a.arrived_at),
        }))
        .sort((x, y) => (y.days_waiting ?? 0) - (x.days_waiting ?? 0));
    const count = (st) => rows.filter((r) => r.stage === st).length;
    return {
        totals: { received: count("received"), fee_paid: count("fee_paid"), screening: count("screening"), decided_last_30_days: count("decided") },
        applicants: rows,
        as_of: today,
        note: "No names here. Open the cockpit to see who an applicant is.",
    };
}

async function rexUnits(supabase) {
    const units = await all(supabase, "rex_units_v", "property, address, city, state, label, beds, baths, sq_ft, rent_amount, access_note, details_confirmed, notes");
    return {
        count: units.length,
        vacant_homes: units,
        note: units.length
            ? "AHTX vacant doors only. Access notes never contain codes - ask the office for those."
            : "No AHTX vacant homes on file yet. They are added with the AHTX seed.",
    };
}


async function notionRehabGates() {
    const key = process.env.NOTION_API_KEY;
    if (!key) return null;

    const pages = [];
    let cursor;

    // Notion pages 100 at a time, so follow the cursor to the end rather than
    // reporting a count that quietly stops at the first page.
    do {
        const res = await fetch(
            `https://api.notion.com/v1/databases/${REHAB_DATABASE_ID}/query`,
            {
                method: "POST",
                headers: {
                    authorization: `Bearer ${key}`,
                    "Notion-Version": "2022-06-28",
                    "content-type": "application/json",
                },
                body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
                signal: AbortSignal.timeout(15000),
            },
        );

        if (!res.ok) throw new Error(`Notion returned ${res.status}`);

        const body = await res.json();
        pages.push(...(body.results ?? []));
        cursor = body.has_more ? body.next_cursor : undefined;
    } while (cursor);

    return pages.map((page) => {
        const p = page.properties ?? {};
        return {
            stage: p["Stage Name"]?.rich_text?.[0]?.plain_text || "",
            side: p["Side"]?.select?.name || "unset",
            work_done: p["Work Done"]?.checkbox === true,
            photo_uploaded: p["Photo Uploaded"]?.checkbox === true,
            raj_approved: p["Raj Approved"]?.checkbox === true,
            draw_released: p["Draw Released"]?.checkbox === true,
        };
    });
}

async function gatesOrReason() {
    try {
        const gates = await notionRehabGates();
        if (gates === null) {
            return { available: false, reason: "Notion is not configured" };
        }
        return {
            available: true,
            awaiting_raj: gates.filter((g) => g.photo_uploaded && !g.raj_approved).length,
            approved: gates.filter((g) => g.raj_approved).length,
            draws_released: gates.filter((g) => g.draw_released).length,
            total_stages: gates.length,
            by_side: countBy(gates, "side"),
        };
    } catch (err) {
        // Say so rather than report zero. A zero that means "could not ask" is
        // worse than no answer at all.
        return { available: false, reason: err.message };
    }
}

async function rajDesk(supabase) {
    const [orders, daily, inspections, charges, plans, jobs, queue, gates] = await Promise.all([
        all(supabase, "orders", "status, priority, estimated_cost, decided_at"),
        all(supabase, "daily_tasks", "state, completed_on", (q) =>
            q.is("deleted_at", null).eq("owner_cockpit", "dane"),
        ),
        all(supabase, "unit_inspections", "status, inspected_at", (q) => q.is("deleted_at", null)),
        all(supabase, "rent_ledger", "verified_at"),
        all(supabase, "payment_plans", "status, approved_at"),
        all(supabase, "work_orders", "status, priority, completed_at"),
        all(supabase, "social_queue", "status, reviewed_at, side, stage_name"),
        gatesOrReason(),
    ]);

    const openOrders = orders.filter((o) => !o.decided_at);
    const openJobs = jobs.filter((j) => j.status !== "completed" && !j.completed_at);

    return {
        gates,
        approval_requests: {
            awaiting_decision: openOrders.length,
            total: orders.length,
            by_status: countBy(orders, "status"),
            estimated_cost_awaiting: sum(openOrders, "estimated_cost"),
        },
        danes_progress: {
            finished: daily.filter((t) => t.state === "completed" || t.completed_on).length,
            in_progress: daily.filter((t) => t.state === "in_progress").length,
            by_state: countBy(daily, "state"),
        },
        unit_inspections: { total: inspections.length, by_status: countBy(inspections, "status") },
        collections: {
            balances_to_verify: charges.filter((c) => !c.verified_at).length,
            plans_awaiting_approval: plans.filter((p) => !p.approved_at).length,
            plans_total: plans.length,
        },
        open_work_orders: {
            open: openJobs.length,
            emergencies: openJobs.filter((j) => j.priority === "emergency").length,
        },
        ready_to_post: {
            awaiting_your_pick: queue.filter((q) => !q.reviewed_at).length,
            total: queue.length,
            by_status: countBy(queue, "status"),
        },
        as_of: new Date().toISOString(),
    };
}

async function occupancyStatus(supabase) {
    const today = todayISO();

    const lots = await all(
        supabase,
        "lots",
        "lot_number, occupied, home_status, rent_placeholder, next_inspection_at",
        (q) => q.is("archived_at", null),
    );

    const rentable = lots.filter((l) =>
        ["occupied", "vacant", "ready", "moving_out", "needs_repair", "full_rehab"].includes(l.home_status),
    );

    const occupied = lots.filter((l) => l.home_status === "occupied").length;

    return {
        property: "Hometown Meadows MHP",
        lots_total: lots.length,
        doors: rentable.length,
        occupied,
        occupancy_percent: rentable.length ? Math.round((occupied / rentable.length) * 100) : null,
        by_status: countBy(lots, "home_status"),
        lots_without_confirmed_rent: lots.filter((l) => l.occupied && l.rent_placeholder).length,
        inspections_scheduled: lots.filter((l) => l.next_inspection_at).length,
        inspections_overdue: lots.filter(
            (l) => l.next_inspection_at && l.next_inspection_at < today,
        ).length,
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

    // period is a date column, so match a range rather than the YYYY-MM string.
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

    // Payments carry a moment, not a period, so bound them at both ends -
    // otherwise next month's payments count towards this one.
    const payments = await all(
        supabase,
        "payments",
        "lot_id, amount, received_at, reverses_id",
        (q) => q.gte("received_at", monthStart).lt("received_at", monthEnd),
    );

    const live = payments.filter((p) => !p.reverses_id);

    const lots = await all(supabase, "lots", "lot_number, occupied, rent_placeholder");
    const occupied = lots.filter((l) => l.occupied);

    // Five days of grace, then it is late - measured from each resident's own
    // due date, not a date shared across the park.
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

async function zoDesk(supabase) {
    const [occupancy, jobs, rent, gates] = await Promise.all([
        occupancyStatus(supabase),
        workOrderStatus(supabase),
        rentStatus(supabase, {}),
        gatesOrReason(),
    ]);

    return { map: occupancy, jobs, rent, rehab_gates: gates, as_of: new Date().toISOString() };
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
                (d) =>
                    d.due_on &&
                    d.due_on < today &&
                    !["executed", "filed", "cancelled"].includes(d.stage),
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

async function elleryDesk(supabase) {
    const [applicants, docsDates, properties, units] = await Promise.all([
        applicantStatus(supabase),
        documentsAndDates(supabase),
        all(supabase, "properties", "portfolio, sale_status, appraisal_on_file, details_confirmed"),
        all(supabase, "property_units", "occupied, lease_state, rent_amount"),
    ]);

    return {
        applicants,
        properties: {
            total: properties.length,
            by_portfolio: countBy(properties, "portfolio"),
            by_sale_status: countBy(properties, "sale_status"),
            details_not_confirmed: properties.filter((p) => !p.details_confirmed).length,
            appraisal_missing: properties.filter((p) => !p.appraisal_on_file).length,
        },
        units: {
            total: units.length,
            occupied: units.filter((u) => u.occupied).length,
            by_lease_state: countBy(units, "lease_state"),
            rent_not_set: units.filter((u) => u.occupied && !u.rent_amount).length,
        },
        documents_and_dates: docsDates,
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
        // Without this, a duplicate row reads as a broken filter rather than
        // a filter that has deliberately not been switched on yet.
        intake_gate: {
            mode: "shadow",
            what_that_means:
                "The gate reads every inbound email and files a reason for the ones it would reject, but nothing is cut. Both branches still create a deal. A website submission therefore produces two rows - one from the form and one from its own notification email - and that is expected, not a fault.",
            when_it_changes:
                "The false branch is cut once three days of real shadow traffic have been read and there is written sign-off. Until then duplicates will keep appearing.",
        },
        as_of: new Date().toISOString(),
    };
}

async function taskStatus(supabase, args) {
    const cockpit = typeof args?.cockpit === "string" ? args.cockpit.toLowerCase() : null;
    const today = todayISO();

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

    const assigned = await all(
        supabase,
        "tasks",
        "assigned_to, task_type, title, priority, status, due_date, completed_at, approved_at",
        (q) => (cockpit ? q.eq("assigned_to", cockpit) : q),
    );

    const openDaily = daily.filter((t) => t.state !== "completed" && !t.completed_on);
    const openAssigned = assigned.filter((t) => !t.completed_at);

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

async function activityReport(supabase) {
    const today = todayISO();
    const week = daysAgoISO(7);
    const month = daysAgoISO(30);

    const since = (rows, field, from) =>
        (rows ?? []).filter((r) => r?.[field] && String(r[field]).slice(0, 10) >= from).length;

    const windows = (rows, field) => ({
        today: since(rows, field, today),
        last_7_days: since(rows, field, week),
        last_30_days: since(rows, field, month),
    });

    const [deals, payments, jobs, daily, applicants, inspections, log, gated] = await Promise.all([
        all(supabase, "pipeline_deals", "created_at", (q) => q.gte("created_at", month)),
        all(supabase, "payments", "amount, received_at, reverses_id", (q) =>
            q.gte("received_at", month),
        ),
        all(supabase, "work_orders", "opened_at, completed_at", (q) => q.gte("opened_at", month)),
        all(supabase, "daily_tasks", "completed_on, created_on", (q) =>
            q.is("deleted_at", null).gte("created_on", month),
        ),
        all(supabase, "applicants", "arrived_at", (q) => q.gte("arrived_at", month)),
        all(supabase, "unit_inspections", "inspected_at", (q) => q.gte("inspected_at", month)),
        all(supabase, "project_log", "occurred_on", (q) => q.gte("occurred_on", month)),
        all(supabase, "unqualified_intake", "created_at", (q) => q.gte("created_at", month)),
    ]);

    const livePayments = payments.filter((p) => !p.reverses_id);

    return {
        window: { today, week_from: week, month_from: month },
        deals_arrived: windows(deals, "created_at"),
        emails_filed_by_the_gate: windows(gated, "created_at"),
        payments_taken: windows(livePayments, "received_at"),
        money_collected: {
            today: sum(
                livePayments.filter((p) => String(p.received_at).slice(0, 10) >= today),
                "amount",
            ),
            last_7_days: sum(
                livePayments.filter((p) => String(p.received_at).slice(0, 10) >= week),
                "amount",
            ),
            last_30_days: sum(livePayments, "amount"),
        },
        work_orders_opened: windows(jobs, "opened_at"),
        work_orders_closed: windows(jobs, "completed_at"),
        tasks_finished: windows(daily, "completed_on"),
        tasks_created: windows(daily, "created_on"),
        applicants_arrived: windows(applicants, "arrived_at"),
        inspections_done: windows(inspections, "inspected_at"),
        build_log_entries: windows(log, "occurred_on"),
        as_of: new Date().toISOString(),
    };
}

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

async function recentDeals(supabase, args) {
    const limit = Number.isFinite(args?.limit) ? Math.min(args.limit, 50) : 10;

    // Property level only. contact_name, contact_phone and contact_email are
    // deliberately absent - a deal's address is business data, the seller's
    // details are not.
    const deals = await all(
        supabase,
        "pipeline_deals",
        "name, address, stage, origin, bird_dog, purchase_price, monthly_cash_flow, dscr, confirmed, dismissed_at, created_at",
        (q) => {
            let query = q.order("created_at", { ascending: false });
            if (typeof args?.since === "string") query = query.gte("created_at", args.since);
            if (typeof args?.search === "string" && args.search.trim()) {
                const term = args.search.trim().replace(/[%,]/g, "");
                query = query.or(`address.ilike.%${term}%,name.ilike.%${term}%`);
            }
            return query.limit(limit);
        },
    );

    return {
        count: deals.length,
        deals: deals.map((d) => ({
            name: d.name,
            address: d.address ?? "No address given",
            stage: d.stage,
            came_from: d.origin,
            bird_dog: d.bird_dog,
            asking_price: d.purchase_price,
            monthly_cash_flow: d.monthly_cash_flow,
            dscr: d.dscr,
            state: d.dismissed_at ? "filed" : d.confirmed ? "in the pipeline" : "awaiting review",
            arrived_at: d.created_at,
        })),
        note: "Seller contact details are not available here. Open the deal in Raj's cockpit for those.",
        // Two rows for one property is the normal state of things right now.
        // Say so here, or it gets read as a bug every time.
        duplicates_expected:
            "A website submission creates one row from the form and a second from its own notification email. The intake gate identifies the second correctly but runs in shadow mode, so nothing is removed. Two rows for one address is expected until the gate is switched from shadow to live.",
    };  
}

/* ---------- detail without personal data (lot numbers, never names) ---------- */

async function lotRoll(supabase) {
    const today = todayISO();
    const [lots, charges, payments, jobs] = await Promise.all([
        all(supabase, "lots", "id, lot_number, home_status, occupied, contract_rent, tenant_portion, rent_due_day, next_inspection_at",
            (q) => q.eq("property", "Hometown Meadows MHP").is("archived_at", null)),
        all(supabase, "rent_ledger_current", "lot_id, amount"),
        all(supabase, "payments_current", "lot_id, amount, received_at"),
        all(supabase, "work_orders", "lot_id, status", (q) => q.not("status", "in", "(completed,cancelled)")),
    ]);

    const sum = (rows, id) => rows.filter((r) => r.lot_id === id).reduce((s, r) => s + Number(r.amount), 0);
    const byNumber = (a, b) => {
        const x = Number(a.lot_number), y = Number(b.lot_number);
        if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
        if (Number.isFinite(x)) return -1;
        if (Number.isFinite(y)) return 1;
        return String(a.lot_number).localeCompare(String(b.lot_number));
    };

    return {
        lots: [...lots].sort(byNumber).map((l) => {
            const paid = payments.filter((p) => p.lot_id === l.id)
                .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
            const owed = Math.round((sum(charges, l.id) - sum(payments, l.id)) * 100) / 100;
            return {
                lot: l.lot_number,
                home: l.home_status,
                occupied: l.occupied,
                monthly_rent: l.tenant_portion ?? l.contract_rent ?? null,
                due_day: l.rent_due_day ?? null,
                owed_today: owed,
                last_paid_on: paid[0] ? String(paid[0].received_at).slice(0, 10) : null,
                open_jobs: jobs.filter((j) => j.lot_id === l.id).length,
                next_inspection: l.next_inspection_at ?? null,
            };
        }),
        note: "Rent shown is what the resident pays. Lateness is decided per lot by its own due day and a five-day grace; this list shows the balance, not a verdict.",
        as_of: today,
    };
}

async function workOrderList(supabase, args) {
    const today = todayISO();
    const days = Number.isFinite(args?.completed_days) ? Math.max(0, Math.min(args.completed_days, 90)) : 0;
    const since = days ? daysAgoISO(days) : null;

    const [orders, lots, parts] = await Promise.all([
        all(supabase, "work_orders", "id, lot_id, title, category, priority, status, opened_at, completed_at",
            (q) => q.neq("status", "cancelled").order("opened_at", { ascending: true })),
        all(supabase, "lots", "id, lot_number"),
        all(supabase, "work_order_parts", "work_order_id, name, expected_on, arrived_on"),
    ]);

    const lotNo = new Map(lots.map((l) => [l.id, l.lot_number]));
    const keep = orders.filter((o) =>
        o.status !== "completed" || (since && o.completed_at && String(o.completed_at).slice(0, 10) >= since));

    return {
        count: keep.length,
        jobs: keep.map((o) => {
            const waiting = parts.filter((p) => p.work_order_id === o.id && !p.arrived_on);
            return {
                lot: lotNo.get(o.lot_id) ?? null,
                title: o.title,
                category: o.category,
                priority: o.priority,
                status: o.status,
                opened_on: String(o.opened_at).slice(0, 10),
                days_open: Math.max(0, Math.round((Date.parse(today) - Date.parse(String(o.opened_at).slice(0, 10))) / 86400000)),
                completed_on: o.completed_at ? String(o.completed_at).slice(0, 10) : null,
                parts_awaited: waiting.map((p) => ({ part: p.name, expected_on: p.expected_on, overdue: Boolean(p.expected_on && p.expected_on < today) })),
            };
        }),
        as_of: today,
    };
}

async function datesList(supabase) {
    const today = todayISO();
    const [dates, docs, inspections] = await Promise.all([
        all(supabase, "critical_dates", "label, due_on, kind, portfolio, completed_at",
            (q) => q.is("completed_at", null).order("due_on", { ascending: true })),
        all(supabase, "documents", "doc_type, stage, due_on",
            (q) => q.not("stage", "in", "(executed,filed,cancelled)").order("due_on", { ascending: true })),
        // Inspections someone has booked. Lot number only - who lives there is not a date.
        all(supabase, "lots", "lot_number, next_inspection_at",
            (q) => q.not("next_inspection_at", "is", null).is("archived_at", null).order("next_inspection_at", { ascending: true })),
    ]);

    return {
        critical_dates: dates.map((d) => ({ what: d.label, kind: d.kind, book: d.portfolio, due_on: d.due_on, overdue: Boolean(d.due_on && d.due_on < today) })),
        open_documents: docs.map((d) => ({ type: d.doc_type, stage: d.stage, due_on: d.due_on, overdue: Boolean(d.due_on && d.due_on < today) })),
        scheduled_inspections: inspections.map((l) => ({ lot: l.lot_number, book: "htm", due_on: l.next_inspection_at, overdue: Boolean(l.next_inspection_at && l.next_inspection_at < today) })),
        as_of: today,
    };
}

const NOTES_BUCKET = "project-notes";

async function listNotes(supabase) {
    const { data, error } = await supabase.storage
        .from(NOTES_BUCKET)
        .list("", { limit: 200, sortBy: { column: "updated_at", order: "desc" } });

    if (error) throw new Error(error.message);

    // Supabase returns a placeholder row for an empty folder. Drop anything
    // without metadata rather than reporting a file that isn't there.
    const files = (data ?? []).filter((f) => f.metadata);

    return {
        count: files.length,
        notes: files.map((f) => ({
            name: f.name,
            size_kb: Math.round((f.metadata?.size ?? 0) / 102.4) / 10,
            updated_at: f.updated_at ?? f.created_at ?? null,
        })),
        how_to_read: "Call read_note with the name exactly as it appears here.",
    };
}

async function readNote(supabase, args) {
    const name = typeof args?.name === "string" ? args.name.trim() : "";
    if (!name) throw new Error("A file name is required");

    // No slashes, no traversal. The bucket is flat by design.
    if (name.includes("/") || name.includes("..")) {
        throw new Error("Give the file name on its own, with no path");
    }

    const { data, error } = await supabase.storage.from(NOTES_BUCKET).download(name);
    if (error) throw new Error(error.message);

    const text = await data.text();
    const LIMIT = 120000;

    return {
        name,
        characters: text.length,
        truncated: text.length > LIMIT,
        content: text.slice(0, LIMIT),
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
        applicants,
        open_work_orders: openJobs,
        emails_filed_by_the_gate: gated,
        last_deal_email_at: lastIntake?.created_at ?? null,
        as_of: new Date().toISOString(),
    };
}

async function runTool(name, args) {
    const supabase = getClient();

    if (name === "system_map") return SYSTEM_MAP;
    if (name === "raj_desk") return rajDesk(supabase);
    if (name === "zo_desk") return zoDesk(supabase);
    if (name === "ellery_desk") return elleryDesk(supabase);
    if (name === "activity_report") return activityReport(supabase);
    if (name === "task_status") return taskStatus(supabase, args);
    if (name === "work_order_status") return workOrderStatus(supabase);
    if (name === "rent_status") return rentStatus(supabase, args);
    if (name === "occupancy_status") return occupancyStatus(supabase);
    if (name === "applicant_status") return applicantStatus(supabase);
    if (name === "documents_and_dates") return documentsAndDates(supabase);
    if (name === "deal_status") return dealStatus(supabase);
    if (name === "recent_deals") return recentDeals(supabase, args);
    if (name === "list_notes") return listNotes(supabase);
    if (name === "read_note") return readNote(supabase, args);
    if (name === "system_snapshot") return systemSnapshot(supabase);
    if (name === "verification_status") return verificationStatus(supabase);
    if (name === "open_work") return openWork(supabase);
    if (name === "project_log") return projectLog(supabase, args);

    if (name === "lot_roll") return lotRoll(supabase);
    if (name === "work_order_list") return workOrderList(supabase, args);
    if (name === "dates_list") return datesList(supabase);
    if (name === "qbo_sync_status") return qboSyncStatus(supabase);
    if (name === "applicant_queue") return applicantQueue(supabase);
    if (name === "rex_units") return rexUnits(supabase);

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

    const supplied = suppliedToken(req);
    const scope = scopeFor(supplied);

    if (!scope && !tokenMatches(supplied)) {
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
                    serverInfo: { name: "able-os", version: "3.0.0" },
                    instructions:
                        "Able OS is the operations cockpit for Able Buys Homes and Hometown Meadows MHP. Start with system_map for any question about how something works or what exists. Use raj_desk, zo_desk and ellery_desk for what is on someone's screen, activity_report for progress today, this week or this month, and the area tools for detail. verification_status, open_work and project_log cover the state of the build. Everything is read-only and reported as counts and totals - to see an individual resident, applicant or deal, open the cockpit.",
                }),
            );
        }

        if (method === "notifications/initialized" || isNotification) {
            return res.status(202).end();
        }

        if (method === "ping") return res.status(200).json(result(id, {}));

        if (method === "tools/list") {
            const tools = scope ? TOOLS.filter((t) => scope.tools.includes(t.name)) : TOOLS;
            return res.status(200).json(result(id, { tools }));
        }

        if (method === "tools/call") {
            const name = params?.name;
            const args = params?.arguments ?? {};

            // Asked for by name, not only hidden from the list.
            if (scope && !scope.tools.includes(name)) {
                return res.status(200).json(
                    result(id, {
                        content: [{ type: "text", text: "That tool is not available to this key." }],
                        isError: true,
                    }),
                );
            }

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