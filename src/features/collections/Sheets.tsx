// src/features/collections/Sheets.tsx
// The three bottom sheets: log a payment, propose a plan, record a posting.
//
// These carry the longest copy in the build and none of it is decorative. The
// stamps explain why a step exists - why Zo does not enter bank payments, why
// he must not collect a signature before Raj approves, why two photos are
// required. Raj wrote them as training. Do not shorten them.
import React from "react";
import { Btn, money } from "./parts";

type Lot = {
  id: string;
  lot_number: string;
  tenant_name: string | null;
  hap_household?: boolean;
  contract_rent?: string | number | null;
  tenant_portion?: string | number | null;
  rent_confirmed_at?: string | null;
  owed?: number;
};

type Props = {
  kind: "pay" | "plan" | "post" | "rent";
  lot: Lot | null;
  data: { pastDue: Lot[]; current: Lot[] } | null;
  onClose: () => void;
  onDone: (message: string) => void;
  /** Render as a panel in the page instead of a sheet over it. */
  inline?: boolean;
};

function Shell({
  title,
  sub,
  onClose,
  children,
  footer,
  inline = false,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  inline?: boolean;
}) {
  // Same form, no overlay. Used when it is a tab in its own right rather
  // than a sheet thrown over a list Zo can no longer read.
  if (inline) {
    return (
      <div className="mt-4 overflow-hidden rounded-[18px] border border-[#DCE4EE] bg-[#F1F2F4]">
        {/* No header in here. This is a tab, and the screen's own header
            already says Rent → Take payment; a second navy bar underneath it
            only repeats itself. The sheet version below keeps its header,
            because a sheet thrown over the roll has to say what it is. */}
        <div className="p-5">{children}</div>
        <div className="flex gap-2.5 border-t border-[#E3E5E9] bg-white px-5 py-3.5 [&>button]:flex-1">
          {footer}
        </div>
      </div>
    );
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
        <div className="flex flex-none items-center justify-between gap-3 bg-[#1E3A8A] px-5 py-4 text-white">
          <div>
            <h2 className="text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
            {sub && <div className="mt-0.5 text-[12.5px] text-[#A9B4CC]">{sub}</div>}
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

        <div className="overflow-y-auto p-5">{children}</div>

        <div className="flex flex-none gap-2.5 border-t border-[#E3E5E9] bg-white px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 [&>button]:flex-1">
          {footer}
        </div>
      </div>
    </div>
  );
}

