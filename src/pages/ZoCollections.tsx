// src/pages/ZoCollections.tsx
// Zo's collections screen. Three tabs - rent roll, payment plans, notices to
// post. Raj's approval queue is deliberately not here: it lives at
// /raj/approvals, and a queue Zo can see but cannot act on would be a dead
// button with residents' names on it.
//
// Structure, wording and behaviour are ported from zo-collections-mock.html
// unchanged. The copy is the training - it is written for someone standing in
// a gravel driveway on a phone, so none of it is shortened here.
import React from "react";
import { useNavigate } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ZoScreenHeader } from "../components/ZoScreenHeader";
import { ZoTabBar } from "../components/ZoTabBar";
import { apiFetch } from "../lib/apiFetch";
import { useNotificationTarget } from "../lib/useNotificationTarget";
import {
  Btn,
  Item,
  Note,
  Pill,
  SectionBar,
  Stack,
  Tag,
  Toast,
  money,
} from "../features/collections/parts";
import { ApplicationsCard } from "../features/applications/ApplicationsCard";
import { planTerms } from "../features/collections/planTerms";
import { Sheets } from "../features/collections/Sheets";
import { ProofSheet } from "../features/collections/ProofSheet";

type Lot = {
  id: string;
  lot_number: string;
  tenant_name: string | null;
  tenancy_type: "park_owned" | "lot_only" | null;
  hap_household: boolean;
  contract_rent: string | number | null;
  /** True when contract_rent is a stand-in nobody has confirmed yet. */
  rent_placeholder: boolean;
  tenant_portion: string | number | null;
  occupied: boolean;
  is_sample: boolean;
  paid_this_month: boolean;
  has_ledger: boolean;
  notes: string | null;
  last_payment: {
    amount: string | number;
    received_at: string;
    method: string | null;
    receipt_number: string | null;
  } | null;
  owed: number;
  verified: boolean;
  locked: boolean;
  active_plan: { id: string; status: string } | null;
  pending_plan: { id: string; status: string } | null;
  latest_notice: { id: string; posted_at: string | null } | null;
  rent_set_by: string | null;
  rent_confirmed_at: string | null;
  is_late: boolean;
  month_charged: number;
  month_paid: number;
  plan_progress: {
    count: number;
    total: number;
    paid: number;
    remaining: number;
    next_number: number | null;
    next_due: string | null;
    next_amount: number | null;
  } | null;
};

type Payload = {
  tiles: {
    occupied: number;
    collected: number;
    pastDue: number;
    deadline: { lot: string; date: string } | null;
  };
  pastDue: Lot[];
  withCounsel: Lot[];
  current: Lot[];
  plans: { awaiting: any[]; active: any[] };
  notices: { toPost: any[]; posted: any[] };
};

type Tab = "roll" | "pay" | "plans" | "notices";

// The blank Application for Residency, as a printable PDF. Left empty until
// the file has a permanent home - an empty string disables the button rather
// than handing Zo a link that 404s while a prospective resident watches.
const BLANK_APPLICATION_URL = "";

function statusOf(lot: Lot) {
  if (lot.locked) return { tone: "filed" as const, label: "Filed" };
  if (!lot.occupied) return { tone: "vacant" as const, label: "Vacant" };
  if (lot.active_plan) return { tone: "plan" as const, label: "On a plan" };
  if (lot.latest_notice?.posted_at)
    return { tone: "notice" as const, label: "Posted" };
  if (lot.latest_notice)
    return { tone: "notice" as const, label: "Notice ready" };
  // Owing and being late are different states and must not share a word.
  // "Past due" on the 3rd tells Zo to chase someone who has two days left.
  if (lot.owed > 0)
    return lot.is_late
      ? { tone: "late" as const, label: "Late" }
      : { tone: "plan" as const, label: "Due" };
  if (lot.paid_this_month) return { tone: "ok" as const, label: "Paid" };
  return { tone: "late" as const, label: "Not paid" };
}

function tenancyLabel(lot: Lot) {
  if (lot.hap_household) return "Housing assistance";
  if (lot.tenancy_type === "lot_only") return "Lot only — tenant owns the home";
  if (lot.tenancy_type === "park_owned") return "Park-owned home";
  return null;
}

