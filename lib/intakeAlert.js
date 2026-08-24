// lib/intakeAlert.js
// One alert, raised two ways. A notification survives a missed push; a push is
// what actually gets someone's attention. Lives outside /api so Vercel doesn't
// turn it into a route.
import { sendPush } from "./sendPush.js";

/** Who hears about a broken intake. */
export const INTAKE_WATCHER = "raj";

/** Don't pile on while an unread warning is already sitting there. */
const RENOTIFY_AFTER_HOURS = 12;

export async function raiseIntakeAlert(supabase, { title, body }) {
    const since = new Date(
        Date.now() - RENOTIFY_AFTER_HOURS * 3600000,
    ).toISOString();

    const { count, error: countError } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient", INTAKE_WATCHER)
        .eq("type", "intake_failure")
        .is("read_at", null)
        .gte("created_at", since);

    if (countError) throw countError;
    if ((count ?? 0) > 0) return { alerted: false, reason: "already warned" };

    const { error: insertError } = await supabase.from("notifications").insert({
        recipient: INTAKE_WATCHER,
        type: "intake_failure",
        title,
        body,
        link: "/raj/pipeline",
    });

    if (insertError) throw insertError;

    await sendPush(INTAKE_WATCHER, {
        title,
        body,
        url: "/raj/pipeline",
        tag: "intake-failure",
    });

    return { alerted: true };
}

/**
 * Never let alerting break the thing it's watching. A failed alert is logged
 * and swallowed - the caller is already handling a real error.
 */
export async function tryRaiseIntakeAlert(supabase, payload) {
    try {
        return await raiseIntakeAlert(supabase, payload);
    } catch (err) {
        console.error("Could not raise intake alert:", err);
        return { alerted: false, reason: "alerting failed" };
    }
}