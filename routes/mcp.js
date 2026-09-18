// routes/mcp.js
// A read-only MCP server so Raj's Claude can ask the cockpit what the state
// of the project is, instead of relying on a document it has to remember.
//
// POST /api/mcp?key=...   JSON-RPC 2.0, Streamable HTTP transport
//
// Read-only by design. There is no tool here that changes anything, so the
// worst a leaked URL costs is someone reading progress notes. No resident
// names, no applicant detail, no contact information is exposed.

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
    if (!expected) return true; // Not configured - open, by choice.
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

/* ---------------- the tools ---------------- */

const TOOLS = [
    {
        name: "verification_status",
        description:
            "The ten rows of the Able OS verification work order, with their current state and the evidence that closes each one. Use this when asked whether something has been verified, or what still needs proving.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "open_work",
        description:
            "Everything still outstanding on Able OS - open or blocked - with who or what each item waits on. Use this when asked what is left to do, or what is holding something up.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "project_log",
        description:
            "The dated record of work on Able OS: what was built, fixed, decided and discovered, with the evidence for each. Use this when asked what has been done, or what happened on a particular day.",
        inputSchema: {
            type: "object",
            properties: {
                kind: {
                    type: "string",
                    description:
                        "Filter to one kind: verification, build, fix, finding or decision.",
                },
                status: {
                    type: "string",
                    description: "Filter to done, open, blocked or superseded.",
                },
                since: {
                    type: "string",
                    description: "Only entries on or after this date, as YYYY-MM-DD.",
                },
                limit: {
                    type: "number",
                    description: "How many entries to return. Defaults to 50.",
                },
            },
        },
    },
    {
        name: "system_snapshot",
        description:
            "Live counts straight from the Able OS database - deals in the pipeline, occupied lots, applicants, emails the intake gate filed, and when a deal last arrived. Use this when asked how the system is actually doing right now.",
        inputSchema: { type: "object", properties: {} },
    },
];

async function verificationStatus(supabase) {
    const { data, error } = await supabase
        .from("project_log")
        .select("ref, title, detail, evidence, status, owner, blocked_on")
        .eq("kind", "verification")
        .order("ref", { ascending: true });

    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((r) => ({
        row: r.ref,
        item: r.title,
        state: r.status,
        detail: r.detail,
        evidence: r.evidence ?? "Not yet evidenced",
        waiting_on: r.blocked_on ?? null,
    }));

    const closed = rows.filter((r) => r.state === "done").length;

    return {
        summary: `${closed} of ${rows.length} rows closed with evidence.`,
        rows,
    };
}

async function openWork(supabase) {
    const { data, error } = await supabase
        .from("project_log")
        .select("kind, ref, title, detail, status, owner, blocked_on")
        .in("status", ["open", "blocked"])
        .order("occurred_on", { ascending: false });

    if (error) throw new Error(error.message);

    return {
        count: data?.length ?? 0,
        items: (data ?? []).map((r) => ({
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
    let query = supabase
        .from("project_log")
        .select("kind, ref, title, detail, evidence, status, owner, blocked_on, occurred_on")
        .order("occurred_on", { ascending: false });

    if (typeof args?.kind === "string") query = query.eq("kind", args.kind);
    if (typeof args?.status === "string") query = query.eq("status", args.status);
    if (typeof args?.since === "string") query = query.gte("occurred_on", args.since);

    const limit = Number.isFinite(args?.limit) ? Math.min(args.limit, 200) : 50;

    const { data, error } = await query.limit(limit);
    if (error) throw new Error(error.message);

    return { count: data?.length ?? 0, entries: data ?? [] };
}

async function systemSnapshot(supabase) {
    // Counts only. Nothing here identifies a person.
    const counted = async (table, build) => {
        let q = supabase.from(table).select("id", { count: "exact", head: true });
        if (build) q = build(q);
        const { count, error } = await q;
        if (error) throw new Error(error.message);
        return count ?? 0;
    };

    const [deals, awaitingReview, lotsTotal, lotsOccupied, applicants, gated] =
        await Promise.all([
            counted("pipeline_deals"),
            counted("pipeline_deals", (q) =>
                q.eq("confirmed", false).is("dismissed_at", null),
            ),
            counted("lots"),
            counted("lots", (q) => q.eq("occupied", true)),
            counted("applicants"),
            counted("unqualified_intake"),
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
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, mcp-protocol-version");
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

    // A notification carries no id and expects no reply.
    const isNotification = id === undefined || id === null;

    try {
        if (method === "initialize") {
            return res.status(200).json(
                result(id, {
                    protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
                    capabilities: { tools: { listChanged: false } },
                    serverInfo: { name: "able-os", version: "1.0.0" },
                    instructions:
                        "Able OS is the operations cockpit for Able Buys Homes and Hometown Meadows MHP. Ask verification_status for the state of the verification work order, open_work for what is outstanding, project_log for the dated record of what has been done, and system_snapshot for live figures. Everything here is read-only.",
                }),
            );
        }

        if (method === "notifications/initialized" || isNotification) {
            return res.status(202).end();
        }

        if (method === "ping") {
            return res.status(200).json(result(id, {}));
        }

        if (method === "tools/list") {
            return res.status(200).json(result(id, { tools: TOOLS }));
        }

        if (method === "tools/call") {
            const name = params?.name;
            const args = params?.arguments ?? {};

            try {
                const value = await runTool(name, args);

                return res.status(200).json(
                    result(id, {
                        content: [
                            { type: "text", text: JSON.stringify(value, null, 2) },
                        ],
                        structuredContent: value,
                        isError: false,
                    }),
                );
            } catch (toolError) {
                // A failing tool is reported inside the result, not as a
                // protocol error - the model should see it and say so.
                return res.status(200).json(
                    result(id, {
                        content: [
                            { type: "text", text: `That failed: ${toolError.message}` },
                        ],
                        isError: true,
                    }),
                );
            }
        }

        if (method === "resources/list") {
            return res.status(200).json(result(id, { resources: [] }));
        }

        if (method === "prompts/list") {
            return res.status(200).json(result(id, { prompts: [] }));
        }

        return res.status(200).json(failure(id, -32601, `Unknown method: ${method}`));
    } catch (err) {
        console.error("mcp error:", err);
        return res.status(200).json(failure(id ?? null, -32603, "Internal error"));
    }
}