export function ZoCollections() {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<Tab>("roll");
  const [data, setData] = React.useState<Payload | null>(null);
  const [problem, setProblem] = React.useState("");
  const [toast, setToast] = React.useState<{ msg: string; stop?: boolean }>({
    msg: "",
  });
  // Which group a tile opened. A modal rather than a scroll: the last section
  // on the page cannot reach the top of the screen, so tapping Paid used to
  // move the page barely at all and read as a broken button.
  const [kpi, setKpi] = React.useState<null | "late" | "plan" | "paid">(null);

  const [sheet, setSheet] = React.useState<
    null | "pay" | "plan" | "post" | "rent"
  >(null);
  const [sheetLot, setSheetLot] = React.useState<Lot | null>(null);
  const [proofId, setProofId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/collections");
      if (res.status === 401) return;

      // A dev server answers unknown /api paths with the app's own HTML, and
      // a proxy or a sign-in page can do the same in production. Trusting a
      // 200 without checking what came back is how this screen went blank.
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("application/json")) {
        throw new Error(
          "The rent data did not come back. Nothing has been changed. Pull down to try again, or tell Dane if it keeps happening.",
        );
      }

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Could not load collections");
      }
      if (!body?.tiles) {
        throw new Error(
          "The rent data came back incomplete, so nothing is shown rather than showing you half of it. Nothing has been changed.",
        );
      }

      setData(body);
    } catch (err) {
      setProblem(
        err instanceof Error ? err.message : "Could not load collections",
      );
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  /* Notifications deep-link into here, e.g. /zo/collections?tab=plans */
  const { clear, target } = useNotificationTarget();

  React.useEffect(() => {
    if (!target.tab) return;

    // Only tabs that exist. A param naming something else would leave the
    // screen showing nothing and Zo with no way to tell why.
    if (["roll", "pay", "plans", "notices"].includes(target.tab)) {
      setTab(target.tab as Tab);
      window.scrollTo(0, 0);
    }

    clear();
  }, [clear, target.tab]);

  function say(msg: string, stop?: boolean) {
    setToast({ msg, stop });
    window.setTimeout(() => setToast({ msg: "" }), 4200);
  }

  function openSheet(kind: "pay" | "plan" | "post" | "rent", lot?: Lot) {
    // Close the group modal first. Two overlays on top of each other leaves
    // Zo tapping a form he cannot see the edges of.
    setKpi(null);
    setSheetLot(lot ?? null);
    setSheet(kind);
  }

  const tiles = data?.tiles;

  // Grouped the way Zo reads the roll. A lot on an approved plan is not
  // "late" - it has terms Raj agreed to, and filing it under Late is how a
  // resident doing exactly what was asked of them gets chased anyway.
  const everyone = [...(data?.pastDue ?? []), ...(data?.current ?? [])];

  // A plan that has been paid off is not an ongoing plan. Leaving it under
  // "On a plan" showing zero tells Zo there is still something to collect
  // from somebody who has finished paying.
  const onPlan = everyone.filter(
    (lot) => lot.active_plan && (lot.plan_progress?.remaining ?? 0) > 0,
  );
  const planFinished = everyone.filter(
    (lot) => lot.active_plan && (lot.plan_progress?.remaining ?? 0) <= 0,
  );
  const late = (data?.pastDue ?? []).filter(
    (lot) => !lot.active_plan && lot.is_late,
  );
  // Owes rent, but the 5th has not passed. Not late — so these belong with
  // the people who simply have not paid yet, not in a section that reads as
  // the first step towards eviction.
  const dueNotLate = (data?.pastDue ?? []).filter(
    (lot) => !lot.active_plan && !lot.is_late,
  );
  // An empty home is not a resident who paid. Counting it as one inflates
  // the tile and makes a bad month look like a good one.
  // Split on a logged payment, not on a balance. There is no ledger for the
  // real residents yet, so every balance is zero - and calling that "paid"
  // would report seventeen people as square when nothing is known about any
  // of them.
  const settled = (data?.current ?? []).filter(
    (lot) => !lot.active_plan && lot.occupied,
  );
  const paid = [
    ...planFinished,
    ...settled.filter((lot) => lot.paid_this_month),
  ];

  const kpiRows =
    kpi === "late" ? late : kpi === "plan" ? onPlan : kpi === "paid" ? paid : [];
  const notPaid = [
    ...dueNotLate,
    ...settled.filter((lot) => !lot.paid_this_month),
  ];
  const vacant = (data?.current ?? []).filter(
    (lot) => !lot.active_plan && !lot.occupied,
  );

  // Nothing can generate a notice today, so an empty tab is a door to an
  // empty room. Hidden until there is something behind it - the screen and
  // the posting flow underneath it stay built and come back on their own.
  const hasNotices = Boolean(
    data && (data.notices.toPost.length > 0 || data.notices.posted.length > 0),
  );

  const tabs: [Tab, string][] = [
    ["roll", "Who's paid"],
    ["pay", "Take payment"],
    ["plans", "Plans"],
  ];
  if (hasNotices) tabs.push(["notices", "Notices"]);

  return (
    <MobileScreenShell
      headerContent={
        <>
          <ZoScreenHeader
            eyebrow="Hometown Meadows MHP"
            subtitle="Who has paid, who owes, and who is late."
            title="Rent"
          />

          {/* Pills rather than an underline, from the mock. Scrolls sideways
              instead of wrapping, so a fourth tab cannot push the roll off the
              screen. */}
          <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {tabs.map(([key, label]) => (
              <button
                aria-selected={tab === key}
                className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors ${
                  tab === key
                    ? "border-[#FF7832] bg-[#FF7832] text-white"
                    : "border-white/35 bg-white/10 text-white/85"
                }`}
                key={key}
                onClick={() => {
                  setTab(key);
                  window.scrollTo(0, 0);
                }}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className="pb-2">
        {problem && (
          <div className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[16px] text-[#B91C1C]">
            {problem}
          </div>
        )}

        {/* ---------------- RENT ROLL ---------------- */}
        {tab === "roll" && data && (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Tile
                l="Late"
                n={String(late.length)}
                onClick={() => setKpi("late")}
                tone="late"
              />
              <Tile
                l="On a plan"
                n={String(onPlan.length)}
                onClick={() => setKpi("plan")}
                tone="plan"
              />
              <Tile
                l="Paid"
                n={String(paid.length)}
                onClick={() => setKpi("paid")}
                tone="paid"
              />
            </div>

            {/* Kept out of the three-across row on purpose. A court deadline
                is not a count and must not read like one. */}
            {tiles!.deadline && (
              <div className="mt-2.5">
                <Tile
                  l={`Lot ${tiles!.deadline.lot} objection deadline`}
                  n={daysUntil(tiles!.deadline.date)}
                  tone="flag"
                />
              </div>
            )}

            <p className="mt-3.5 text-[14px] text-[#6C7484]">
              Tap a name to see what they owe or to take a payment.
            </p>

            {/* Always on screen now, so the section exists where the mock puts
                it. The empty line says why it is empty. It must never read as
                "nobody is late" - that is a claim about the residents, and
                this is a gap in the records. */}
            <SectionBar count={late.length} title="Late" />
            <Stack>
              {late.length === 0 && (
                <div className="p-4 text-[15px] text-[#6C7484]">
                  Nobody is late. Each resident pays on the day of the month
                  they moved in, gets five days after that, and a $75 fee
                  applies from the sixth. A lot with no rent or no due day
                  recorded cannot appear here at all.
                </div>
              )}
              {late.map((lot) => (
                <LotRow
                  key={lot.id}
                  lot={lot}
                  onPay={() => openSheet("pay", lot)}
                  onPlan={() => openSheet("plan", lot)}
                  onPost={() => openSheet("post", lot)}
                  onSetRent={() => openSheet("rent", lot)}
                  onProof={setProofId}
                />
              ))}
            </Stack>

            <SectionBar count={notPaid.length} title="Not paid yet" />
            <Stack>
              {notPaid.length === 0 && (
                <div className="p-4 text-[15px] text-[#6C7484]">
                  Everyone has paid this month.
                </div>
              )}
              {notPaid.map((lot) => (
                <LotRow
                  key={lot.id}
                  lot={lot}
                  onPay={() => openSheet("pay", lot)}
                  onPlan={() => openSheet("plan", lot)}
                  onPost={() => openSheet("post", lot)}
                  onSetRent={() => openSheet("rent", lot)}
                  onProof={setProofId}
                />
              ))}
            </Stack>

            {data.withCounsel.length > 0 && (
              <>
                <SectionBar
                  count={data.withCounsel.length}
                  title="With Barrett"
                />
                <Stack>
                  {data.withCounsel.map((lot) => (
                    <div className="p-4" key={lot.id}>
                      <LotHead lot={lot} />
                      <div className="mt-3 text-[22px] font-bold tracking-[-0.02em]">
                        {money(lot.owed)}
                      </div>
                      {tenancyLabel(lot) && <Tag>{tenancyLabel(lot)}</Tag>}
                      <div className="mt-3.5">
                        <Btn disabled>Locked — with counsel</Btn>
                      </div>
                      <Note stop title="Do not take money on this lot">
                        Once the file is with Barrett, accepting a payment or
                        making an arrangement can get the case dismissed. If the
                        resident offers you anything, send it to Raj and say
                        nothing else.
                      </Note>
                    </div>
                  ))}
                </Stack>
              </>
            )}

            <SectionBar count={onPlan.length} title="On a plan" />
            <Stack>
              {onPlan.length === 0 && (
                <div className="p-4 text-[15px] text-[#6C7484]">
                  Nobody is on a payment plan right now.
                </div>
              )}
              {onPlan.map((lot) => (
                <LotRow
                  key={lot.id}
                  lot={lot}
                  onPay={() => openSheet("pay", lot)}
                  onPlan={() => openSheet("plan", lot)}
                  onPost={() => openSheet("post", lot)}
                  onSetRent={() => openSheet("rent", lot)}
                  onProof={setProofId}
                />
              ))}
            </Stack>

            <SectionBar count={paid.length} title="Paid" />
            <Stack>
              {paid.map((lot) => (
                <LotRow
                  key={lot.id}
                  lot={lot}
                  onPay={() => openSheet("pay", lot)}
                  onPlan={() => openSheet("plan", lot)}
                  onPost={() => openSheet("post", lot)}
                  onSetRent={() => openSheet("rent", lot)}
                  onProof={setProofId}
                />
              ))}
            </Stack>

            {vacant.length > 0 && (
              <>
                <SectionBar count={vacant.length} title="Empty" />
                <Stack>
                  {vacant.map((lot) => (
                    <LotRow
                      key={lot.id}
                      lot={lot}
                      onPay={() => openSheet("pay", lot)}
                      onPlan={() => openSheet("plan", lot)}
                      onPost={() => openSheet("post", lot)}
                      onSetRent={() => openSheet("rent", lot)}
                      onProof={setProofId}
                    />
                  ))}
                </Stack>
              </>
            )}

            <SectionBar title="New resident?" />
            <Stack>
              <div className="p-4">
                <div className="text-[16px] font-bold tracking-[-0.01em]">
                  Application for residency
                </div>
                <p className="mt-1 text-[13.5px] text-[#6C7484]">
                  Fill it in with them standing there. It saves when you
                  submit — nothing is kept if you close it half done.
                </p>
                <div className="mt-3.5 flex flex-wrap gap-2.5">
                  <Btn onClick={() => navigate("/zo/apply")} variant="primary">
                    Fill it in here
                  </Btn>
                  {BLANK_APPLICATION_URL ? (
                    <Btn
                      onClick={() =>
                        window.open(BLANK_APPLICATION_URL, "_blank")
                      }
                      variant="primary"
                    >
                      Print a blank one
                    </Btn>
                  ) : (
                    <Btn disabled>Print a blank one</Btn>
                  )}
                </div>
              </div>

              {/* What he has already taken, under the button that takes them.
                  The form used to be a one-way door. */}
              <ApplicationsCard />
            </Stack>
          </>
        )}

        {/* ---------------- TAKE PAYMENT ---------------- */}
        {tab === "pay" && data && (
          <Sheets
            data={data}
            inline
            kind="pay"
            lot={null}
            onClose={() => setTab("roll")}
            onDone={(msg) => {
              setTab("roll");
              say(msg);
              load();
            }}
          />
        )}

        {/* ---------------- PLANS ---------------- */}
        {tab === "plans" && data && (
          <>
            <SectionBar
              count={data.plans.awaiting.length}
              title="Waiting on Raj"
            />
            <Stack>
              {data.plans.awaiting.length === 0 && (
                <div className="p-4 text-[15px] text-[#6C7484]">
                  Nothing waiting.
                </div>
              )}
              {data.plans.awaiting.map((p) => (
                <Item
                  awaiting
                  key={p.id}
                  lines={planTerms(p)}
                  meta={`Proposed ${when(p.proposed_at)} by ${p.proposed_by ?? "someone"}`}
                  title={planTitle(p, data)}
                >
                  <Note>
                    You cannot print anything or collect a signature until Raj
                    approves. The document does not exist yet.
                  </Note>
                  <div className="mt-3.5">
                    <Btn disabled>Waiting on approval</Btn>
                  </div>
                </Item>
              ))}
            </Stack>

            <SectionBar count={data.plans.active.length} title="Active plans" />
            <Stack>
              {data.plans.active.length === 0 && (
                <div className="p-4 text-[15px] text-[#6C7484]">
                  No active plans.
                </div>
              )}
                            {data.plans.active.map((p) => {
                // Progress comes off the lot, not the plan - the lot is where
                // the payments are counted, and two places counting the same
                // money is how they end up disagreeing.
                const lot = lotOf(p.lot_id, data);
                const pp = lot?.plan_progress ?? null;

                const rows = [...(p.plan_installments ?? [])].sort(
                  (a: any, b: any) =>
                    String(a.due_date).localeCompare(String(b.due_date)),
                );

                const each = rows[0] ? Number(rows[0].amount) : 0;
                const pct =
                  pp && pp.total > 0
                    ? Math.min(100, Math.round((pp.paid / pp.total) * 100))
                    : 0;

                return (
                  <Item
                    key={p.id}
                    meta={`Approved ${when(p.approved_at)} by ${p.approved_by ?? "someone"}`}
                    title={planTitle(p, data)}
                  >
                    <p className="mt-1 text-[14px] text-[#6C7484]">
                      {money(each)} {planCadence(p, rows)}
                    </p>

                    <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#EEF0F3]">
                      <div
                        className={`h-full rounded-full ${
                          pct >= 100 ? "bg-[#1B7A4B]" : "bg-[#D9A227]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <p className="mt-1.5 text-[13px] text-[#6C7484]">
                      {pp?.next_number && pp.next_due
                        ? `Payment ${pp.next_number} of ${pp.count} — next due ${when(
                            pp.next_due,
                          )}`
                        : "Paid off"}
                      {pp ? ` · ${money(pp.paid)} of ${money(pp.total)} paid` : ""}
                    </p>

                    {p.signed_photo_path && (
                      <div className="mt-3.5 flex gap-2.5">
                        <Btn
                          onClick={() => say("Signed plan — opens from Drive")}
                        >
                          See signed plan
                        </Btn>
                      </div>
                    )}
                  </Item>
                );
              })}
            </Stack>
          </>
        )}

        {/* ---------------- NOTICES ---------------- */}
        {tab === "notices" && data && (
          <>
            <SectionBar
              count={data.notices.toPost.length}
              title="Print and post today"
            />
            <Stack>
              {data.notices.toPost.length === 0 && (
                <div className="p-4 text-[15px] text-[#6C7484]">
                  Nothing to post today.
                </div>
              )}
              {data.notices.toPost.map((n) => (
                <Item
                  awaiting
                  key={n.id}
                  meta={`Three day notice to vacate · ${money(n.generated_from_balance)} · generated ${when(n.generated_at)}`}
                  title={noticeTitle(n, data)}
                >
                  <div className="mt-3.5 flex flex-wrap gap-2.5">
                    <Btn
                      onClick={() => say("Notice sent to the park printer")}
                      variant="navy"
                    >
                      Print the notice
                    </Btn>
                    <Btn
                      onClick={() => {
                        const lot = [...data.pastDue, ...data.current].find(
                          (l) => l.id === n.lot_id,
                        );
                        openSheet("post", lot);
                      }}
                      variant="primary"
                    >
                      Posted it — add photos
                    </Btn>
                  </div>
                </Item>
              ))}
            </Stack>

            <SectionBar
              count={data.notices.posted.length}
              title="Already posted"
            />
            <Stack>
              {data.notices.posted.length === 0 && (
                <div className="p-4 text-[15px] text-[#6C7484]">
                  Nothing posted yet.
                </div>
              )}
              {data.notices.posted.map((n) => (
                <Item
                  key={n.id}
                  lines={[
                    n.certified_tracking
                      ? `Certified mail ${n.certified_tracking}`
                      : "",
                    n.pha_copy_at
                      ? `Housing authority copy sent ${when(n.pha_copy_at)}`
                      : "",
                    n.photo_wide_path && n.photo_close_path
                      ? "Both photos on file"
                      : "",
                  ].filter(Boolean)}
                  meta={`Posted ${when(n.posted_at)}`}
                  title={noticeTitle(n, data)}
                />
              ))}
            </Stack>

            <Note stop title="You never create a notice">
              The system writes it and Raj clears it. You print what is here,
              post it, and photograph it. Nothing on this screen can be edited
              or backdated, by design.
            </Note>
          </>
        )}
      </div>

      {/* The old action dock is gone. Two fixed bars were fighting for the
          bottom of the screen, and taking a payment is about to become a tab
          of its own rather than a button that throws a sheet over the list. */}
      {kpi && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center overflow-hidden bg-[#141A28]/55 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:px-4 sm:py-6"
          onClick={() => setKpi(null)}
        >
          <div
            className="flex h-full max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[#EEF2F6] shadow-[0_20px_40px_rgba(30,58,138,0.18)] sm:h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-none items-center justify-between gap-3 bg-[#1E3A8A] px-5 py-4 text-white">
              <div>
                <h2 className="text-[17px] font-bold tracking-[-0.01em]">
                  {kpi === "late"
                    ? "Late"
                    : kpi === "plan"
                      ? "On a plan"
                      : "Paid"}
                </h2>
                <div className="mt-0.5 text-[12.5px] text-[#A9B4CC]">
                  {kpiRows.length} {kpiRows.length === 1 ? "home" : "homes"}
                </div>
              </div>
              <button
                aria-label="Close"
                className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/15 text-[19px] leading-none"
                onClick={() => setKpi(null)}
                type="button"
              >
                ×
              </button>
            </div>

            {/* The same row as the roll, so a lot behaves identically whether
                Zo reached it by scrolling or by tapping a number. */}
            <div className="flex-1 overflow-y-auto p-5">
              <Stack>
                {kpiRows.length === 0 && (
                  <div className="p-4 text-[15px] text-[#6C7484]">
                    {kpi === "late"
                      ? "Nobody with a recorded rent is late."
                      : kpi === "plan"
                        ? "Nobody is on a payment plan right now."
                        : "Nobody has paid yet this month."}
                  </div>
                )}
                {kpiRows.map((lot) => (
                  <LotRow
                    key={lot.id}
                    lot={lot}
                    onPay={() => openSheet("pay", lot)}
                    onPlan={() => openSheet("plan", lot)}
                    onPost={() => openSheet("post", lot)}
                    onProof={setProofId}
                    onSetRent={() => openSheet("rent", lot)}
                  />
                ))}
              </Stack>
            </div>
          </div>
        </div>
      )}

      <ZoTabBar />

      <Toast message={toast.msg} stop={toast.stop} />

      {proofId && (
        <ProofSheet noticeId={proofId} onClose={() => setProofId(null)} />
      )}

      {sheet && (
        <Sheets
          data={data}
          kind={sheet}
          lot={sheetLot}
          onClose={() => setSheet(null)}
          onDone={(msg) => {
            setSheet(null);
            say(msg);
            load();
          }}
        />
      )}
    </MobileScreenShell>
  );
}

