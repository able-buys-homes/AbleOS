// routes/ellery-dates.js
// Ellery's Documents & Dates list (Raj, v1: read-only). Uses the same
// dates_list tool as the MCP, so her screen and Raj's AI always agree.
//
// GET /api/ellery-dates   (Ellery; Raj and Dane can preview)

import { requireUser, requireCockpit } from "../lib/apiAuth.js";
import { runTool } from "./mcp.js";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }
    try {
        const caller = await requireUser(req);
        requireCockpit(caller.profile, ["ellery", "raj", "dane"]);
    } catch (err) {
        return res.status(err?.status || 401).json({ error: err?.message || "Not authorised" });
    }
    try {
        return res.status(200).json(await runTool("dates_list", {}));
    } catch (err) {
        console.error("ellery-dates", err?.message ?? err);
        return res.status(500).json({ error: "Could not load the dates just now" });
    }
}
