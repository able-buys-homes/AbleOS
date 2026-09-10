// Keeps the installed home-screen app up to date.
//
// Checks every 60 seconds while the app is open, and the moment it returns to
// the foreground. Applies on its own - there is no Update button any more. It takes the new
// version immediately unless somebody is part-way through typing something,
// in which case it waits until they are not.
//
// iOS runs none of this while the PWA is closed, so an update is always
// discovered on the next open at the latest.

import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_MS = 60 * 1000;

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
      // Anything typed into any field counts as work in progress. A residency
      // application is thirteen sections long and lives only in the browser
      // until it is submitted - reloading over it loses all of it, and the
      // person filling it in is standing in a driveway with a resident.
      function midSomething() {
        return Array.from(
          document.querySelectorAll("input, textarea"),
        ).some((el) => (el as HTMLInputElement).value?.trim());
      }

      // Nobody looking, or nothing typed: take it now.
      if (document.hidden || !midSomething()) {
        updateSW(true);
        return;
      }

      // Otherwise wait for a safe moment - when they switch away and back, or
      // when the fields go empty because the form was submitted. Checked on a
      // timer as well, because finishing a form fires no event of its own.
      const timer = window.setInterval(applyWhenSafe, 10_000);
      document.addEventListener("visibilitychange", applyWhenSafe);

      function applyWhenSafe() {
        if (document.hidden) return;
        if (midSomething()) return;

        document.removeEventListener("visibilitychange", applyWhenSafe);
        window.clearInterval(timer);
        updateSW(true);
      }
    },

    onRegisterError(error) {
      console.error("Service worker registration failed:", error);
    },
  });
}
