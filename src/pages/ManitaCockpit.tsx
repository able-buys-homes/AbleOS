// src/pages/ManitaCockpit.tsx
// Manita's page. Read-only, one page, top to bottom.
//
// Written for someone who does not live in apps: big type, plain words, no
// tabs, no menus to learn, nothing that changes anything. Every number says
// what it means in a sentence, and colour is only used where something needs
// her attention.

import React from "react";
import { apiFetch } from "../lib/apiFetch";
import { useAuth } from "../lib/AuthProvider";

type Lot = { lot: string; home: string; occupied: boolean; monthly_rent: number | null; owed_today: number; open_jobs: number; next_inspection: string | null };
type Desk = {
  lot_roll?: { lots?: Lot[]; error?: string };
  rent_status?: { charged?: number; collected?: number; outstanding?: number; payments_received?: number; error?: string };
  dates_list?: { critical_dates?: { what: string; due_on: string; overdue: boolean }[]; scheduled_inspections?: { lot: string; due_on: string; overdue: boolean }[]; error?: string };
  documents_and_dates?: { documents?: { total?: number; overdue?: number }; error?: string };
  qbo_sync_status?: { last_payment_synced_at?: string | null; waiting_to_post?: Record<string, number>; errors?: unknown[]; error?: string };
  as_of?: string;
};

const HOME_WORDS: Record<string, string> = {
  occupied: "Lived in",
  ready: "Ready for a new family",
  vacant: "Empty",
  needs_repair: "Needs repairs",
  full_rehab: "Needs a full rebuild",
  moving_out: "Family moving out",
  verify: "Needs checking",
};

