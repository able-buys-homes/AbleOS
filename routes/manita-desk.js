// routes/manita-desk.js
// Manita's owner/ops desk (Raj, v1). Read-only, everything she manages on one
// page. Built from the same tools the MCP uses, so her screen and Raj's AI
// always say the same thing.
//
// Rules from Raj's spec:
//   - read-only: nothing here changes anything
//   - MFA required on her login - refused without the second factor
//   - no approval buttons, no screening data
//   - QuickBooks sync STATUS only, never the connection
//
// GET /api/manita-desk   (Manita; Raj and Dane can preview it)

import { requireUser, requireCockpit } from "../lib/apiAuth.js";
import { runTool } from "./mcp.js";

/** The sign-in strength recorded in the caller's token: aal1 = password, aal2 = password + second factor. */
function signInLevel(req) {
    try {
        const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
        return payload.aal ?? null;
    } catch {
        return null;
    }
}

const TOOLS = ["lot_roll", "rent_status", "dates_list", "documents_and_dates", "qbo_sync_status"];

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    let caller;
    try {
        caller = await requireUser(req);
        requireCockpit(caller.profile, ["manita", "raj", "dane"]);
    } catch (err) {
        return res.status(err?.status || 401).json({ error: err?.message || "Not authorised" });
    }

    // Manita's own login must have its second factor. Raj and Dane previewing
    // her page are checked by their own sign-in, not this.
    if (caller.profile.realCockpit === "manita" && signInLevel(req) !== "aal2") {
        return res.status(403).json({
            error: "For your safety, this page needs the second sign-in step. Please ask Dane to help you set it up.",
            mfa_required: true,
        });
    }

    const out = {};
    await Promise.all(
        TOOLS.map(async (name) => {
            try {
                out[name] = await runTool(name, {});
            } catch (err) {
                console.error("manita-desk", name, err?.message ?? err);
                out[name] = { error: "Could not load this part just now" };
            }
        }),
    );

    return res.status(200).json({ ...out, as_of: new Date().toISOString() });
}
