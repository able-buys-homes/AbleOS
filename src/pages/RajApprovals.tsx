// src/pages/RajApprovals.tsx
// Raj's two collections queues, plus the deadlines row.
//
// Two decisions live here and nowhere else: whether a balance is real enough
// to justify a legal notice, and whether a payment plan is agreed. Zo can see
// neither queue - a queue he cannot act on would be a dead button with
// residents' names on it.
import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "lucide-react";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import { apiFetch } from "../lib/apiFetch";
import {
  Btn,
  Item,
  Note,
  SectionBar,
  Stack,
  Toast,
  money,
} from "../features/collections/parts";

type Lot = {
  id: string;
  lot_number: string;
  tenant_name: string | null;
  tenancy_type: string | null;
  hap_household: boolean;
  contract_rent: string | number | null;
  tenant_portion: string | number | null;
  owed: number;
};

type Payload = {
  verify: Lot[];
  approve: any[];
  deadlines: any[];
};

export function RajApprovals() {
  const [data, setData] = React.useState<Payload | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState("");
  const [toast, setToast] = React.useState<{ msg: string; stop?: boolean }>({
    msg: "",
  });

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/collections?view=raj");
      if (res.status === 401) return;
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not load the queues");
      setData(body);
    } catch (err) {
      setProblem(
        err instanceof Error ? err.message : "Could not load the queues",
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

  async function act(path: string, body: unknown, key: string) {
    setBusy(key);
    setProblem("");

    try {
      const res = await apiFetch(path, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Could not save");

      say(payload.message || "Saved");
      await load();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  return (
    <MobileScreenShell
      headerContent={
        <>
          <div className="flex items-center justify-between">
            <Link aria-label="Back to your cockpit" to="/raj">
              <ArrowLeftIcon aria-hidden="true" size={22} />
            </Link>
            <UserMenu />
          </div>

          <h1 className="mt-3 text-[27px] font-bold tracking-[-0.015em]">
            Approvals
          </h1>
          <p className="mt-1.5 pb-3 text-[13.5px] text-white/75">
            Hometown Meadows MHP &nbsp;•&nbsp; collections
          </p>
        </>
      }
    >
      <div className="pb-10">
        {problem && (
          <div className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[16px] text-[#B91C1C]">
            {problem}
          </div>
        )}

        <SectionBar
          count={data?.verify.length}
          title="Verify before a notice can generate"
        />
        <Stack>
          {data?.verify.length === 0 && (
            <div className="p-4 text-[15px] text-[#6C7484]">
              Nothing waiting. A balance only reaches you once something is owed
              and it has not been verified.
            </div>
          )}

          {data?.verify.map((lot) => (
            <Item
              awaiting
              key={lot.id}
              lines={[
                lot.hap_household
                  ? `Tenant portion owed — ${money(lot.owed)} of ${money(lot.contract_rent)} contract rent`
                  : `Owed — ${money(lot.owed)}`,
                lot.tenancy_type === "lot_only"
                  ? "Lot only — recovery is the lot, not the home"
                  : "Park-owned home",
              ]}
              meta={lot.hap_household ? "Housing assistance" : undefined}
              title={`Lot ${lot.lot_number} — ${lot.tenant_name}`}
            >
              <div className="mt-3.5 flex flex-wrap gap-2.5">
                <Btn
                  disabled={busy !== null}
                  onClick={() =>
                    act(
                      "/api/collections?verify=1",
                      { lot_id: lot.id },
                      `v-${lot.id}`,
                    )
                  }
                  variant="primary"
                >
                  {busy === `v-${lot.id}`
                    ? "Verifying…"
                    : "Verify — allow the notice"}
                </Btn>
                <Btn
                  onClick={() =>
                    say("Held. No notice will generate for this lot.", true)
                  }
                >
                  Hold it
                </Btn>
              </div>
            </Item>
          ))}
        </Stack>

        <SectionBar
          count={data?.approve.length}
          title="Payment plans to approve"
        />
        <Stack>
          {data?.approve.length === 0 && (
            <div className="p-4 text-[15px] text-[#6C7484]">
              No plans waiting.
            </div>
          )}

          {data?.approve.map((plan) => (
            <Item
              awaiting
              key={plan.id}
              lines={[
                plan.reason ? `Reason given: ${plan.reason}` : "",
                `Proposed by ${plan.proposed_by}`,
              ].filter(Boolean)}
              meta={new Date(plan.proposed_at).toLocaleString()}
              title="Payment plan"
            >
              <Note>
                Approve, then Zo prints and collects the signature. The document
                does not exist until you approve — and a signature collected
                first would arguably bind Kubera to terms you never agreed to.
              </Note>

              <div className="mt-3.5 flex flex-wrap gap-2.5">
                <Btn
                  disabled={busy !== null}
                  onClick={() =>
                    act(
                      `/api/collections?plan=${plan.id}`,
                      { decision: "approve" },
                      `a-${plan.id}`,
                    )
                  }
                  variant="primary"
                >
                  {busy === `a-${plan.id}` ? "Approving…" : "Approve"}
                </Btn>
                <Btn
                  disabled={busy !== null}
                  onClick={() =>
                    act(
                      `/api/collections?plan=${plan.id}`,
                      { decision: "reject" },
                      `r-${plan.id}`,
                    )
                  }
                >
                  Reject
                </Btn>
              </div>
            </Item>
          ))}
        </Stack>

        <SectionBar title="Deadlines" />
        <Stack>
          {data?.deadlines.length === 0 && (
            <div className="p-4 text-[15px] text-[#6C7484]">No open cases.</div>
          )}

          {data?.deadlines.map((c) => (
            <Item
              key={c.id}
              lines={[
                `Five days from service. ${daysLeft(c.objection_deadline)}.`,
                c.track === "B"
                  ? "Lot only — recovery is the lot, not the home."
                  : "Park-owned home.",
              ]}
              meta={`${c.lot?.tenant_name ?? ""} · filed ${short(c.filed_at)} · served ${short(c.served_at)}`}
              title={`Lot ${c.lot?.lot_number} — objection deadline ${short(c.objection_deadline)}`}
            />
          ))}
        </Stack>
      </div>

      <Toast message={toast.msg} stop={toast.stop} />
    </MobileScreenShell>
  );
}

function short(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function daysLeft(date: string | null) {
  if (!date) return "No deadline set";
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return "Passed";
  if (days === 0) return "Today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}
