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
import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "lucide-react";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import { ZoTabBar } from "../components/ZoTabBar";
import { apiFetch } from "../lib/apiFetch";
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
import { Sheets } from "../features/collections/Sheets";
import { ProofSheet } from "../features/collections/ProofSheet";

type Lot = {
  id: string;
  lot_number: string;
  tenant_name: string | null;
  tenancy_type: "park_owned" | "lot_only" | null;
  hap_household: boolean;
  contract_rent: string | number | null;
  tenant_portion: string | number | null;
  occupied: boolean;
  owed: number;
  verified: boolean;
  locked: boolean;
  active_plan: { id: string; status: string } | null;
  pending_plan: { id: string; status: string } | null;
  latest_notice: { id: string; posted_at: string | null } | null;
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
  if (lot.owed > 0) return { tone: "late" as const, label: "Past due" };
  return { tone: "ok" as const, label: "Paid" };
}

function tenancyLabel(lot: Lot) {
  if (lot.hap_household) return "Housing assistance";
  if (lot.tenancy_type === "lot_only") return "Lot only — tenant owns the home";
  if (lot.tenancy_type === "park_owned") return "Park-owned home";
  return null;
}

export function ZoCollections() {
  const [tab, setTab] = React.useState<Tab>("roll");
  const [data, setData] = React.useState<Payload | null>(null);
  const [problem, setProblem] = React.useState("");
  const [toast, setToast] = React.useState<{ msg: string; stop?: boolean }>({
    msg: "",
  });
  const [sheet, setSheet] = React.useState<null | "pay" | "plan" | "post">(
    null,
  );
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

  function say(msg: string, stop?: boolean) {
    setToast({ msg, stop });
    window.setTimeout(() => setToast({ msg: "" }), 4200);
  }

  function openSheet(kind: "pay" | "plan" | "post", lot?: Lot) {
    setSheetLot(lot ?? null);
    setSheet(kind);
  }

  const tiles = data?.tiles;

  // Grouped the way Zo reads the roll. A lot on an approved plan is not
  // "late" - it has terms Raj agreed to, and filing it under Late is how a
  // resident doing exactly what was asked of them gets chased anyway.
  const onPlan = [...(data?.pastDue ?? []), ...(data?.current ?? [])].filter(
    (lot) => lot.active_plan,
  );
  const late = (data?.pastDue ?? []).filter((lot) => !lot.active_plan);
  const paid = (data?.current ?? []).filter((lot) => !lot.active_plan);

  return (
    <MobileScreenShell
      headerContent={
        <>
          <div className="flex items-center justify-between">
            <Link aria-label="Back to your cockpit" to="/zo">
              <ArrowLeftIcon aria-hidden="true" size={22} />
            </Link>
            <UserMenu />
          </div>

          <h1 className="mt-3 text-[27px] font-bold tracking-[-0.015em]">
            Rent
          </h1>
          <p className="mt-1.5 text-[13.5px] text-white/75">
            Hometown Meadows MHP &nbsp;•&nbsp; 121 Smith Lane, Nashville AR
          </p>

          <div className="mt-4 flex gap-6 overflow-x-auto">
            {(
              [
                ["roll", "Who's paid"],
                ["pay", "Take payment"],
                ["plans", "Plans"],
                ["notices", "Notices"],
              ] as const
            ).map(([key, label]) => (
              <button
                aria-selected={tab === key}
                className={`whitespace-nowrap border-b-[3px] pb-3 text-[14px] font-semibold ${
                  tab === key
                    ? "border-white text-white"
                    : "border-transparent text-white/70"
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
              <Tile l="Late" n={String(late.length)} tone="late" />
              <Tile l="On a plan" n={String(onPlan.length)} tone="plan" />
              <Tile l="Paid" n={String(paid.length)} tone="paid" />
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

            <SectionBar count={late.length} title="Late" />
            <Stack>
              {late.length === 0 && (
                <div className="p-4 text-[15px] text-[#6C7484]">
                  Nobody is late. Nothing to do here today.
                </div>
              )}
              {late.map((lot) => (
                <LotRow
                  key={lot.id}
                  lot={lot}
                  onPay={() => openSheet("pay", lot)}
                  onPlan={() => openSheet("plan", lot)}
                  onPost={() => openSheet("post", lot)}
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
                      <Tag>{tenancyLabel(lot)}</Tag>
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
                  onProof={setProofId}
                />
              ))}
            </Stack>

            <SectionBar title="New resident?" />
            <Stack>
              <div className="p-4">
                <div className="text-[16px] font-bold tracking-[-0.01em]">
                  Application for residency
                </div>
                <p className="mt-1 text-[13.5px] text-[#6C7484]">
                  Hand them the iPad, or print a blank copy for them to take
                  home.
                </p>
                <div className="mt-3.5 flex flex-wrap gap-2.5">
                  <Btn disabled>Fill it in here</Btn>
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
                <Note title="Keep using the paper form for now">
                  Filling it in on the iPad comes in the next round of work.
                  Nothing you collect on paper is wasted — it gets typed in
                  once, by us, not by you.
                </Note>
              </div>
            </Stack>

            <Note
              stop
              title="Build note for Dane — this one matters more than anything else here"
            >
              Nothing in the eviction sequence may fire because Zo failed to
              enter something. Notices generate from a positive, verified unpaid
              balance. If Zo never opens this screen all month, no notice is
              ever produced.
            </Note>
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
                  meta={`Proposed ${when(p.proposed_at)}`}
                  title={planTitle(p, data)}
                >
                  {p.reason && (
                    <ul className="mt-3 list-disc pl-5 text-[14.5px]">
                      <li>Reason given: {p.reason}</li>
                    </ul>
                  )}
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
              {data.plans.active.map((p) => (
                <Item
                  key={p.id}
                  meta={`Approved ${when(p.approved_at)}`}
                  title={planTitle(p, data)}
                >
                  <div className="mt-3.5 flex gap-2.5">
                    {p.signed_photo_path && (
                      <Btn
                        onClick={() => say("Signed plan — opens from Drive")}
                      >
                        See signed plan
                      </Btn>
                    )}
                  </div>
                </Item>
              ))}
            </Stack>

            <SectionBar title="How a plan gets made" />
            <Stack>
              <div className="p-4">
                <ol className="mt-1 list-none p-0">
                  {[
                    ["You propose the terms here.", false],
                    ["Raj approves or rejects on his screen.", false],
                    [
                      "The plan document generates from the attorney's template.",
                      true,
                    ],
                    [
                      "You print it, get the signature, photograph it, upload it.",
                      true,
                    ],
                    ["The plan goes active and the reminders stop.", true],
                  ].map(([text, pending], i) => (
                    <li
                      className={`relative border-t border-[#E3E5E9] py-3 pl-11 text-[14px] ${
                        pending ? "text-[#6C7484]" : "text-[#1B2231]"
                      }`}
                      key={String(text)}
                    >
                      <span
                        className={`absolute left-0 top-3 grid h-[26px] w-[26px] place-items-center rounded-full text-[13px] font-bold ${
                          pending
                            ? "bg-[#EEF0F3] text-[#6C7484]"
                            : "bg-[#1E3A8A] text-white"
                        }`}
                      >
                        {i + 1}
                      </span>
                      {text}
                    </li>
                  ))}
                </ol>

                <Note stop title="Never get a signature first">
                  If a resident signs before Raj approves, the park is arguably
                  stuck with terms he never agreed to. That is why the print
                  button does not appear until step 3.
                </Note>
              </div>
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

function Tile({
  n,
  l,
  tone = "plain",
}: {
  n: string;
  l: string;
  tone?: "plain" | "late" | "plan" | "paid" | "flag";
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

  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "flag"
          ? "border-[#EBC9C1] bg-[#FDF6F4]"
          : "border-[#DCE4EE] bg-white"
      }`}
    >
      <div className={`text-[26px] font-bold leading-tight ${colour}`}>{n}</div>
      <div className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#6C7484]">
        {l}
      </div>
    </div>
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
  if (lot.active_plan) return "On an approved plan";
  if (!lot.occupied) return "Vacant";
  if (lot.owed > 0) return "Past due";
  return "Nothing owed";
}

function LotRow({
  lot,
  onPay,
  onPost,
  onPlan,
  onProof,
}: {
  lot: Lot;
  onPay: () => void;
  onPost: () => void;
  onPlan: () => void;
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
          <div className="mt-1 text-[13px] text-[#6C7484]">{subLine(lot)}</div>
        </div>
        <div className="shrink-0 text-right">
          <Pill tone={s.tone}>{s.label}</Pill>
          <div className="mt-1.5 text-[19px] font-bold tracking-[-0.02em]">
            {money(lot.owed)}
          </div>
        </div>
      </button>

      {open && (
        <div className="mt-3 border-t border-[#E3E5E9] pt-3">
          {/* Assisted households carry two amounts. Never one blended number. */}
          {lot.hap_household && lot.contract_rent && (
            <p className="text-[12.5px] text-[#6C7484]">
              tenant portion of {money(lot.contract_rent)} contract rent
            </p>
          )}
          <Tag hap={lot.hap_household}>{tenancyLabel(lot)}</Tag>
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
            <Btn onClick={onPay}>Log a payment</Btn>
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

function planTitle(p: any, data: Payload | null) {
  const lot = lotOf(p.lot_id, data);
  return lot ? `Lot ${lot.lot_number} — ${lot.tenant_name}` : "Plan";
}

function noticeTitle(n: any, data: Payload | null) {
  const lot = lotOf(n.lot_id, data);
  return lot ? `Lot ${lot.lot_number} — ${lot.tenant_name}` : "Notice";
}