/* ---------------- small pieces ---------------- */

// Sits on the row itself, not only in the banner at the top. Zo scrolls, and
// a header warning stops being visible the moment he does.
function SampleTag() {
  return (
    <div className="mt-1 inline-block rounded bg-[#FDE7E5] px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#B3261E]">
      Sample data — not a real resident
    </div>
  );
}

function Tile({
  n,
  l,
  tone = "plain",
  onClick,
}: {
  n: string;
  l: string;
  tone?: "plain" | "late" | "plan" | "paid" | "flag";
  onClick?: () => void;
}) {
  // Colour carries the meaning here, so it has to survive being read in
  // sunlight on a cracked screen. These are the darkest usable shades.
  const colour = {
    plain: "text-[#1B2231]",
    late: "text-[#B3261E]",
    plan: "text-[#8A5A00]",
    paid: "text-[#1B7A4B]",
    flag: "text-[#A83A2A]",
  }[tone];

  const shell = `rounded-2xl border p-4 text-left ${
    tone === "flag"
      ? "border-[#EBC9C1] bg-[#FDF6F4]"
      : "border-[#DCE4EE] bg-white"
  }`;

  const body = (
    <>
      <div className={`text-[26px] font-bold leading-tight ${colour}`}>{n}</div>
      <div className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#6C7484]">
        {l}
      </div>
    </>
  );

  if (!onClick) return <div className={shell}>{body}</div>;

  return (
    <button className={`${shell} w-full`} onClick={onClick} type="button">
      {body}
    </button>
  );
}

