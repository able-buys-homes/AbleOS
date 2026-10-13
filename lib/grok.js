// lib/grok.js
// n8n->Grok part 1 (13 Oct 2026). Forwards a copy of something the cockpit has
// received to one of Coco's Grok routines, replacing the n8n webhooks.
//
// Rules:
//   - The cockpit's own record is always saved first; this is only a copy.
//   - Never throws. Returns { sent, reason } so the caller can fall back.
//   - URL and sender key are server-side env vars, never sent to a browser.
//   - The header name comes from env too, because it is set in Grok's
//     routine panel and has not been confirmed yet.
//
// Env (Vercel, Production):
//   GROK_WEBHOOK_SENDER_KEY      shared key Grok checks
//   GROK_WEBHOOK_SENDER_HEADER   header name, default "X-Sender-Key"
//   GROK_WEBHOOK_*_URL           one per routine (deal, app, callback)

export async function forwardToGrok(url, body) {
    if (!url) return { sent: false, reason: "not_configured" };

    const header = process.env.GROK_WEBHOOK_SENDER_HEADER || "X-Sender-Key";
    const key = process.env.GROK_WEBHOOK_SENDER_KEY || "";

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", [header]: key },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
            console.error("grok forward refused:", res.status);
            return { sent: false, reason: `status_${res.status}` };
        }

        return { sent: true, reason: null };
    } catch (err) {
        console.error("grok forward failed:", err?.message ?? err);
        return { sent: false, reason: "network" };
    }
}
