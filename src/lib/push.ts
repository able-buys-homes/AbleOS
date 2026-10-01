// Browser side of Web Push.
//
// iOS only supports this for PWAs installed to the Home Screen (16.4+), and
// never in a Safari tab - so we detect that and say so rather than failing
// with a cryptic error.

import { apiFetch } from "./apiFetch";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

export type PushState =
  | "unsupported"
  | "needs-install"
  | "default"
  | "granted"
  | "denied";

function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports as Mac with touch
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's non-standard flag
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true
  );
}

/** Base64url to the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function getPushState(): PushState {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // On iOS this is what you get in a Safari tab.
    return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  }

  if (isIos() && !isStandalone()) return "needs-install";

  return Notification.permission as PushState;
}

/** Asks permission, subscribes, and registers the device. Returns the new state. */
export async function enablePush(): Promise<PushState> {
  const state = getPushState();
  if (state === "unsupported" || state === "needs-install") return state;

  if (!VAPID_PUBLIC_KEY) {
    console.error("VITE_VAPID_PUBLIC_KEY is not set");
    return "unsupported";
  }

  // Must be called from a user gesture, which is why this lives behind a button.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission as PushState;

  const registration = await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = subscription.toJSON();

  const res = await apiFetch("/api/push-subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });

  if (!res.ok)
    throw new Error(`Could not register this device (${res.status})`);

  return "granted";
}

/**
 * Re-saves this device's registration without asking anything. Called every
 * time the app opens or comes back to the front, so the server always knows
 * this phone - even after an app update quietly replaced its subscription.
 * Safe to repeat: the server upserts on the endpoint, so there are no
 * duplicates and no double alerts.
 */
export async function syncPush(): Promise<void> {
  try {
    if (getPushState() !== "granted" || !VAPID_PUBLIC_KEY) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));

    const json = subscription.toJSON();

    await apiFetch("/api/push-subscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      }),
    });
  } catch (err) {
    console.warn("Could not refresh this device's push registration", err);
  }
}

/** Unsubscribes this device and forgets it server-side. */
export async function disablePush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  await apiFetch("/api/push-subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}
