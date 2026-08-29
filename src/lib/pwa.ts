// Keeps the installed home-screen app up to date.
//
// Checks every 60 seconds while the app is open, and the moment it returns to
// the foreground. Applies straight away if the app is in the background;
// otherwise it tells the UI so the user can tap Update, and applies on the
// next foreground transition regardless.
//
// iOS runs none of this while the PWA is closed, so an update is always
// discovered on the next open at the latest.

import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_MS = 60 * 1000;

type Listener = (ready: boolean) => void;

const listeners = new Set<Listener>();
let updateReady = false;
let applyUpdate: (() => void) | null = null;

/** Subscribe to "a new version is waiting". Returns an unsubscribe function. */
export function onUpdateReady(listener: Listener) {
  listeners.add(listener);
  listener(updateReady);
  // Braces matter: Set.delete returns a boolean, and React's cleanup
  // function must return void.
  return () => {
    listeners.delete(listener);
  };
}

/** Force the swap now. Reloads the page. */
export function applyPendingUpdate() {
  if (applyUpdate) applyUpdate();
}

function announce(ready: boolean) {
  updateReady = ready;
  listeners.forEach((listener) => listener(ready));
}

export function setupPwaUpdates() {
  const updateSW = registerSW({
    immediate: true,

    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      setInterval(() => {
        if (!document.hidden) registration.update();
      }, UPDATE_CHECK_MS);

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) registration.update();
      });
    },

        onNeedRefresh() {
      applyUpdate = () => updateSW(true);
      // In the background already - just take it.
      if (document.hidden) {
        updateSW(true);
        return;
      }

      // The public site has no update button, so it takes updates silently.
      // The cockpit keeps the prompt: a crew lead mid-upload should decide
      // when the page reloads, not the service worker.
      const publicPaths = ["/", "/sell", "/login"];
      const onPublicSite = publicPaths.includes(window.location.pathname);

      if (onPublicSite) {
        // Unless they are part-way through the deal form. Reloading over a
        // half-typed submission loses a lead, which is worse than being a
        // version behind for another minute.
        const typing = Array.from(
          document.querySelectorAll("input, textarea"),
        ).some((el) => (el as HTMLInputElement).value?.trim());

        if (!typing) {
          updateSW(true);
          return;
        }
      }

      // In use. Offer it, and take it the moment they switch away and back,
      // so a photo upload in progress isn't interrupted.
      announce(true);

      function applyWhenVisible() {
        if (document.hidden) return;
        document.removeEventListener("visibilitychange", applyWhenVisible);
        updateSW(true);
      }

      document.addEventListener("visibilitychange", applyWhenVisible);
    },

    onRegisterError(error) {
      console.error("Service worker registration failed:", error);
    },
  });
}
