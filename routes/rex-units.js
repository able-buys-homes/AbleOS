// routes/rex-units.js
// Rex's AHTX vacant homes for his cockpit (Raj, v1). Read-only. Uses the same
// rex_units tool as the MCP, so the screen and Raj's AI always agree.
//
// GET /api/rex-units   (Rex; Raj and Dane can preview)

import { requireUser, requireCockpit } from "../lib/apiAuth.js";
import { runTool } from "./mcp.js";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }
    try {
        const caller = await requireUser(req);
        requireCockpit(caller.profile, ["rex", "raj", "dane"]);
    } catch (err) {
        return res.status(err?.status || 401).json({ error: err?.message || "Not authorised" });
    }
    try {
        return res.status(200).json(await runTool("rex_units", {}));
    } catch (err) {
        console.error("rex-units", err?.message ?? err);
        return res.status(500).json({ error: "Could not load the vacant homes just now" });
    }
}
