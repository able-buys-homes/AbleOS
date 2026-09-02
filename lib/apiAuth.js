// lib/apiAuth.js
// Verifies the caller's Supabase session on the server, then looks up which
// cockpit they own. Lives outside /api so Vercel doesn't turn it into a route.

import { createClient } from "@supabase/supabase-js";

/**
 * Cockpits retired on 1 Sep 2026. Denied here rather than by deleting the
 * screens, so the role survives for whoever picks it up next while these
 * accounts reach nothing today.
 *
 * This is the single choke point - every API route calls requireUser, so a
 * route that forgets its own check is still covered.
 */
/**
 * Retired cockpits. Karen and Jeremiah on 1 Sep 2026, Colton on 3 Sep.
 * Denied here rather than by deleting the screens, so a role can be handed to
 * a successor without rebuilding it - and so this stays one choke point that a
 * route which forgets its own check cannot bypass.
 */
const RETIRED_COCKPITS = new Set(["karen", "jeremiah", "colton"]);

let adminClient = null;

function getAdmin() {
    if (adminClient) return adminClient;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SECRET_KEY missing");

    adminClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return adminClient;
}

/**
 * Reads the Bearer token, verifies it with Supabase, and returns the caller's
 * profile. Throws { status, message } so handlers can map it to a response.
 */
export async function requireUser(req) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!token) {
        throw { status: 401, message: "Not signed in" };
    }

    const supabase = getAdmin();

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
        throw { status: 401, message: "Session expired. Sign in again." };
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, cockpit, is_admin")
        .eq("id", data.user.id)
        .single();

    if (profileError || !profile) {
        throw { status: 403, message: "No cockpit assigned to this account" };
    }

    if (RETIRED_COCKPITS.has(profile.cockpit)) {
        throw { status: 403, message: "This cockpit is no longer active" };
    }

    // Admins (Raj) can operate inside another cockpit. We swap `cockpit` so every
    // endpoint's existing role checks work unchanged, but keep `full_name` as the
    // real person - so Notion still records who actually clicked.
    const requested = String(
        req.headers["x-act-as"] || req.body?.actAs || req.query?.actAs || "",
    ).trim();

    // Retired cockpits are absent here too - otherwise an admin could act as
    // one and walk straight back in through the side door.
    const ALLOWED = ["raj", "dane", "zo", "rex"];

    if (requested && profile.is_admin && ALLOWED.includes(requested)) {
        return {
            user: data.user,
            profile: {
                ...profile,
                cockpit: requested,
                realCockpit: profile.cockpit,
                actingAs: requested !== profile.cockpit ? requested : null,
            },
        };
    }

    return {
        user: data.user,
        profile: { ...profile, realCockpit: profile.cockpit, actingAs: null },
    };
}

/** Throws unless the caller owns one of the allowed cockpits. */
export function requireCockpit(profile, allowed) {
    if (!allowed.includes(profile.cockpit)) {
        throw { status: 403, message: "You don't have permission to do that" };
    }
}