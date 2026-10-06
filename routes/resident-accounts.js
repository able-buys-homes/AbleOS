// routes/resident-accounts.js
// Dane creates a resident's Tenant Portal account from his cockpit.
//
// GET  /api/resident-accounts   every lot Zo has marked occupied, with the
//                               tenant on it and whether it already has an
//                               active portal account
// POST /api/resident-accounts   { lot_id } -> creates the account and returns
//                               the sign-in and a one-time temporary password
//
// Occupancy is read live from `lots` - the same rows Zo's Map and Rent tabs
// show - so this screen can never disagree with them. The POST checks again on
// the server: a lot that is not occupied, or has no tenant named, is refused
// whatever the browser sent.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireUser, requireCockpit } from "../lib/apiAuth.js";

const PROPERTY = "Hometown Meadows MHP";
const CAN_USE = ["dane"];

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

/** The address the portal signs in with. Must match the portal's own rule. */
function signInEmail(lotNumber) {
    const slug = String(lotNumber).replace(/[^0-9a-z]/gi, "").toLowerCase();
    return `lot${slug}@hometownmeadows.com`;
}

/**
 * Easy to read aloud and type on a phone: no 0/O, 1/l/I. Ten characters from
 * a 54-symbol alphabet is plenty for a password the resident must change on
 * first sign-in.
 */
function temporaryPassword() {
    // Supabase requires 12+ characters with lower, upper, digit and symbol.
    // 14, with at least one of each, and nothing that reads ambiguously.
    const sets = [
        "ABCDEFGHJKLMNPQRSTUVWXYZ",
        "abcdefghjkmnpqrstuvwxyz",
        "23456789",
        "!@#$%",
    ];
    const all = sets.join("");
    const pick = (chars) => chars[crypto.randomInt(chars.length)];

    const chars = [
        ...sets.map(pick),
        ...Array.from({ length: 10 }, () => pick(all)),
    ];

    // Shuffle so the guaranteed characters are not always in front.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join("");
}

