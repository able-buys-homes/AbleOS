// src/pages/ElleryApplicants.tsx
// Ellery's applicant pipeline. Oldest first, grouped by who is being waited on.
//
// The grouping is the point. "Your turn" is the only pile that is hers; the
// rest are waiting on a payment, a report, or nothing at all. Without that
// split she re-reads the whole list every time she opens it.
//
// Layout follows the walkthrough mock - list on the left, one applicant open on
// the right. On a narrow screen the open one sits above the list instead, so
// there is never a second column squeezed into a phone.

import React from "react";
import { Link } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ElleryTabBar } from "../components/ElleryTabBar";
import { UserMenu } from "../components/UserMenu";
import { apiFetch } from "../lib/apiFetch";
import { ApplicantCard, type Applicant } from "../features/applicants/parts";
import { ApplicantDetail } from "../features/applicants/ApplicantDetail";

type Counts = {
  received: number;
  your_turn: number;
  screening: number;
  decided_this_week: number;
};

const GROUPS: Array<{ key: Applicant["bucket"]; title: string }> = [
  { key: "turn", title: "Your turn" },
  { key: "report", title: "Waiting on the report" },
  { key: "fee", title: "Waiting on the fee" },
  { key: "decided", title: "Decided this week" },
];

function Tile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "warn" | "good";
}) {
  const colour = {
    neutral: "text-[#0F1E33]",
    primary: "text-[#418BFF]",
    warn: "text-[#C2870B]",
    good: "text-[#166534]",
  }[tone];

  return (
    <div className="rounded-2xl border border-[#DCE4EE] bg-white px-4 py-3.5">
      <p className={`text-[28px] font-bold leading-none ${colour}`}>{value}</p>
      <p className="mt-1.5 text-[12px] font-bold uppercase tracking-[0.07em] text-[#6C7484]">
        {label}
      </p>
    </div>
  );
}

const input =
  "mt-1.5 block w-full min-w-0 appearance-none rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-2.5 text-[15px] text-[#1B2231]";

const label =
  "block text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]";