function LotHead({ lot }: { lot: Lot }) {
  const s = statusOf(lot);
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[17px] font-bold tracking-[-0.01em]">
          Lot {lot.lot_number}
        </div>
        {lot.is_sample && <SampleTag />}
        <div className="mt-0.5 text-[14px] text-[#6C7484]">
          {lot.tenant_name ?? "Vacant"}
        </div>
      </div>
      <Pill tone={s.tone}>{s.label}</Pill>
    </div>
  );
}

// One line per resident, name and amount side by side, everything else
// folded away until Zo taps. Five stacked buttons per card meant four lots
// filled the screen; now he can see the whole community at once.
function subLine(lot: Lot) {
  if (lot.latest_notice?.posted_at)
    return `Notice posted ${when(lot.latest_notice.posted_at)}`;
  if (lot.latest_notice) return "Notice ready to post";
  if (lot.pending_plan) return "Plan waiting on Raj";
  if (lot.active_plan) {
    const pp = lot.plan_progress;
    if (pp?.next_number && pp.next_due) {
      return `Payment ${pp.next_number} of ${pp.count} due ${when(pp.next_due)}`;
    }
    return "Plan paid off";
  }
  if (!lot.occupied) return "Nobody living here";
  // A stand-in figure is not a rent, and a balance built on one is not a
  // balance. Said ahead of paid, due and late, because all three would be
  // claims this row cannot support.
  if (lot.rent_placeholder)
    return "Rent not confirmed — ask the resident, then set the real amount";
  if (lot.owed < 0) return "Paid ahead";
  if (lot.owed > 0) return lot.is_late ? "Late" : "Due now — not late yet";
  if (lot.paid_this_month && lot.last_payment)
    return `Paid ${when(lot.last_payment.received_at)} · ${methodWord(
      lot.last_payment.method,
    )}`;
  if (lot.paid_this_month) return "Payment logged this month";
  if (!lot.contract_rent) return "No rent recorded yet — comes from the lease";
  return `${money(lot.tenant_portion ?? lot.contract_rent)} a month`;
}

