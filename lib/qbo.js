// lib/qbo.js
// Talking to QuickBooks Online.
//
// Intuit's OAuth is not the usual kind: the refresh token is rotated on every
// single refresh, and the old one dies immediately. So the new one has to be
// written to the database in the same breath it arrives - if the process dies
// between refreshing and saving, the connection is gone and somebody has to
// reauthorise by hand. That is why saving happens before anything else is done
// with the response.
//
// A refresh token also expires after 100 days of not being used. The books are
// posted to daily, so that will not happen in practice, but it is the reason
// the token lives in a table rather than in an environment variable.

import { createClient } from "@supabase/supabase-js";

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

// Pinned deliberately. Intuit changes behaviour between minor versions, and a
// silent upgrade underneath a live ledger is not something to discover later.
const MINOR_VERSION = "70";

let cachedClient = null;

function getClient() {
    if (cachedClient) return cachedClient;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY missing");

    cachedClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return cachedClient;
}

export function apiBase(environment) {
    return environment === "production"
        ? "https://quickbooks.api.intuit.com"
        : "https://sandbox-quickbooks.api.intuit.com";
}

function basicAuth() {
    const id = process.env.QBO_CLIENT_ID;
    const secret = process.env.QBO_CLIENT_SECRET;

    if (!id || !secret) {
        throw { status: 500, message: "QBO_CLIENT_ID or QBO_CLIENT_SECRET missing" };
    }

    return Buffer.from(`${id}:${secret}`).toString("base64");
}

/** The single connection row, or null if nobody has authorised yet. */
export async function getConnection() {
    const supabase = getClient();

    const { data, error } = await supabase
        .from("qbo_connection")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

    if (error) throw new Error(error.message);
    return data ?? null;
}

/**
 * Writes a token response to the single connection row.
 *
 * Called by the OAuth callback and by every refresh. Upsert rather than update,
 * because the first authorisation has no row to update.
 */
export async function saveTokens(tokens, extra = {}) {
    const supabase = getClient();
    const now = Date.now();

    const row = {
        id: "default",
        access_token: tokens.access_token ?? null,
        access_token_expires_at: tokens.expires_in
            ? new Date(now + Number(tokens.expires_in) * 1000).toISOString()
            : null,
        refresh_token: tokens.refresh_token,
        refresh_token_expires_at: tokens.x_refresh_token_expires_in
            ? new Date(now + Number(tokens.x_refresh_token_expires_in) * 1000).toISOString()
            : null,
        updated_at: new Date().toISOString(),
        ...extra,
    };

    const { data, error } = await supabase
        .from("qbo_connection")
        .upsert(row, { onConflict: "id" })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

async function refreshConnection(connection) {
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(
        connection.refresh_token,
    )}`;

    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
            Authorization: `Basic ${basicAuth()}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body,
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload?.access_token) {
        // The most likely cause is that the refresh token was already used or
        // has expired, and no amount of retrying fixes that. Somebody has to
        // reconnect, so say so plainly.
        throw {
            status: 503,
            message:
                "QuickBooks needs to be reconnected. Open /api/qbo-auth to authorise it again.",
        };
    }

    // Saved first. Anything that throws after this point leaves a usable
    // connection behind; anything that throws before it would not have.
    return saveTokens(payload, {
        realm_id: connection.realm_id,
        environment: connection.environment,
    });
}

/**
 * A live access token, refreshing if the current one is close to expiry.
 *
 * Two minutes of margin, because a token that expires mid-request fails in a
 * way that looks like a permissions problem and wastes an afternoon.
 */
export async function accessToken() {
    const connection = await getConnection();

    if (!connection) {
        throw { status: 503, message: "QuickBooks is not connected yet" };
    }

    const expiresAt = connection.access_token_expires_at
        ? new Date(connection.access_token_expires_at).getTime()
        : 0;

    if (connection.access_token && expiresAt - Date.now() > 120_000) {
        return { token: connection.access_token, connection };
    }

    const refreshed = await refreshConnection(connection);
    return { token: refreshed.access_token, connection: refreshed };
}

/**
 * One request to the QuickBooks API. Returns the parsed body.
 *
 * Errors are thrown with Intuit's own message attached, because "400 Bad
 * Request" tells whoever reads the log nothing at all.
 */
export async function qbo(path, { method = "GET", body } = {}) {
    const { token, connection } = await accessToken();

    const separator = path.includes("?") ? "&" : "?";
    const url = `${apiBase(connection.environment)}/v3/company/${connection.realm_id}${path}${separator}minorversion=${MINOR_VERSION}`;

    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
        const detail =
            payload?.Fault?.Error?.[0]?.Detail ??
            payload?.Fault?.Error?.[0]?.Message ??
            `HTTP ${res.status}`;

        throw { status: 502, message: `QuickBooks refused that: ${detail}` };
    }

    return payload;
}

/** A QuickBooks query. The text is escaped for the one character that matters. */
export async function qboQuery(statement) {
    const payload = await qbo(`/query?query=${encodeURIComponent(statement)}`);
    return payload?.QueryResponse ?? {};
}

/** Single quotes are the only escaping QuickBooks' query language needs. */
export function qboEscape(value) {
    return String(value ?? "").replace(/'/g, "\\'");
}