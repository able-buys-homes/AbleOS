// src/features/pipeline/IntakeStatus.tsx
// A quiet line that answers "is the intake still working?" without anyone
// having to ask. Turns red once nothing has arrived for a day.

import React from "react";
import { AlertTriangleIcon, InboxIcon } from "lucide-react";
import { apiFetch } from "../../lib/apiFetch";

type Health = {
  lastIntakeAt: string | null;
  hoursSince: number | null;
  stale: boolean;
};

function describe(hours: number | null) {
  if (hours === null) return "never";
  if (hours < 1) return "less than an hour ago";
  if (hours < 2) return "an hour ago";
  if (hours < 24) return `${Math.round(hours)} hours ago`;

  const days = Math.round(hours / 24);
  return days === 1 ? "a day ago" : `${days} days ago`;
}

export function IntakeStatus() {
  const [health, setHealth] = React.useState<Health | null>(null);

  React.useEffect(() => {
    let live = true;

    apiFetch("/api/intake-health")
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (live && body) setHealth(body);
      })
      .catch(() => {
        // Silent. A broken status line must never look like a broken intake.
      });

    return () => {
      live = false;
    };
  }, []);

  if (!health) return null;

  const Icon = health.stale ? AlertTriangleIcon : InboxIcon;

  return (
    <p
      className={`flex items-center gap-1.5 pt-3 text-[14px] font-medium ${
        health.stale ? "text-[#D95717]" : "text-[#8291A5]"
      }`}
    >
      <Icon aria-hidden="true" size={13} strokeWidth={2.5} />
      {health.stale
        ? `No deals have arrived since ${describe(health.hoursSince)} — the intake may have stopped`
        : `Last deal email received ${describe(health.hoursSince)}`}
    </p>
  );
}
