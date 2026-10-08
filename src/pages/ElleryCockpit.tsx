// src/pages/ElleryCockpit.tsx
// Documents & Dates - one dated list, overdue first (Raj, v1: read-only).
// Same data as the dates_list MCP tool, so this page and Raj's AI agree.
// Editing and uploads are v2. The documents pipeline and deals feed were removed on
// 15 Sep 2026 to clear the way; both are still in
// src/features/documents and src/features/pipeline if they come back.

import { Link } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ElleryTabBar } from "../components/ElleryTabBar";
import { UserMenu } from "../components/UserMenu";
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/apiFetch";

type DateEntry = { kind: string; what: string; book: string | null; due_on: string | null; overdue: boolean };

function dueWords(iso: string) {
  return new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function daysAway(iso: string) {
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) + "T12:00:00").getTime();
  return Math.round((new Date(iso.slice(0, 10) + "T12:00:00").getTime() - today) / 86400000);
}

function DateGroup({ title, color, items }: { title: string; color: string; items: DateEntry[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.08em]" style={{ color }}>
        {title} · {items.length}
      </h2>
      <div className="divide-y divide-[#E3E8EF] rounded-2xl border border-[#DCE4EE] bg-white">
        {items.map((e, i) => {
          const d = e.due_on ? daysAway(e.due_on) : null;
          return (
            <div className="flex items-start justify-between gap-3 px-4 py-3.5" key={e.kind + e.what + i}>
              <div className="min-w-0">
                <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#8291A5]">
                  {e.kind}
                  {e.book ? " · " + e.book.toUpperCase() : ""}
                </div>
                <div className="mt-0.5 text-[15.5px] font-semibold text-[#1A1A2E]">{e.what}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[14px] font-bold" style={{ color: e.overdue ? "#B91C1C" : "#1A1A2E" }}>
                  {e.due_on ? dueWords(e.due_on) : "No date"}
                </div>
                {d != null && (
                  <div className="text-[12.5px]" style={{ color: e.overdue ? "#B91C1C" : "#6C7484" }}>
                    {d < 0 ? -d + " days late" : d === 0 ? "Today" : "in " + d + " days"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DatesList() {
  const [entries, setEntries] = useState<DateEntry[] | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r: any = await apiFetch("/api/ellery-dates");
        const b: any = typeof r?.json === "function" ? await r.json().catch(() => ({})) : r;
        if (r?.ok === false) throw new Error(b?.error || "Could not load the dates");
        const list: DateEntry[] = [
          ...(b?.scheduled_inspections ?? []).map((x: any) => ({ kind: "Home check", what: "Lot " + x.lot, book: x.book ?? null, due_on: x.due_on ?? null, overdue: Boolean(x.overdue) })),
          ...(b?.open_documents ?? []).map((x: any) => ({ kind: "Document", what: [x.type, x.stage].filter(Boolean).join(" - ") || "Document", book: x.book ?? null, due_on: x.due_on ?? null, overdue: Boolean(x.overdue) })),
          ...(b?.critical_dates ?? []).map((x: any) => ({ kind: "Date", what: x.what || x.label || "Date", book: x.book ?? null, due_on: x.due_on ?? null, overdue: Boolean(x.overdue) })),
        ];
        list.sort((a, c) => String(a.due_on ?? "9999").localeCompare(String(c.due_on ?? "9999")));
        setEntries(list);
      } catch (e: any) {
        setProblem(e?.message || "Could not load the dates");
      }
    })();
  }, []);

  const all = entries ?? [];
  const late = all.filter((e) => e.overdue);
  const soon = all.filter((e) => !e.overdue && e.due_on && daysAway(e.due_on) <= 14);
  const later = all.filter((e) => !e.overdue && e.due_on && daysAway(e.due_on) > 14);
  const noDate = all.filter((e) => !e.due_on);

  return (
    <div className="pt-2">
      {problem && <div className="mt-4 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[15px] text-[#B91C1C]">{problem}</div>}
      {!entries && !problem && <p className="mt-6 text-[15px] text-[#6C7484]">Loading…</p>}
      {entries && entries.length === 0 && (
        <div className="mt-6 rounded-2xl border border-[#DCE4EE] bg-white p-5 text-[15px] leading-relaxed text-[#526176]">
          Nothing late, due or coming. When a document, a key date or a home check is added, it shows up here, soonest first.
        </div>
      )}
      <DateGroup items={late} title="Late" color="#B91C1C" />
      <DateGroup items={soon} title="Due in the next 14 days" color="#92600A" />
      <DateGroup items={later} title="Coming later" color="#1E3A8A" />
      <DateGroup items={noDate} title="No date set" color="#6C7484" />
      {entries && entries.length > 0 && (
        <p className="mt-4 text-[12.5px] text-[#8291A5]">Read-only. Home checks are booked by Zo from his map.</p>
      )}
    </div>
  );
}

export function ElleryCockpit() {
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
            Documents &amp; Dates
          </h1>

          <p className="mt-2 max-w-md text-[16px] font-medium text-white/85">
            What is late, what is due, and what is coming.
          </p>
        </>
      }
    >
      <DatesList />

      <footer className="pt-10 text-center text-[16px] font-medium tracking-[0.12em] text-[#8291A5]">
        Able OS
      </footer>

      <ElleryTabBar />
    </MobileScreenShell>
  );
}