export function ElleryApplicants() {
  const [applicants, setApplicants] = React.useState<Applicant[] | null>(null);
  const [counts, setCounts] = React.useState<Counts | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/applicants");
      if (res.status === 401) return;

      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load");

      setApplicants(body.applicants ?? []);
      setCounts(body.counts ?? null);
      setProblem("");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not load");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // The id, not the object. After a save the array is replaced, and a stored
  // object would leave the panel showing what the applicant used to be.
  const selected = applicants?.find((a) => a.id === selectedId) ?? null;

  async function save(patch: Record<string, unknown>) {
    if (!selectedId) return;

    setBusy(true);
    setProblem("");
    try {
      const res = await apiFetch(
        `/api/applicants?id=${encodeURIComponent(selectedId)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save");

      await load();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileScreenShell
      headerContent={
        <>
          <div className="flex items-center justify-between">
            <Link aria-label="Return to your cockpit" to="/">
              <img
                alt="Able Buys Homes"
                className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain shadow-sm"
                src="/able-logo.png"
              />
            </Link>
            <UserMenu />
          </div>

          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
            ABLE OS · Transaction coordination
          </p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Applicants
          </h1>
          <p className="mt-2 max-w-md text-[16px] font-medium text-white/85">
            Oldest first. Amber is waiting on you.
          </p>
        </>
      }
    >
      <section
        aria-label="Pipeline"
        className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4"
      >
        <Tile
          label="Received"
          value={counts ? String(counts.received) : "..."}
        />
        <Tile
          label="Your turn"
          tone="warn"
          value={counts ? String(counts.your_turn) : "..."}
        />
        <Tile
          label="Screening"
          tone="primary"
          value={counts ? String(counts.screening) : "..."}
        />
        <Tile
          label="Decided this week"
          tone="good"
          value={counts ? String(counts.decided_this_week) : "..."}
        />
      </section>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-[14px] text-[#6C7484]">
          {applicants ? `${applicants.length} in the pipeline` : "Loading…"}
        </p>
        <button
          className="rounded-[9px] border border-[#1E3A8A] bg-[#1E3A8A] px-3.5 py-2 text-[14px] font-semibold text-white"
          onClick={() => setAdding(true)}
          type="button"
        >
          Log an applicant
        </button>
      </div>

      {problem && (
        <p className="mt-3 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[15px] font-medium text-[#B91C1C]">
          {problem}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        {/* On a phone the open applicant sits above the list rather than
            beside it, and is not rendered at all when nothing is open. */}
        <div
          className={`order-first min-w-0 lg:sticky lg:top-4 lg:order-2 lg:self-start ${
            selected
              ? ""
              : (applicants?.length ?? 0) > 0
                ? "hidden lg:block"
                : "hidden"
          }`}
        >
          {selected ? (
            <ApplicantDetail
              applicant={selected}
              busy={busy}
              onSave={save}
              problem={problem}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-[#DCE4EE] bg-white px-5 py-10 text-center">
              <p className="text-[15px] text-[#8291A5]">
                Pick somebody to see their file.
              </p>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-5 lg:order-1">
          {applicants && applicants.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#DCE4EE] bg-white px-5 py-10 text-center">
              <p className="text-[15px] text-[#8291A5]">
                Nobody in the pipeline.
              </p>
            </div>
          )}

          {GROUPS.map((group) => {
            const rows = (applicants ?? []).filter(
              (a) => a.bucket === group.key,
            );
            if (rows.length === 0) return null;

            return (
              <section key={group.key}>
                <p className="mb-2.5 px-1 text-[12.5px] font-bold uppercase tracking-[0.09em] text-[#6C7484]">
                  {group.title} — {rows.length}
                </p>
                <div className="space-y-2.5">
                  {rows.map((a) => (
                    <ApplicantCard
                      applicant={a}
                      key={a.id}
                      onOpen={() => setSelectedId(a.id)}
                      selected={a.id === selectedId}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {adding && (
        <NewApplicant
          onClose={() => setAdding(false)}
          onDone={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}

      <ElleryTabBar />
    </MobileScreenShell>
  );
}

function NewApplicant({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [portfolio, setPortfolio] = React.useState<"ahtx" | "htm">("ahtx");
  const [name, setName] = React.useState("");
  const [property, setProperty] = React.useState("");
  const [cameIn, setCameIn] = React.useState("");
  const [knows, setKnows] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  async function submit() {
    setBusy(true);
    setProblem("");
    try {
      const res = await apiFetch("/api/applicants", {
        method: "POST",
        body: JSON.stringify({
          portfolio,
          name: name.trim(),
          property_label: property.trim() || null,
          came_in_by: cameIn.trim() || null,
          who_else_knows: knows.trim() || null,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save");

      onDone();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0F1E33]/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(30,58,138,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[#DCE4EE] bg-[#1E3A8A] px-5 py-4">
          <h2 className="text-[18px] font-semibold text-white">
            Log an applicant
          </h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-5">
          <div>
            <label className={label}>Which book</label>
            <select
              className={input}
              onChange={(e) => setPortfolio(e.target.value as "ahtx" | "htm")}
              value={portfolio}
            >
              <option value="ahtx">AHTX</option>
              <option value="htm">Hometown Meadows</option>
            </select>
          </div>

          <div>
            <label className={label}>Who applied</label>
            <input
              className={input}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              type="text"
              value={name}
            />
          </div>

          <div>
            <label className={label}>Which home</label>
            <input
              className={input}
              onChange={(e) => setProperty(e.target.value)}
              placeholder="1920 27th St · Unit A, or Lot 2"
              type="text"
              value={property}
            />
          </div>

          <div>
            <label className={label}>Came in by</label>
            <input
              className={input}
              onChange={(e) => setCameIn(e.target.value)}
              placeholder="Email to apply@, website form, Zo's iPad"
              type="text"
              value={cameIn}
            />
          </div>

          <div>
            <label className={label}>Who else knows</label>
            <input
              className={input}
              onChange={(e) => setKnows(e.target.value)}
              placeholder="Rex copied on arrival"
              type="text"
              value={knows}
            />
          </div>

          {problem && (
            <p className="text-[15px] font-medium text-[#B91C1C]">{problem}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-2.5 border-t border-[#DCE4EE] p-4">
          <button
            className="min-h-[44px] flex-1 rounded-[9px] border border-[#D5D8DE] bg-white text-[15px] font-semibold text-[#1B2231]"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-[44px] flex-1 rounded-[9px] border border-[#1E3A8A] bg-[#1E3A8A] text-[15px] font-semibold text-white disabled:opacity-45"
            disabled={busy || name.trim().length < 2}
            onClick={submit}
            type="button"
          >
            {busy ? "Saving…" : "Log it"}
          </button>
        </div>
      </div>
    </div>
  );
}