export default async function handler(req, res) {
    let caller;
    try {
        caller = await requireUser(req);
        requireCockpit(caller.profile, CAN_USE);
    } catch (err) {
        return res
            .status(err?.status || 401)
            .json({ error: err?.message || "Not authorised" });
    }

    if (!["GET", "POST"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const supabase = getClient();

        /* ---- the list Dane picks from ---- */
        if (req.method === "GET") {
            const [lotsRes, accountsRes] = await Promise.all([
                supabase
                    .from("lots")
                    .select("id, lot_number, tenant_name, home_status")
                    .eq("property", PROPERTY)
                    .eq("home_status", "occupied")
                    .is("archived_at", null),
                supabase
                    .from("resident_accounts")
                    .select("lot_id, created_at, created_by, last_seen_at")
                    .is("disabled_at", null),
            ]);

            if (lotsRes.error) throw lotsRes.error;
            if (accountsRes.error) throw accountsRes.error;

            const accountByLot = new Map(
                (accountsRes.data ?? []).map((a) => [a.lot_id, a]),
            );

            const lots = (lotsRes.data ?? []).map((lot) => {
                const account = accountByLot.get(lot.id) ?? null;
                return {
                    id: lot.id,
                    lot_number: lot.lot_number,
                    tenant_name: lot.tenant_name,
                    sign_in: String(lot.lot_number),
                    has_account: Boolean(account),
                    account_created_at: account?.created_at ?? null,
                    last_seen_at: account?.last_seen_at ?? null,
                    // A home Zo marked occupied without a name cannot be given
                    // an account - there is nobody to give it to.
                    can_create: !account && Boolean(lot.tenant_name?.trim()),
                };
            });

            return res.status(200).json({ lots });
        }

        /* ---- reset a forgotten password ---- */
        // The resident calls the office; Dane checks it is them and taps
        // Reset. A new temporary password replaces the old one straight away,
        // and the portal asks them to choose their own again.
        if (req.query?.reset) {
            const resetLotId = String(req.body?.lot_id || "");
            if (!resetLotId) return res.status(400).json({ error: "Pick a lot" });

            const { data: account, error: accountError } = await supabase
                .from("resident_accounts")
                .select("id, user_id, lot_id, lots(lot_number, tenant_name, property)")
                .eq("lot_id", resetLotId)
                .is("disabled_at", null)
                .maybeSingle();

            if (accountError) throw accountError;
            if (!account || account.lots?.property !== PROPERTY) {
                return res.status(404).json({ error: "That lot has no portal account to reset" });
            }

            const password = temporaryPassword();

            const { error: resetError } = await supabase.auth.admin.updateUserById(
                account.user_id,
                { password },
            );
            if (resetError) throw resetError;

            // Back to "still using the office's password", so the portal's
            // reminder asks them to change it again.
            await supabase
                .from("resident_accounts")
                .update({ password_changed_at: null })
                .eq("id", account.id);

            const lotNumber = account.lots?.lot_number ?? "?";
            const tenant = account.lots?.tenant_name?.trim() || "the resident";

            await supabase.from("notifications").insert({
                recipient: "raj",
                type: "portal_password_reset",
                title: `Portal password reset for Lot ${lotNumber}`,
                body: `${caller.profile.cockpit} issued ${tenant} a new temporary password.`,
                link: "/raj",
            }).then(() => null, () => null);

            return res.status(200).json({
                ok: true,
                reset: true,
                lot_number: lotNumber,
                tenant_name: tenant,
                sign_in: String(lotNumber),
                temporary_password: password,
                portal_url: "https://portal.hometownmeadows.com",
            });
        }

        /* ---- create one account ---- */
        const lotId = String(req.body?.lot_id || "");
        if (!lotId) return res.status(400).json({ error: "Pick a lot" });

        const { data: lot, error: lotError } = await supabase
            .from("lots")
            .select("id, lot_number, tenant_name, home_status, property")
            .eq("id", lotId)
            .maybeSingle();

        if (lotError) throw lotError;
        if (!lot || lot.property !== PROPERTY) {
            return res.status(404).json({ error: "No such lot" });
        }

        // Checked here, not just in the dropdown. The browser is not the
        // authority on who lives where - Zo's map is.
        if (lot.home_status !== "occupied") {
            return res.status(409).json({
                error: `Lot ${lot.lot_number} is not occupied on Zo's map, so it cannot have a portal account.`,
            });
        }
        if (!lot.tenant_name?.trim()) {
            return res.status(409).json({
                error: `Lot ${lot.lot_number} has no tenant named on Zo's map. Ask Zo to add the name first.`,
            });
        }

        const { data: existing, error: existingError } = await supabase
            .from("resident_accounts")
            .select("id")
            .eq("lot_id", lot.id)
            .is("disabled_at", null)
            .limit(1);

        if (existingError) throw existingError;
        if (existing?.length) {
            return res.status(409).json({
                error: `Lot ${lot.lot_number} already has a portal account.`,
            });
        }

        const email = signInEmail(lot.lot_number);
        const password = temporaryPassword();

        const makeUser = () =>
            supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { lot_number: lot.lot_number, role: "resident" },
            });

        let { data: created, error: createError } = await makeUser();

        if (createError && /already|registered|exists/i.test(createError.message || "")) {
            // The sign-in address belongs to the lot, so a previous tenant's
            // sign-in may still hold it. If that sign-in has no active
            // account, retire it - renamed to an "ended" address and banned,
            // so the old tenant can never get in - and free the address for
            // the new tenant. Their history keeps pointing at the old user.
            const retired = await retireSignIn(supabase, email);
            if (retired === "active") {
                return res.status(409).json({
                    error: `Lot ${lot.lot_number} already has an active portal account.`,
                });
            }
            if (retired === "retired") {
                ({ data: created, error: createError } = await makeUser());
            }
        }

        if (createError) {
            if (/already|registered|exists/i.test(createError.message || "")) {
                return res.status(409).json({
                    error: `Lot ${lot.lot_number}'s sign-in address is still taken. Tell Dane.`,
                });
            }
            throw createError;
        }

        const { error: linkError } = await supabase.from("resident_accounts").insert({
            user_id: created.user.id,
            lot_id: lot.id,
            display_name: lot.tenant_name.trim(),
            created_by: caller.profile.cockpit,
        });

        if (linkError) {
            // Never leave a sign-in that opens nothing. Undo the auth user.
            await supabase.auth.admin.deleteUser(created.user.id).catch(() => null);
            if (linkError.code === "23505") {
                return res.status(409).json({
                    error: `Lot ${lot.lot_number} already has a portal account.`,
                });
            }
            throw linkError;
        }

        await supabase.from("notifications").insert({
            recipient: "raj",
            type: "portal_account_created",
            title: `Portal account created for Lot ${lot.lot_number}`,
            body: `${caller.profile.cockpit} gave ${lot.tenant_name.trim()} a Tenant Portal sign-in.`,
            link: "/raj",
        }).then(() => null, () => null);

        // The password is returned once and never stored in plain text
        // anywhere. Dane hands it over; the portal asks the resident to change
        // it the first time they sign in.
        return res.status(201).json({
            ok: true,
            lot_number: lot.lot_number,
            tenant_name: lot.tenant_name.trim(),
            sign_in: String(lot.lot_number),
            temporary_password: password,
            portal_url: "https://portal.hometownmeadows.com",
        });
    } catch (err) {
        console.error("resident-accounts failed", err?.message ?? err);
        return res.status(500).json({ error: "Could not create that account" });
    }
}

/**
 * Frees a lot's sign-in address held by a sign-in nobody actively uses.
 * Returns "active" if a live account still uses it (left alone),
 * "retired" if it was renamed and banned, or "missing" if nothing held it.
 */
async function retireSignIn(supabase, email) {
    let holder = null;
    for (let page = 1; page <= 20 && !holder; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const users = data?.users ?? [];
        holder = users.find((u) => String(u.email || "").toLowerCase() === email.toLowerCase()) ?? null;
        if (users.length < 200) break;
    }
    if (!holder) return "missing";

    const { data: live, error: liveError } = await supabase
        .from("resident_accounts")
        .select("id")
        .eq("user_id", holder.id)
        .is("disabled_at", null)
        .limit(1);
    if (liveError) throw liveError;
    if (live?.length) return "active";

    const [name, domain] = email.split("@");
    const { error: updError } = await supabase.auth.admin.updateUserById(holder.id, {
        email: `${name}+ended-${Date.now()}@${domain}`,
        email_confirm: true,
        ban_duration: "876000h",
    });
    if (updError) throw updError;
    return "retired";
}
