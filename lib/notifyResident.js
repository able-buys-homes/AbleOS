// lib/notifyResident.js
// Tells a resident, in their portal, that the office did something to their
// lot. Never throws: a notice that fails must not undo the payment, the job
// update or the charge that caused it.

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} lotId
 * @param {{ type: string, title: string, body?: string, link?: string }} notice
 */
export async function notifyResident(supabase, lotId, notice) {
    try {
        if (!lotId || !notice?.title) return;

        await supabase.from("resident_notifications").insert({
            lot_id: lotId,
            type: notice.type,
            title: String(notice.title).slice(0, 200),
            body: notice.body ? String(notice.body).slice(0, 1000) : null,
            link: notice.link ?? null,
        });
    } catch (err) {
        console.error("notifyResident failed", err?.message ?? err);
    }
}