const money = (n: number | null | undefined) =>
  `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const dayWords = (iso: string) =>
  new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Tile({ big, label, tone = "plain" }: { big: string; label: string; tone?: "plain" | "good" | "warn" | "bad" }) {
  const tones = {
    plain: "border-[#D5DCE6] bg-white text-[#14213D]",
    good: "border-[#9ED3B4] bg-[#EAF7EF] text-[#14532D]",
    warn: "border-[#F1C98A] bg-[#FFF6E5] text-[#7A4B00]",
    bad: "border-[#F0A8A0] bg-[#FDECEC] text-[#8A1C1C]",
  }[tone];
  return (
    <div className={`rounded-2xl border-2 p-5 ${tones}`}>
      <div className="text-[34px] font-extrabold leading-tight">{big}</div>
      <div className="mt-1 text-[19px] font-semibold leading-snug">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[24px] font-extrabold text-[#14213D]">{title}</h2>
      <div className="rounded-2xl border-2 border-[#D5DCE6] bg-white">{children}</div>
    </section>
  );
}

function Line({ left, right, tone }: { left: string; right: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-[#14532D]" : tone === "warn" ? "text-[#7A4B00]" : tone === "bad" ? "text-[#8A1C1C]" : "text-[#14213D]";
  return (
    <div className="flex items-center justify-between gap-4 border-t-2 border-[#EEF1F5] px-5 py-4 text-[20px] first:border-t-0">
      <span className="text-[#14213D]">{left}</span>
      <span className={`text-right font-bold ${color}`}>{right}</span>
    </div>
  );
}

const Quiet = ({ children }: { children: React.ReactNode }) => (
  <div className="px-5 py-4 text-[19px] text-[#4A5568]">{children}</div>
);

export function ManitaCockpit() {
  const { profile, signOut } = useAuth();
  const [desk, setDesk] = React.useState<Desk | null>(null);
  const [problem, setProblem] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setProblem("");
    try {
      const res = await apiFetch("/api/manita-desk");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "This page could not load. Please try again in a minute.");
      setDesk(body);
    } catch (e: any) {
      setProblem(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const lots = (desk?.lot_roll?.lots ?? []).filter((l) => l.home !== "common_area" && /^\d+$/.test(l.lot));
  const lived = lots.filter((l) => l.occupied);
  const notPaid = lived.filter((l) => Number(l.owed_today) > 0);
  const toCollect = notPaid.reduce((a, l) => a + Number(l.owed_today), 0);
  // Money owed on homes nobody lives in now (moved out, or not on the site plan).
  // Kept apart so the families listed add up to the number on the tile.
  const leftOwed = (desk?.lot_roll?.lots ?? []).filter((l) => !l.occupied && Number(l.owed_today) > 0);
  const leftTotal = leftOwed.reduce((a, l) => a + Number(l.owed_today), 0);
  const rent = desk?.rent_status ?? {};
  const jobs = lots.filter((l) => l.open_jobs > 0);
  const qbo = desk?.qbo_sync_status ?? {};
  const qboWaiting = Object.values(qbo.waiting_to_post ?? {}).reduce((a, b) => a + Number(b || 0), 0);
  const qboOk = !qbo.error && !(qbo.errors ?? []).length;
  const homes = Object.entries(
    lots.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.home]: (acc[l.home] ?? 0) + 1 }), {}),
  ).sort((a, b) => b[1] - a[1]);
  const inspections = desk?.dates_list?.scheduled_inspections ?? [];
  const dates = desk?.dates_list?.critical_dates ?? [];
  const docs = desk?.documents_and_dates?.documents ?? {};
  const first = (profile?.full_name ?? "").split(" ")[0] || "there";

  return (
    <div className="min-h-screen w-full bg-[#F4F6F9] text-[#14213D]">
      <header className="bg-[#1E3A8A] text-white">
        <div className="mx-auto max-w-3xl px-6 pb-8 pt-8">
          <div className="text-[18px] opacity-90">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
          <h1 className="mt-1 text-[36px] font-extrabold leading-tight">{greeting()}, {first}</h1>
          <p className="mt-2 text-[20px] leading-snug opacity-95">
            Here is how Hometown Meadows is doing today. This page is for reading only - nothing you press here can change anything.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16">
        {problem && (
          <div className="mt-6 rounded-2xl border-2 border-[#F0A8A0] bg-[#FDECEC] p-5 text-[20px] font-semibold text-[#8A1C1C]">
            {problem}
          </div>
        )}
        {loading && !desk && <div className="mt-8 text-[22px]">Loading, one moment…</div>}

        {desk && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Tile big={`${lived.length} of ${lots.length}`} label="homes have a family living in them" />
              <Tile big={money(rent.collected)} label={`rent collected this month, out of ${money(rent.charged)}`} tone="good" />
              <Tile
                big={money(toCollect)}
                label={notPaid.length ? `still to collect from ${notPaid.length} ${notPaid.length === 1 ? "family" : "families"}` : "still to collect"}
                tone={toCollect > 0 ? "warn" : "good"}
              />
              <Tile
                big={qboOk ? "Up to date" : "Needs a look"}
                label={qboOk ? `QuickBooks is keeping up${qboWaiting ? ` (${qboWaiting} waiting for the next hourly update)` : ""}` : "QuickBooks has a problem - Dane has been told"}
                tone={qboOk ? "good" : "bad"}
              />
            </div>

            <Section title="Rent this month">
              {lived.length === 0 && <Quiet>No rent to show yet.</Quiet>}
              {lived.map((l) => (
                <Line
                  key={l.lot}
                  left={`Lot ${l.lot}`}
                  right={Number(l.owed_today) > 0 ? `${money(l.owed_today)} not paid yet` : "Paid"}
                  tone={Number(l.owed_today) > 0 ? "warn" : "good"}
                />
              ))}
              {leftTotal > 0 && (
                <Quiet>
                  Also owed by people no longer living here: {money(leftTotal)} (
                  {leftOwed.map((l) => (/^\d+$/.test(l.lot) ? `Lot ${l.lot}` : l.lot)).join(", ")}).
                </Quiet>
              )}
            </Section>

            <Section title="The homes">
              {homes.map(([home, n]) => (
                <Line key={home} left={HOME_WORDS[home] ?? home} right={`${n} ${n === 1 ? "home" : "homes"}`} />
              ))}
            </Section>

            <Section title="Repairs being worked on">
              {jobs.length === 0 ? (
                <Quiet>No repairs open right now.</Quiet>
              ) : (
                jobs.map((l) => (
                  <Line key={l.lot} left={`Lot ${l.lot}`} right={`${l.open_jobs} ${l.open_jobs === 1 ? "repair" : "repairs"} open`} />
                ))
              )}
            </Section>

            <Section title="Home checks (inspections)">
              {inspections.length === 0 ? (
                <Quiet>No home checks booked.</Quiet>
              ) : (
                inspections.map((i) => (
                  <Line
                    key={`${i.lot}-${i.due_on}`}
                    left={`Lot ${i.lot}`}
                    right={i.overdue ? `Was due ${dayWords(i.due_on)} - not done yet` : dayWords(i.due_on)}
                    tone={i.overdue ? "bad" : undefined}
                  />
                ))
              )}
            </Section>

            <Section title="Important dates and paperwork">
              {dates.length === 0 && !docs.total ? (
                <Quiet>Nothing waiting right now.</Quiet>
              ) : (
                <>
                  {dates.map((d) => (
                    <Line key={`${d.what}-${d.due_on}`} left={d.what} right={d.due_on ? dayWords(d.due_on) : "No date"} tone={d.overdue ? "bad" : undefined} />
                  ))}
                  {Boolean(docs.total) && (
                    <Line
                      left="Papers waiting to be signed or finished"
                      right={`${docs.total}${docs.overdue ? ` (${docs.overdue} late)` : ""}`}
                      tone={docs.overdue ? "bad" : undefined}
                    />
                  )}
                </>
              )}
            </Section>
          </>
        )}

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            className="rounded-2xl bg-[#1E3A8A] px-6 py-5 text-[22px] font-bold text-white disabled:opacity-60"
            disabled={loading}
            onClick={load}
            type="button"
          >
            {loading ? "Updating…" : "Show the latest"}
          </button>
          <button
            className="rounded-2xl border-2 border-[#1E3A8A] bg-white px-6 py-5 text-[22px] font-bold text-[#1E3A8A]"
            onClick={signOut}
            type="button"
          >
            Sign out
          </button>
        </div>
        {desk?.as_of && (
          <p className="mt-6 text-center text-[17px] text-[#4A5568]">
            Last updated {new Date(desk.as_of).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}
          </p>
        )}
      </main>
    </div>
  );
}