function Stamp({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[9px] bg-[#F2F4F7] px-3.5 py-3 text-[13px] leading-relaxed text-[#6C7484]">
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">
      {children}
    </span>
  );
}

const inputClass =
  "w-full rounded-[9px] border border-[#D5D8DE] bg-white px-3.5 py-3 text-[16px] text-[#1B2231] focus:border-[#1E3A8A] focus:outline-none";

/** Photo capture. Shows what was taken, and lets it be replaced. */
function Shot({
  label,
  hint,
  file,
  onPick,
}: {
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        className={`w-full rounded-[11px] border-2 px-4 py-6 text-center ${
          file
            ? "border-solid border-[#16A34A] bg-[#EAF6EE]"
            : "border-dashed border-[#D5D8DE] bg-[#FAFBFC]"
        }`}
        onClick={() => ref.current?.click()}
        type="button"
      >
        <span
          className={`block text-[15.5px] font-bold ${file ? "text-[#166534]" : "text-[#1B2231]"}`}
        >
          {file ? "Photo added" : label}
        </span>
        <span
          className={`mt-1 block text-[13.5px] ${file ? "text-[#166534]" : "text-[#6C7484]"}`}
        >
          {file ? "Tap to replace" : hint}
        </span>
      </button>
      <input
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        ref={ref}
        type="file"
      />
    </>
  );
}

export function Sheets({
  kind,
  lot,
  data,
  onClose,
  onDone,
  inline = false,
}: Props) {
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  /* ---- payment ---- */
  const [amount, setAmount] = React.useState("");
  const [received, setReceived] = React.useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = React.useState("cash");
  const [payPhoto, setPayPhoto] = React.useState<File | null>(null);
  const [payNote, setPayNote] = React.useState("");
  const [payLotId, setPayLotId] = React.useState(lot?.id ?? "");

  /* ---- plan ---- */
  const [planLotId, setPlanLotId] = React.useState(lot?.id ?? "");
  const [each, setEach] = React.useState("");
  const [count, setCount] = React.useState("2");
  const [firstDue, setFirstDue] = React.useState("");
  const [freq, setFreq] = React.useState("Every two weeks");
  const [why, setWhy] = React.useState("");

  /* ---- rent ---- */
  const [rentLotId, setRentLotId] = React.useState(lot?.id ?? "");
  const [contractRent, setContractRent] = React.useState(
    lot?.contract_rent != null ? String(lot.contract_rent) : "",
  );
  const [tenantPortion, setTenantPortion] = React.useState(
    lot?.tenant_portion != null ? String(lot.tenant_portion) : "",
  );
  const [rentNote, setRentNote] = React.useState("");

  /* ---- posting ---- */
  const [wide, setWide] = React.useState<File | null>(null);
  const [close, setClose] = React.useState<File | null>(null);
  const [postNote, setPostNote] = React.useState("");
  const [coords, setCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = React.useState<"asking" | "ok" | "none">("asking");

  // Captured, never typed. A geotag someone can edit is not evidence.
  React.useEffect(() => {
    if (kind !== "post") return;

    if (!navigator.geolocation) {
      setGeoState("none");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeoState("ok");
      },
      // Never blocks the save. A dead GPS in a metal-sided park must not stop
      // Zo recording a posting he actually made - the photos and the server
      // timestamp are still real evidence.
      () => setGeoState("none"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [kind]);

  // Lots with counsel never appear here.
  const choosable = [...(data?.pastDue ?? []), ...(data?.current ?? [])];

  // Only lots with a rent recorded can take a payment. The server refuses the
  // rest, so they are not offered here either.
  const payable = choosable.filter((l) => l.contract_rent != null);

  // A plan clears what is owed and no more. Worked out here so Zo sees it
  // while he types, rather than finding out when the save is refused.
  const planable = choosable.filter((l) => Number(l.owed ?? 0) > 0);
  const planLot = choosable.find((l) => l.id === planLotId) ?? null;
  const planOwed = Number(planLot?.owed ?? 0);
  const planTotal =
    Math.round(Number(each || 0) * Number(count || 0) * 100) / 100;
  const planOver = planOwed > 0 && planTotal > planOwed;

  /**
   * Mint a signed URL, PUT the bytes straight to storage. The file never goes
   * through Vercel, which keeps it under the body limit and off our logs.
   */
  async function upload(file: File, kind: string) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

    const ticketRes = await fetch("/api/collections?photo=1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ kind, ext }),
    });

    const ticket = await ticketRes.json().catch(() => ({}));
    if (!ticketRes.ok) throw new Error(ticket?.error || "Could not start the upload");

    const put = await fetch(ticket.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

    if (!put.ok) throw new Error(`Photo upload failed (${put.status})`);

    return ticket.path as string;
  }

  async function send(path: string, body: unknown, done: string) {
    setBusy(true);
    setProblem("");

    try {
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(body),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Could not save");

      onDone(payload.message || done);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (kind === "rent") {
    const chosen = lot ?? choosable.find((l) => l.id === rentLotId) ?? null;
    const hap = Boolean(chosen?.hap_household);

    return (
      <Shell
        footer={
          <>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn
              disabled={
                busy || !contractRent || !rentLotId || (hap && !tenantPortion)
              }
              onClick={() =>
                send(
                  "/api/collections?rent=1",
                  {
                    lot_id: rentLotId,
                    contract_rent: Number(contractRent),
                    tenant_portion: hap ? Number(tenantPortion) : undefined,
                    note: rentNote || undefined,
                  },
                  "Rent recorded.",
                )
              }
              variant="primary"
            >
              {busy ? "Saving…" : "Record the rent"}
            </Btn>
          </>
        }
        inline={inline}
        onClose={onClose}
        sub={chosen ? `Lot ${chosen.lot_number}` : undefined}
        title="Set the rent for this home"
      >
        <div className="mb-5">
          <Stamp>
            Copy the figure from the signed lease. Do not work it out from what
            someone usually pays or what the last resident paid — this number is
            what a late fee gets charged against, so a guess here turns into a
            charge on a real person.
          </Stamp>
        </div>

        {!lot && (
          <div className="mb-4.5">
            <Label>Who is paying?</Label>
            <select
              className={inputClass}
              onChange={(e) => setRentLotId(e.target.value)}
              value={rentLotId}
            >
              <option value="">Pick a lot</option>
              {choosable.map((l) => (
                <option key={l.id} value={l.id}>
                  Lot {l.lot_number} — {l.tenant_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-4.5 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <Label>{hap ? "Contract rent" : "Monthly rent"}</Label>
            <input
              className={inputClass}
              inputMode="decimal"
              onChange={(e) => setContractRent(e.target.value)}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={contractRent}
            />
          </div>
          {hap && (
            <div className="min-w-0">
              <Label>Tenant's portion</Label>
              <input
                className={inputClass}
                inputMode="decimal"
                onChange={(e) => setTenantPortion(e.target.value)}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={tenantPortion}
              />
            </div>
          )}
        </div>

        {hap && (
          <div className="mb-4.5 rounded-[9px] border-l-4 border-l-[#D97706] bg-[#FFFCF5] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#92600A]">
            <b className="block text-[#7A4E06]">This is an assisted household</b>
            Two amounts, never one. The contract rent is the whole figure. The
            tenant's portion is the only part this resident can ever be chased
            for — the housing authority pays the rest.
          </div>
        )}

        <div className="mb-4.5">
          <Label>Where this came from (optional)</Label>
          <input
            className={inputClass}
            onChange={(e) => setRentNote(e.target.value)}
            placeholder="Signed lease dated 12 March, office file"
            type="text"
            value={rentNote}
          />
        </div>

        {problem && (
          <p className="mb-3 text-[15px] text-[#B91C1C]">{problem}</p>
        )}

        <Stamp>
          Saving this charges the month at that amount straight away. Nobody
          checks it after you — enter the figure Raj gave you, exactly as he
          gave it. If it turns out wrong, set it again and the charge moves
          with it.
        </Stamp>
      </Shell>
    );
  }

  if (kind === "pay") {
    return (
      <Shell
        footer={
          <>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn
              disabled={busy || !amount || !payLotId}
              onClick={async () => {
                setBusy(true);
                setProblem("");

                try {
                  const photo_path = payPhoto ? await upload(payPhoto, "receipt") : null;

                  await send(
                    "/api/collections?payment=1",
                    {
                      lot_id: payLotId,
                      amount: Number(amount),
                      received_at: received,
                      method,
                      note: payNote,
                      photo_path,
                    },
                    "Payment saved. Receipt sent. Reminders stopped for this lot.",
                  );
                } catch (err) {
                  setProblem(err instanceof Error ? err.message : "Could not save");
                  setBusy(false);
                }
              }}
              variant="primary"
            >
              {busy ? "Saving…" : "Save payment"}
            </Btn>
          </>
        }
        inline={inline}
        onClose={onClose}
        sub={lot ? `Lot ${lot.lot_number}` : undefined}
        title="Log a payment"
      >
        <div className="mb-5">
          <Stamp>
            Three taps: who, how much, how they paid. The receipt goes out by
            itself.
            <br />
            Only for cash and money orders handed to you at the park — bank
            deposits, the PO Box and online payments post on their own.
          </Stamp>
        </div>

        {!lot && (
          <div className="mb-4.5">
            <Label>Who is paying?</Label>
            <select
              className={inputClass}
              onChange={(e) => setPayLotId(e.target.value)}
              value={payLotId}
            >
              <option value="">Pick a lot</option>
              {payable.map((l) => (
                <option key={l.id} value={l.id}>
                  Lot {l.lot_number} — {l.tenant_name}
                </option>
              ))}
            </select>
            {/* A dropdown that is quietly missing homes reads as a bug. Say
                which ones are absent and why. */}
            {payable.length < choosable.length && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#6C7484]">
                {choosable.length - payable.length} of {choosable.length} homes
                are not listed because no rent is recorded for them yet. Set
                the rent on the roll first.
              </p>
            )}
          </div>
        )}

        {/* Stacked on a phone, side by side only when there is room. A native
            date input has an intrinsic minimum width that ignores its column,
            so in a two-column grid at 390px it pushed itself off the right
            edge. min-w-0 stops the cell doing the same on wider screens. */}
        <div className="mb-4.5 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
           <Label>How much?</Label>
            <input
              className={inputClass}
              inputMode="decimal"
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={amount}
            />
          </div>
          <div className="min-w-0">
            <Label>Date received</Label>
            <input
              className={`${inputClass} block appearance-none`}
              // You cannot receive money that has not been handed over yet.
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setReceived(e.target.value)}
              type="date"
              value={received}
            />
          </div>
        </div>

        <div className="mb-4.5">
          <Label>How did they pay?</Label>
          <select
            className={inputClass}
            onChange={(e) => setMethod(e.target.value)}
            value={method}
          >
            <option value="cash">Cash</option>
            <option value="money_order">Money order</option>
            <option value="cashiers_check">Cashier's check</option>
          </select>
          {/* The rule that was written on the cards. A money order
              photographed after it has been deposited is no longer proof of
              anything, so the reminder has to survive the change of control. */}
          {method !== "cash" && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#6C7484]">
              Photograph it before you deposit it.
            </p>
          )}
        </div>

        <div className="mb-4.5">
          <Label>Photo of the money order or plan (optional)</Label>
          <Shot
            file={payPhoto}
            hint="Skip only for cash with no stub"
            label="Take a photo"
            onPick={setPayPhoto}
          />
        </div>

        <div className="mb-4.5">
          <Label>Anything worth noting</Label>
          <textarea
            className={inputClass}
            onChange={(e) => setPayNote(e.target.value)}
            placeholder="Optional"
            rows={2}
            value={payNote}
          />
        </div>

        {problem && <p className="mb-3 text-[15px] text-[#B91C1C]">{problem}</p>}

        <Stamp>
          A numbered receipt texts and emails to the resident the second you save. That
          receipt protects you as much as it protects the park.
        </Stamp>
      </Shell>
    );
  }

  if (kind === "plan") {
    return (
      <Shell
        footer={
          <>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn
              disabled={busy || !planLotId || !each || !firstDue || planOver}
              onClick={() =>
                send(
                  "/api/collections?plan=1",
                  {
                    lot_id: planLotId,
                    each: Number(each),
                    count: Number(count),
                    first_due: firstDue,
                    frequency: freq,
                    reason: why,
                  },
                  "Sent to Raj. You will get a notification when he decides.",
                )
              }
              variant="primary"
            >
              {busy ? "Sending…" : "Send to Raj"}
            </Btn>
          </>
        }
        onClose={onClose}
        sub="Goes to Raj first"
        title="Propose a payment plan"
      >
        <div className="mb-4.5">
          <Label>Which lot</Label>
          <select
            className={inputClass}
            onChange={(e) => setPlanLotId(e.target.value)}
            value={planLotId}
          >
            <option value="">Pick a lot</option>
            {planable.map((l) => (
              <option key={l.id} value={l.id}>
                Lot {l.lot_number} — {l.tenant_name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[13px] leading-relaxed text-[#6C7484]">
            Only lots that owe something appear here. Lots already with Barrett
            never do.
          </p>

          {/* The balance and the running total, side by side. A plan for more
              than is owed would collect money the resident does not owe. */}
          {planLot && (
            <p
              className={`mt-2 text-[13.5px] font-semibold leading-relaxed ${
                planOver ? "text-[#B91C1C]" : "text-[#1B2231]"
              }`}
            >
              Owes {money(planOwed)} · this plan adds up to {money(planTotal)}
              {planOver ? " — that is more than is owed." : ""}
            </p>
          )}
        </div>

        <div className="mb-4.5 grid grid-cols-2 gap-3">
          <div>
            <Label>Each payment</Label>
            <input
              className={inputClass}
              inputMode="decimal"
              onChange={(e) => setEach(e.target.value)}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={each}
            />
          </div>
          <div>
            <Label>How many</Label>
            <input
              className={inputClass}
              inputMode="numeric"
              max={6}
              min={1}
              onChange={(e) => setCount(e.target.value)}
              type="number"
              value={count}
            />
          </div>
        </div>

        {/* Same fix as the payment form. A native date input has an intrinsic
            minimum width that ignores its column and runs off a 390px screen. */}
        <div className="mb-4.5 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <Label>First one due</Label>
            <input
              className={`${inputClass} block appearance-none`}
              // The first payment of a plan cannot already have passed.
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setFirstDue(e.target.value)}
              type="date"
              value={firstDue}
            />
          </div>
          <div className="min-w-0">
            <Label>How often</Label>
            <select
              className={inputClass}
              onChange={(e) => setFreq(e.target.value)}
              value={freq}
            >
              <option>Every two weeks</option>
              <option>Weekly</option>
              <option>Monthly</option>
            </select>
          </div>
        </div>

        <div className="mb-4.5">
          <Label>Why they are asking</Label>
          <textarea
            className={inputClass}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="In their words, briefly"
            rows={2}
            value={why}
          />
        </div>

        {problem && <p className="mb-3 text-[15px] text-[#B91C1C]">{problem}</p>}

        <Stamp>
          <b className="text-[#1B2231]">Do not print anything or collect a signature yet.</b>{" "}
          The plan document does not exist until Raj approves it. You will get a
          notification either way.
        </Stamp>
      </Shell>
    );
  }

  return (
    <Shell
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            disabled={busy || !wide || !close}
            onClick={async () => {
              setBusy(true);
              setProblem("");

              try {
                // Both, or nothing. A posting recorded with one photo is not
                // proof of service and the server refuses it anyway.
                const [wPath, cPath] = await Promise.all([
                  upload(wide!, "notice_wide"),
                  upload(close!, "notice_close"),
                ]);

                await send(
                  "/api/collections?posted=1",
                  {
                    lot_id: lot?.id,
                    photo_wide_path: wPath,
                    photo_close_path: cPath,
                    note: postNote,
                    geo_lat: coords?.lat ?? null,
                    geo_lng: coords?.lng ?? null,
                  },
                  "Proof of service filed. The three day clock started.",
                );
              } catch (err) {
                setProblem(err instanceof Error ? err.message : "Could not save");
                setBusy(false);
              }
            }}
            variant="primary"
          >
            {busy ? "Saving…" : "Save proof of service"}
          </Btn>
        </>
      }
      onClose={onClose}
      sub={lot ? `Lot ${lot.lot_number}` : undefined}
      title="Notice posted"
    >
      <div className="mb-5">
        <Stamp>
          Both photos are required. Barrett puts these in front of a judge to prove the
          notice was served. A blurry shot of a door nobody can identify is not proof.
        </Stamp>
      </div>

      <div className="mb-4.5">
        <Label>Photo 1 — the door with the notice on it</Label>
        <Shot
          file={wide}
          hint="Lot number has to be readable in the frame"
          label="Take the wide shot"
          onPick={setWide}
        />
      </div>

      <div className="mb-4.5">
        <Label>Photo 2 — the notice itself</Label>
        <Shot
          file={close}
          hint="Tenant name and date readable"
          label="Take the close shot"
          onPick={setClose}
        />
      </div>

      <div className="mb-4.5">
        <Label>Anything unusual</Label>
        <textarea
          className={inputClass}
          onChange={(e) => setPostNote(e.target.value)}
          placeholder="Dog in the yard, resident came to the door, home looked empty"
          rows={2}
          value={postNote}
        />
      </div>

      {problem && <p className="mb-3 text-[15px] text-[#B91C1C]">{problem}</p>}

      <Stamp>
        Time and place are captured for you —{" "}
        <b className="text-[#1B2231]">
          {new Date().toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </b>
        {geoState === "ok" && coords && (
          <>
            {" "}
            · {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </>
        )}
        {geoState === "asking" && <> · finding your location…</>}
        <br />
        Certified mail and the housing authority copy go out automatically today. You do
        not mail anything.
      </Stamp>

      {geoState === "none" && (
        <div className="mt-3 rounded-[9px] border-l-4 border-l-[#D97706] bg-[#FFFCF5] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#92600A]">
          <b className="block text-[#7A4E06]">Your phone could not find the location</b>
          You can still save this. We will note that the location was not available, so
          nobody thinks it was missed. The photos and the time are still recorded.
        </div>
      )}
    </Shell>
  );
}

/** Same token the rest of the cockpit uses. */
function token() {
  const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
  if (!key) return "";
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}").access_token ?? "";
  } catch {
    return "";
  }
}