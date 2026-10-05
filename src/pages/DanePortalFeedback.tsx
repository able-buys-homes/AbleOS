// src/pages/DanePortalFeedback.tsx
// Problems residents report about the portal itself. Open ones first; mark
// each fixed once it is dealt with.

import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "lucide-react";
import { NotificationBell } from "../components/NotificationBell";
import { UserMenu } from "../components/UserMenu";
import { apiFetch } from "../lib/apiFetch";

type Report = {
  id: string;
  lot_number: string | null;
  kind: string;
  message: string | null;
  photo_url: string | null;
  page: string | null;
  device: string | null;
  created_at: string;
  resolved_at: string | null;
  area: string | null;
  steps: string | null;
};

const KIND: Record<string, string> = {
  button: "A button doesn't work",
  looks_wrong: "Something looks wrong",
  cant_find: "Can't find something",
  other: "Something else",
};

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DanePortalFeedback() {
  const [open, setOpen] = React.useState<Report[] | null>(null);
  const [resolved, setResolved] = React.useState<Report[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/portal-feedback");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load the reports");
      setOpen(body?.open ?? []);
      setResolved(body?.resolved ?? []);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not load the reports");
    }
  }, []);

  React.useEffect(() => {
    load();
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  async function mark(id: string, isResolved: boolean) {
    setBusyId(id);
    setProblem("");
    try {
      const res = await apiFetch(`/api/portal-feedback?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ resolved: isResolved }),
      });
      if (!res.ok) throw new Error("Could not update that report");
      await load();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not update that report");
    } finally {
      setBusyId(null);
    }
  }

  const Card = ({ r }: { r: Report }) => (
    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold text-[#1B2231]">
            Lot {r.lot_number ?? "?"} — {r.area ? `${r.area}: ` : ""}{KIND[r.kind] ?? r.kind}
          </div>
          <div className="text-[13px] text-[#6C7484]">
            {when(r.created_at)}{r.page ? ` · on ${r.page}` : ""}
          </div>
        </div>
        <button
          className="rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-2 text-[13.5px] font-semibold text-[#1E3A8A] disabled:opacity-50"
          disabled={busyId !== null}
          onClick={() => mark(r.id, !r.resolved_at)}
          type="button"
        >
          {busyId === r.id ? "Saving…" : r.resolved_at ? "Reopen" : "Mark fixed"}
        </button>
      </div>
      {r.message && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[#1B2231]">{r.message}</p>}
      {r.photo_url && (
        <a href={r.photo_url} rel="noreferrer" target="_blank">
          <img alt="What the resident saw" className="mt-3 max-h-64 rounded-xl border border-[#DCE4EE]" src={r.photo_url} />
        </a>
      )}
      {r.steps && (
        <p className="mt-3 rounded-xl bg-[#F2F4F7] px-3 py-2 text-[13px] text-[#4A5464]">
          <span className="font-semibold">What they tapped: </span>{r.steps}
        </p>
      )}
      {r.device && <p className="mt-3 break-words text-[12px] text-[#8A929E]">{r.device}</p>}
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-[#EEF2F6] text-[#1A1A2E]">
      <header className="bg-gradient-to-r from-[#5EC5E8] to-[#3B82C4] text-white shadow-sm">
        <div className="mx-auto max-w-[428px] px-5 pb-8 pt-5 sm:max-w-2xl sm:px-8 sm:pb-10 sm:pt-6 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
          <div className="flex items-center justify-between">
            <Link
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-white/25"
              to="/dane"
            >
              <ArrowLeftIcon aria-hidden="true" size={16} strokeWidth={2.5} />
              Cockpit
            </Link>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">Hometown Meadows MHP</p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Portal problems
          </h1>
          <p className="mt-2 max-w-md text-[18px] font-medium text-white/85">
            What residents told the office isn't working in the portal.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[428px] px-5 pb-14 pt-6 sm:max-w-2xl sm:px-8 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
        {problem && <p className="mb-3 text-[14px] text-[#B91C1C]">{problem}</p>}

        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#6C7484]">
          Open — {open?.length ?? "…"}
        </h2>
        <div className="mt-2 space-y-3">
          {open === null && <p className="text-[15px] text-[#6C7484]">Loading…</p>}
          {open && open.length === 0 && (
            <p className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[15px] text-[#6C7484]">Nothing open. Residents have not reported any problems.</p>
          )}
          {open?.map((r) => <Card key={r.id} r={r} />)}
        </div>

        {resolved.length > 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-bold uppercase tracking-[0.08em] text-[#6C7484]">Fixed recently</h2>
            <div className="mt-2 space-y-3 opacity-80">
              {resolved.map((r) => <Card key={r.id} r={r} />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
