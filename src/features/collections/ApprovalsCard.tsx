// src/features/collections/ApprovalsCard.tsx
// Entry point to /raj/approvals from Raj's cockpit.
//
// Navigates rather than opening a modal, on purpose: the route is already the
// deep-link target for the push notification, and a second copy of the queues
// in a modal would be two things to keep in step.
import React from "react";
import { useNavigate } from "react-router-dom";
import { GavelIcon } from "lucide-react";
import { NavCard } from "../../components/NavCard";
import { apiFetch } from "../../lib/apiFetch";

const POLL_MS = 30_000;

export function CollectionsApprovalsCard({
  divider = false,
}: {
  divider?: boolean;
}) {
  const navigate = useNavigate();
  const [waiting, setWaiting] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/collections?view=raj");
      if (!res.ok) return;
      const body = await res.json();
      setWaiting((body.verify?.length ?? 0) + (body.approve?.length ?? 0));
    } catch {
      // A failed count must not blank the card - leave the last known number.
    }
  }, []);

  React.useEffect(() => {
    load();

    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);

    function onVisible() {
      if (!document.hidden) load();
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  return (
    <NavCard
      count={waiting}
      divider={divider}
      icon={<GavelIcon aria-hidden="true" size={17} strokeWidth={2.5} />}
      onClick={() => navigate("/raj/approvals")}
      subtitle="Balances to verify and plans to approve"
      title="Collections"
      tone={waiting ? "orange" : "green"}
      variant="card"
    />
  );
}
