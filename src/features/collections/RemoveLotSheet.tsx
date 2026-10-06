// src/features/collections/RemoveLotSheet.tsx
// Take a lot off the rent roll. Soft: nothing is deleted. The outgoing
// resident is kept in tenancy_history, their portal sign-in is switched off,
// and the lot takes the status picked here - so the map changes with it.
import React from "react";
import { Btn, money } from "./parts";

type Lot = {
  id: string;
  lot_number: string;
  tenant_name: string | null;
  hap_household?: boolean;
  owed?: number;
};

const CHOICES: { value: string; label: string; hint: string }[] = [
  { value: "vacant", label: "Vacant", hint: "Empty, not ready to show yet" },
  { value: "ready", label: "Ready to rent", hint: "Clean and ready for a new resident" },
  { value: "moving_out", label: "Moving out", hint: "Resident is leaving now" },
  { value: "needs_repair", label: "Needs repair", hint: "Work needed before anyone moves in" },
  { value: "full_rehab", label: "Full rehab", hint: "Major work needed" },
  { value: "verify", label: "Needs checking", hint: "Not sure - someone should look" },
  { value: "occupied", label: "Occupied - new resident", hint: "Someone new has moved in" },
  { value: "archive", label: "Not part of Hometown Meadows - hide it", hint: "Takes the lot off the roll and the map" },
];

const inputClass =
  "w-full rounded-[9px] border border-[#D5D8DE] bg-white px-3.5 py-3 text-[16px] text-[#1B2231] focus:border-[#1E3A8A] focus:outline-none";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">
      {children}
    </span>
  );
}

function token() {
  const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
  if (!key) return "";
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}").access_token ?? "";
  } catch {
    return "";
  }
}

export function RemoveLotSheet({
  lot,
  onClose,
  onDone,
}: {
  lot: Lot;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [next, setNext] = React.useState("");
  const [name, setName] = React.useState("");
  const [rent, setRent] = React.useState("");
  const [portion, setPortion] = React.useState("");
  const [moveIn, setMoveIn] = React.useState(new Date().toLocaleDateString("en-CA"));
  const [note, setNote] = React.useState("");
  const [sure, setSure] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  const owed = Number(lot.owed ?? 0);
  const hap = Boolean(lot.hap_household);
  const isNew = next === "occupied";
  const ready =
    Boolean(next) &&
    sure &&
    (!isNew || (name.trim() && Number(rent) > 0 && moveIn && (!hap || portion !== "")));

  async function submit() {
    setBusy(true);
    setProblem("");
    try {
      const res = await fetch("/api/collections?remove=1", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          lot_id: lot.id,
          next_status: next,
          new_tenant_name: isNew ? name.trim() : undefined,
          contract_rent: isNew ? Number(rent) : undefined,
          tenant_portion: isNew && hap ? Number(portion) : undefined,
          move_in_on: isNew ? moveIn : undefined,
          note: note.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not remove the lot");
      onDone(body.message || "Lot removed from the rent roll.");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not remove the lot");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#141A28]/55 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[20px] bg-[#F1F2F4] sm:rounded-[18px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center justify-between gap-3 bg-[#9B1C1C] px-5 py-4 text-white">
          <div>
            <h2 className="text-[17px] font-bold tracking-[-0.01em]">Remove from rent roll</h2>
            <div className="mt-0.5 text-[12.5px] text-white/75">
              Lot {lot.lot_number}
              {lot.tenant_name ? ` — ${lot.tenant_name}` : ""}
            </div>
          </div>
          <button
            aria-label="Close"
            className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/15 text-[19px] leading-none"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="mb-5 rounded-[9px] bg-[#F2F4F7] px-3.5 py-3 text-[13px] leading-relaxed text-[#6C7484]">
            Nothing is deleted. {lot.tenant_name ?? "The resident"} is kept in the history,
            their portal sign-in is switched off, and the map changes to the status you pick.
          </div>

          {owed > 0 && (
            <div className="mb-5 rounded-[9px] border-l-4 border-l-[#D97706] bg-[#FFFCF5] px-3.5 py-3 text-[13px] leading-relaxed text-[#92600A]">
              This lot still owes <b>{money(owed)}</b>. Raj will be told. It stays on this tenant's
              record - the next resident starts at $0.
            </div>
          )}

          <Label>What is the lot now?</Label>
          <div className="mb-5 grid gap-2">
            {CHOICES.map((c) => (
              <button
                className={`rounded-[11px] border px-3.5 py-3 text-left ${
                  next === c.value
                    ? c.value === "archive"
                      ? "border-[#9B1C1C] bg-[#FDECEC]"
                      : "border-[#1E3A8A] bg-[#EEF2FF]"
                    : "border-[#D5D8DE] bg-white"
                }`}
                key={c.value}
                onClick={() => setNext(c.value)}
                type="button"
              >
                <div className="text-[15px] font-bold text-[#1B2231]">{c.label}</div>
                <div className="text-[12.5px] text-[#6C7484]">{c.hint}</div>
              </button>
            ))}
          </div>

          {isNew && (
            <div className="mb-5 grid gap-4">
              <div>
                <Label>New resident's name</Label>
                <input className={inputClass} onChange={(e) => setName(e.target.value)} value={name} />
              </div>
              <div>
                <Label>Move-in date</Label>
                <input className={inputClass} onChange={(e) => setMoveIn(e.target.value)} type="date" value={moveIn} />
              </div>
              <div>
                <Label>{hap ? "Contract rent" : "Monthly rent"}</Label>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  onChange={(e) => setRent(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={rent}
                />
              </div>
              {hap && (
                <div>
                  <Label>Tenant's portion</Label>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    onChange={(e) => setPortion(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    type="number"
                    value={portion}
                  />
                </div>
              )}
              <p className="text-[12.5px] text-[#6C7484]">
                Rent is due on the same day of the month as the move-in date. Copy the rent from the signed lease.
              </p>
            </div>
          )}

          <div className="mb-5">
            <Label>Note (optional)</Label>
            <textarea
              className={inputClass}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why it is being removed"
              rows={2}
              value={note}
            />
          </div>

          <label className="flex items-start gap-3 text-[14px] text-[#1B2231]">
            <input
              checked={sure}
              className="mt-1 h-5 w-5"
              onChange={(e) => setSure(e.target.checked)}
              type="checkbox"
            />
            <span>
              Yes, take {lot.tenant_name ?? "this resident"} off Lot {lot.lot_number}.
            </span>
          </label>

          {problem && (
            <div className="mt-4 rounded-[9px] bg-[#FDECEC] px-3.5 py-3 text-[13.5px] text-[#9B1C1C]">
              {problem}
            </div>
          )}
        </div>

        <div className="flex flex-none gap-2.5 border-t border-[#E3E5E9] bg-white px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 [&>button]:flex-1">
          <Btn onClick={onClose}>Cancel</Btn>
          <button
            className="rounded-[11px] bg-[#B42318] px-4 py-3 text-[15px] font-bold text-white disabled:opacity-40"
            disabled={!ready || busy}
            onClick={submit}
            type="button"
          >
            {busy ? "Removing…" : "Remove from rent roll"}
          </button>
        </div>
      </div>
    </div>
  );
}
