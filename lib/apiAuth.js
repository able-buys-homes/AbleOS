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

/**
 * The same verification, for a resident rather than a member of staff.
 *
 * A resident has no profiles row, so requireUser refuses them - which is
 * correct, and means a resident can never reach a staff endpoint by accident.
 * This is the mirror of that: it refuses anyone without a live
 * resident_accounts row, so staff cannot wander into the portal either unless
 * somebody has deliberately given them a lot.
 *
 * Returns the lot, because every portal endpoint is scoped to one lot and
 * nothing should ever have to take the lot from the request.
 */
export async function requireResident(req) {
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

    const { data: account, error: accountError } = await supabase
        .from("resident_accounts")
        .select("id, lot_id, display_name, disabled_at")
        .eq("user_id", data.user.id)
        .maybeSingle();

    if (accountError) {
        throw { status: 500, message: "Could not check that account" };
    }

    // Disabled rather than deleted when somebody moves out, so their payment
    // history keeps an owner. They must not still be able to sign in.
    if (!account || account.disabled_at) {
        throw { status: 403, message: "This account is not active" };
    }

    const { data: lot, error: lotError } = await supabase
        .from("lots")
        .select(
            "id, lot_number, property, tenant_name, contract_rent, tenant_portion, hap_household, rent_placeholder, rent_due_day, move_in_on, occupied, home_status",
        )
        .eq("id", account.lot_id)
        .single();

    if (lotError || !lot) {
        throw { status: 403, message: "This account is not attached to a home" };
    }

    return { user: data.user, account, lot };
}

/** Throws unless the caller owns one of the allowed cockpits. */
export function requireCockpit(profile, allowed) {
    if (!allowed.includes(profile.cockpit)) {
        throw { status: 403, message: "You don't have permission to do that" };
    }
}