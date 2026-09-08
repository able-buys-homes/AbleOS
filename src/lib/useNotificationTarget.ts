import React from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Notifications carry their destination as query params, e.g.
 * /raj?task=<id>&chat=1 or /jeremiah?stage=<notion page id>.
 *
 * Query params rather than router state, so a push notification tapped on a
 * phone lands on the right thing too, and a refresh does not lose it.
 */
export type NotificationTarget = {
  task: string | null;
  /** Open the message thread rather than just the task list. */
  chat: boolean;
  order: string | null;
  stage: string | null;
  daneTask: string | null;
  /** A filed unit inspection to open in Raj's Unit Inspections card. */
  inspection: string | null;
  /** A work order to open in the Open work orders card. */
  job: string | null;
  /** A lot to open — a database id on Rent, a lot number on the Map. */
  lot: string | null;
  /** A payment plan to bring into view. */
  plan: string | null;
  /** Which tab a screen should land on, e.g. "plans" on Rent. */
  tab: string | null;
};

/** Bring a section heading into view once a notification lands on the page. */
export function scrollToSection(id: string) {
  // Wait a frame so the section has rendered before measuring it.
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

export function useNotificationTarget() {
  const [params, setParams] = useSearchParams();

  const task = params.get("task");
  const chat = params.get("chat") === "1";
  const order = params.get("order");
  const stage = params.get("stage");
  const daneTask = params.get("danetask");
  const inspection = params.get("inspection");
  const job = params.get("job");
  const lot = params.get("lot");
  const plan = params.get("plan");
  const tab = params.get("tab");
  const target: NotificationTarget = React.useMemo(
    () => ({ task, chat, order, stage, daneTask, inspection, job, lot, plan, tab }),
    [chat, daneTask, inspection, job, lot, order, plan, stage, tab, task],
  );
  const hasTarget = Boolean(
    task || order || stage || daneTask || inspection || job || lot || plan || tab,
  );

  /**
   * Call once the cockpit has opened the right thing, so the param does not
   * reopen it every render and the URL goes back to being clean.
   */
  const clear = React.useCallback(() => {
    setParams(new URLSearchParams(), { replace: true });
  }, [setParams]);

  return { clear, hasTarget, target };
}
