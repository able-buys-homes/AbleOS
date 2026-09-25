// routes/qbo-auth.js
// Connecting the cockpit to QuickBooks. Done once, by a person, in a browser.
//
// GET /api/qbo-auth          -> sends you to Intuit to authorise
// GET /api/qbo-auth?code=..  -> Intuit sends you back here with the code
//
// The start URL is deliberately not behind a login, because it cannot do any
// harm on its own: all it does is redirect to Intuit's own consent screen,
// which still demands QuickBooks credentials. The part that matters is the
// callback, and that is protected by a signed state parameter - so somebody
// cannot trick a signed-in admin into attaching the wrong company's books.

import crypto from "node:crypto";
import { saveTokens } from "../lib/qbo.js";

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";

/** Ten minutes. Long enough to read the consent screen, short enough to matter. */
const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret() {
    const secret = process.env.QBO_CLIENT_SECRET;
    if (!secret) throw { status: 500, message: "QBO_CLIENT_SECRET missing" };
    return secret;
}

function signState() {
    const issued = String(Date.now());
    const mac = crypto
        .createHmac("sha256", stateSecret())
        .update(issued)
        .digest("hex");

    return `${issued}.${mac}`;
}

function stateIsValid(state) {
    const [issued, mac] = String(state ?? "").split(".");
    if (!issued || !mac) return false;

    const expected = crypto
        .createHmac("sha256", stateSecret())
        .update(issued)
        .digest("hex");

    const a = Buffer.from(mac);
    const b = Buffer.from(expected);

    if (a.length !== b.length) return false;
    if (!crypto.timingSafeEqual(a, b)) return false;

    return Date.now() - Number(issued) < STATE_TTL_MS;
}

function page(title, body) {
    return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.5rem;color:#2b2320">
<h1 style="font-size:1.5rem;margin:0 0 .75rem">${title}</h1>${body}</body>`;
}

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const clientId = process.env.QBO_CLIENT_ID;
    const redirectUri = process.env.QBO_REDIRECT_URI;

    if (!clientId || !redirectUri) {
        return res
            .status(500)
            .json({ error: "QBO_CLIENT_ID or QBO_REDIRECT_URI missing" });
    }

    const code = String(req.query?.code ?? "");

    /* ---- Step one: send them to Intuit ---- */
    if (!code) {
        const url =
            `${AUTH_URL}?client_id=${encodeURIComponent(clientId)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(SCOPE)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&state=${encodeURIComponent(signState())}`;

        res.setHeader("Location", url);
        return res.status(302).end();
    }

    /* ---- Step two: Intuit sent them back ---- */
    if (!stateIsValid(req.query?.state)) {
        return res
            .status(400)
            .send(
                page(
                    "That link has expired",
                    "<p>Start again at <code>/api/qbo-auth</code>. If you did not start this yourself, ignore it - nothing was connected.</p>",
                ),
            );
    }

    const realmId = String(req.query?.realmId ?? "");
    if (!realmId) {
        return res
            .status(400)
            .send(page("No company came back", "<p>QuickBooks did not say which company was authorised. Try again.</p>"));
    }

    // Refuse a company we were not expecting. Attaching the ledger to the wrong
    // QuickBooks file is the kind of mistake that is discovered weeks later by
    // an accountant.
    const expected = process.env.QBO_REALM_ID;
    if (expected && expected !== realmId) {
        return res.status(409).send(
            page(
                "That is the wrong QuickBooks company",
                `<p>This cockpit expects company <code>${expected}</code>, but <code>${realmId}</code> was authorised. Nothing has been saved.</p>
                 <p>Sign in to the right QuickBooks company and try again, or change <code>QBO_REALM_ID</code> if the move is deliberate.</p>`,
            ),
        );
    }

    try {
        const body =
            `grant_type=authorization_code` +
            `&code=${encodeURIComponent(code)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}`;

        const tokenRes = await fetch(TOKEN_URL, {
            method: "POST",
            headers: {
                Authorization: `Basic ${Buffer.from(
                    `${clientId}:${process.env.QBO_CLIENT_SECRET}`,
                ).toString("base64")}`,
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body,
        });

        const tokens = await tokenRes.json().catch(() => null);

        if (!tokenRes.ok || !tokens?.refresh_token) {
            console.error("qbo-auth: token exchange failed", tokens);
            return res
                .status(502)
                .send(page("QuickBooks refused the connection", "<p>Try again from <code>/api/qbo-auth</code>.</p>"));
        }

        await saveTokens(tokens, {
            realm_id: realmId,
            environment: process.env.QBO_ENV === "production" ? "production" : "sandbox",
            connected_at: new Date().toISOString(),
            connected_by: "browser",
        });

        return res.status(200).send(
            page(
                "QuickBooks is connected",
                `<p>Company <code>${realmId}</code>, ${process.env.QBO_ENV === "production" ? "production" : "sandbox"
                }.</p>
                 <p>You can close this tab. Payments will post from here on.</p>`,
            ),
        );
    } catch (err) {
        console.error("qbo-auth failed", err?.message ?? err);
        return res
            .status(500)
            .send(page("Something went wrong", "<p>Nothing was connected. Try again.</p>"));
    }
}