function LotRow({
  lot,
  onPay,
  onPost,
  onPlan,
  onSetRent,
  onProof,
}: {
  lot: Lot;
  onPay: () => void;
  onPost: () => void;
  onPlan: () => void;
  onSetRent: () => void;
  onProof: (noticeId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const posted = Boolean(lot.latest_notice?.posted_at);
  const s = statusOf(lot);

  return (
    <div className="p-4">
      <button
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        type="button"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold tracking-[-0.01em]">
            Lot {lot.lot_number} — {lot.tenant_name ?? "Vacant"}
          </div>
          {lot.is_sample && <SampleTag />}
          <div className="mt-1 text-[13px] text-[#6C7484]">{subLine(lot)}</div>
        </div>
        <div className="shrink-0 text-right">
          <Pill tone={s.tone}>{s.label}</Pill>
          {/* A minus sign in front of a rent figure reads as "owes". Say
              what a negative balance actually is instead. */}
          {lot.active_plan && lot.plan_progress?.next_amount != null ? (
            <>
              {/* The next payment, not the balance. What Zo needs at the door
                  is the figure to ask for today. */}
              <div className="mt-1.5 text-[19px] font-bold tracking-[-0.02em] text-[#8A5A00]">
                {money(lot.plan_progress.next_amount)}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#8A5A00]">
                Next payment
              </div>
            </>
          ) : lot.has_ledger ? (
            <>
              <div className="mt-1.5 text-[19px] font-bold tracking-[-0.02em]">
                {money(Math.abs(lot.owed))}
              </div>
              {lot.owed < 0 && (
                <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#1B7A4B]">
                  In credit
                </div>
              )}
            </>
          ) : lot.last_payment ? (
            <>
              {/* No charge is recorded, so this is what Zo took - not a
                  balance, and not a credit. Calling it credit implied the
                  resident had overpaid something. */}
              <div className="mt-1.5 text-[19px] font-bold tracking-[-0.02em] text-[#1B7A4B]">
                {money(lot.last_payment.amount)}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#1B7A4B]">
                Received
              </div>
            </>
          ) : (
            /* An em dash, not $0.00. Nothing is charged and nothing is paid,
               and a zero would read as "owes nothing". */
            <div className="mt-1.5 text-[19px] font-bold tracking-[-0.02em]">
              —
            </div>
          )}
        </div>
      </button>

      {/* One bar, two meanings. On a plan it is progress through the plan; on
          any other lot it is how much of this month's charge has come in.
          A balance or a "3 of 6" alone does not show somebody one payment
          from the end at a glance. */}
      {(() => {
        const bar = lot.active_plan
          ? lot.plan_progress && lot.plan_progress.total > 0
            ? { paid: lot.plan_progress.paid, total: lot.plan_progress.total }
            : null
          : lot.month_charged > 0
            ? { paid: lot.month_paid, total: lot.month_charged }
            : null;

        if (!bar) return null;

        // The bar stops at full, but the figures below it do not - somebody
        // who has overpaid should see that they have.
        const pct = Math.min(100, Math.round((bar.paid / bar.total) * 100));

        return (
          <div className="mt-2.5">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#EEF0F3]">
              <div
                className={`h-full rounded-full ${
                  pct >= 100 ? "bg-[#1B7A4B]" : "bg-[#D9A227]"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1 text-[12px] text-[#6C7484]">
              {money(bar.paid)} of {money(bar.total)} paid
              {lot.active_plan ? " on the plan" : " this month"}
            </div>
          </div>
        );
      })()}

      {open && (
        <div className="mt-3 border-t border-[#E3E5E9] pt-3">
          {/* Assisted households carry two amounts. Never one blended number. */}
          {lot.hap_household && lot.contract_rent && (
            <p className="text-[12.5px] text-[#6C7484]">
              tenant portion of {money(lot.contract_rent)} contract rent
            </p>
          )}

          {lot.last_payment && (
            <p className="text-[13.5px] leading-relaxed text-[#1B2231]">
              Last payment: <b>{money(lot.last_payment.amount)}</b> on{" "}
              {when(lot.last_payment.received_at)} ·{" "}
              {methodWord(lot.last_payment.method)}
              {lot.last_payment.receipt_number && (
                <>
                  <br />
                  Receipt <b>{lot.last_payment.receipt_number}</b>
                </>
              )}
            </p>
          )}

          {!lot.contract_rent && (
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#6C7484]">
              No rent amount is recorded for this home yet — it comes from the
              lease. Set it before taking a payment, or there is nothing for
              the payment to go against.
            </p>
          )}

          {/* Who typed the figure. With no confirmation step, this line is the
              only record on screen of where the number came from. */}
          {Boolean(lot.contract_rent) && (
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#6C7484]">
              Rent is {money(lot.tenant_portion ?? lot.contract_rent)} a month
              {lot.rent_set_by ? `, entered by ${lot.rent_set_by}` : ""}. If
              that is wrong, set it again — this month's charge moves with it.
            </p>
          )}

          {/* Only when there is something to say. This was drawing an empty
              grey pill on every lot whose tenancy type is not recorded, which
              is most of them. */}
          {tenancyLabel(lot) && (
            <Tag hap={lot.hap_household}>{tenancyLabel(lot)}</Tag>
          )}

          {lot.notes && (
            <div className="mt-3 rounded-[9px] border-l-4 border-l-[#D97706] bg-[#FFFCF5] px-3.5 py-3 text-[13px] leading-relaxed text-[#92600A]">
              {lot.notes}
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap gap-2.5">
            {lot.latest_notice && !posted && (
              <Btn onClick={onPost} variant="primary">
                Post the notice
              </Btn>
            )}
            {posted && lot.latest_notice && (
              <Btn onClick={() => onProof(lot.latest_notice!.id)}>
                See proof of service
              </Btn>
            )}
            {/* No longer gated on the rent. Money Zo has been handed goes into
                the record either way - the missing figure is shown on the row
                instead, where it can be fixed, rather than stopping him dead
                in front of the person holding the cash. */}
            <Btn onClick={onPay}>Log a payment</Btn>
            {/* The amount is a lease term and nobody has typed it in yet.
                Until it is set this row cannot say what is owed, nothing can
                be late, and no fee can apply. */}
            {lot.occupied && !lot.contract_rent && (
              <Btn onClick={onSetRent} variant="primary">
                Set the rent
              </Btn>
            )}
            {lot.occupied && Boolean(lot.contract_rent) && (
              <Btn
                onClick={onSetRent}
                variant={lot.rent_placeholder ? "primary" : "plain"}
              >
                {lot.rent_placeholder ? "Set the real rent" : "Change the rent"}
              </Btn>
            )}
            {!lot.active_plan && !lot.pending_plan && !lot.latest_notice && (
              <Btn onClick={onPlan}>Propose a plan</Btn>
            )}
            {lot.pending_plan && <Btn disabled>Plan waiting on Raj</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}

function methodWord(method: string | null) {
  if (method === "money_order") return "money order";
  if (method === "cashiers_check") return "cashier's check";
  if (method === "cash") return "cash";
  return "payment";
}

function daysUntil(date: string) {
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  return days <= 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`;
}

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function lotOf(id: string, data: Payload | null) {
  return [
    ...(data?.pastDue ?? []),
    ...(data?.withCounsel ?? []),
    ...(data?.current ?? []),
  ].find((l) => l.id === id);
}

function ordinal(n: number) {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}

/**
 * The cadence in the words a resident would use: "due the 20th of each
 * month", not "Monthly". Zo reads this out at a door.
 */
function planCadence(p: any, rows: any[]) {
  const first = rows[0]?.due_date ?? null;
  const freq = String(p.frequency ?? "Every two weeks");

  if (freq === "Monthly" && first) {
    return `due the ${ordinal(Number(String(first).slice(8, 10)))} of each month`;
  }
  if (freq === "Weekly") {
    return `every week${first ? ` from ${when(first)}` : ""}`;
  }
  return `every two weeks${first ? ` from ${when(first)}` : ""}`;
}

function planTitle(p: any, data: Payload | null) {
  const lot = lotOf(p.lot_id, data);
  return lot ? `Lot ${lot.lot_number} — ${lot.tenant_name}` : "Plan";
}

function noticeTitle(n: any, data: Payload | null) {
  const lot = lotOf(n.lot_id, data);
  return lot ? `Lot ${lot.lot_number} — ${lot.tenant_name}` : "Notice";
}
