// src/pages/DanePortalAccounts.tsx
// Dane gives a resident their Tenant Portal sign-in.
//
// The lot list is read live from the same `lots` rows Zo's Map and Rent tabs
// show, so only homes Zo has marked occupied can be picked, and the tenant
// comes from his record rather than being typed again here.

import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeftIcon, CopyIcon, CheckIcon } from "lucide-react";
import { NotificationBell } from "../components/NotificationBell";
import { UserMenu } from "../components/UserMenu";
import { apiFetch } from "../lib/apiFetch";
import { byLot } from "../lib/byLot";

type PortalLot = {
  id: string;
  lot_number: string;
  tenant_name: string | null;
  sign_in: string;
  has_account: boolean;
  account_created_at: string | null;
  last_seen_at: string | null;
  can_create: boolean;
};

type Created = {
  lot_number: string;
  tenant_name: string;
  sign_in: string;
  temporary_password: string;
  portal_url: string;
};

function shortDate(iso: string | null) {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DanePortalAccounts() {
  const [lots, setLots] = React.useState<PortalLot[] | null>(null);
  const [lotId, setLotId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const [created, setCreated] = React.useState<Created | null>(null);
  const [copied, setCopied] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/resident-accounts");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load the lots");
      setLots([...(body?.lots ?? [])].sort(byLot));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not load the lots");
    }
  }, []);

  // Fresh every time the screen comes back to the front, so a move-in Zo
  // just recorded is here without a reload.
  React.useEffect(() => {
    load();
    function onVisible() {
      if (!document.hidden) load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const chosen = lots?.find((l) => l.id === lotId) ?? null;
  const withAccount = (lots ?? []).filter((l) => l.has_account);

  async function create() {
    if (!chosen?.can_create) return;
    setBusy(true);
    setProblem("");
    setCreated(null);
    setCopied(false);

    try {
      const res = await apiFetch("/api/resident-accounts", {
        method: "POST",
        body: JSON.stringify({ lot_id: chosen.id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not create that account");

      setCreated(body as Created);
      setLotId("");
      load();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not create that account");
    } finally {
      setBusy(false);
    }
  }

  async function copyDetails() {
    if (!created) return;
    const text = `Hometown Meadows Tenant Portal\n${created.portal_url}\nLot number: ${created.sign_in}\nTemporary password: ${created.temporary_password}\nYou will be asked to choose your own password after signing in.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

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

          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
            Hometown Meadows MHP
          </p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Portal accounts
          </h1>
          <p className="mt-2 max-w-md text-[18px] font-medium text-white/85">
            Give a resident their Tenant Portal sign-in. Only homes Zo has marked
            occupied can be picked.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[428px] px-5 pb-14 pt-6 sm:max-w-2xl sm:px-8 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
        <section className="rounded-2xl border border-[#DCE4EE] bg-white p-5">
          <h2 className="text-[18px] font-semibold text-[#1B2231]">Create an account</h2>

          <label className="mt-4 block text-[12px] font-bold uppercase tracking-[0.06em] text-[#6C7484]">
            Occupied lot
          </label>
          <select
            className="mt-1.5 w-full rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-3 text-[16px] text-[#1B2231]"
            disabled={!lots || busy}
            onChange={(e) => {
              setLotId(e.target.value);
              setProblem("");
            }}
            value={lotId}
          >
            <option value="">
              {lots === null ? "Loading the occupied lots…" : "Pick an occupied lot"}
            </option>
            {(lots ?? []).map((l) => (
              <option disabled={!l.can_create} key={l.id} value={l.id}>
                Lot {l.lot_number} — {l.tenant_name?.trim() || "No tenant named"}
                {l.has_account
                  ? " (already has an account)"
                  : !l.tenant_name?.trim()
                    ? " (ask Zo to add the name)"
                    : ""}
              </option>
            ))}
          </select>

          {lots && lots.length === 0 && (
            <p className="mt-2 text-[14px] text-[#6C7484]">
              No lots are marked occupied on Zo's map yet.
            </p>
          )}

          {chosen && (
            <div className="mt-4 rounded-[10px] bg-[#F2F4F7] px-4 py-3 text-[15px] leading-relaxed text-[#1B2231]">
              <div>
                <span className="text-[#6C7484]">Tenant: </span>
                <b>{chosen.tenant_name}</b>
              </div>
              <div>
                <span className="text-[#6C7484]">They sign in with: </span>
                <b>{chosen.sign_in}</b>
              </div>
            </div>
          )}

          {problem && <p className="mt-3 text-[14px] text-[#B91C1C]">{problem}</p>}

          <button
            className="mt-4 w-full rounded-[10px] bg-[#1E3A8A] px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
            disabled={busy || !chosen?.can_create}
            onClick={create}
            type="button"
          >
            {busy ? "Creating…" : "Create the account"}
          </button>
        </section>

        {created && (
          <section className="mt-4 rounded-2xl border-2 border-[#15803D] bg-[#F0FDF4] p-5">
            <h2 className="text-[18px] font-semibold text-[#14532D]">
              Account ready for Lot {created.lot_number}
            </h2>
            <p className="mt-1 text-[14.5px] text-[#166534]">
              Give these to {created.tenant_name}. The password is shown{" "}
              <b>only this once</b> — it is not stored anywhere you can see it
              again. They are asked to choose their own the first time they sign in.
            </p>

            <dl className="mt-4 space-y-2 text-[15px]">
              <div className="flex justify-between gap-3">
                <dt className="text-[#4B5563]">Portal</dt>
                <dd className="font-semibold">{created.portal_url.replace("https://", "")}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#4B5563]">Lot number</dt>
                <dd className="font-semibold">{created.sign_in}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#4B5563]">Temporary password</dt>
                <dd className="font-mono text-[17px] font-bold tracking-wider">
                  {created.temporary_password}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex gap-2.5">
              <button
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-[#15803D] bg-white px-3.5 py-2.5 text-[14px] font-semibold text-[#14532D]"
                onClick={copyDetails}
                type="button"
              >
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                {copied ? "Copied" : "Copy the details"}
              </button>
              <button
                className="flex-1 rounded-[10px] border border-[#DCE4EE] bg-white px-3.5 py-2.5 text-[14px] font-semibold text-[#1B2231]"
                onClick={() => setCreated(null)}
                type="button"
              >
                Done
              </button>
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#6C7484]">
            Lots with an account — {withAccount.length}
          </h2>
          <div className="mt-2 divide-y divide-[#E3E5E9] overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white">
            {withAccount.length === 0 && (
              <p className="p-4 text-[15px] text-[#6C7484]">None yet.</p>
            )}
            {withAccount.map((l) => (
              <div className="flex items-center justify-between gap-3 px-4 py-3" key={l.id}>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-[#1B2231]">
                    Lot {l.lot_number} — {l.tenant_name}
                  </div>
                  <div className="text-[13px] text-[#6C7484]">
                    Created {shortDate(l.account_created_at)} · last signed in{" "}
                    {shortDate(l.last_seen_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}