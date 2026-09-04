// src/features/collections/Sheets.tsx
// The three bottom sheets: log a payment, propose a plan, record a posting.
//
// These carry the longest copy in the build and none of it is decorative. The
// stamps explain why a step exists - why Zo does not enter bank payments, why
// he must not collect a signature before Raj approves, why two photos are
// required. Raj wrote them as training. Do not shorten them.
import React from "react";
import { Btn } from "./parts";

type Lot = {
  id: string;
  lot_number: string;
  tenant_name: string | null;
};

type Props = {
  kind: "pay" | "plan" | "post";
  lot: Lot | null;
  data: { pastDue: Lot[]; current: Lot[] } | null;
  onClose: () => void;
  onDone: (message: string) => void;
};

function Shell({
  title,
  sub,
  onClose,
  children,
  footer,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
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

export function Sheets({ kind, lot, data, onClose, onDone }: Props) {
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
              {busy ? "Saving…" : "Save the payment"}
            </Btn>
          </>
        }
        onClose={onClose}
        sub={lot ? `Lot ${lot.lot_number}` : undefined}
        title="Log a payment"
      >
        <div className="mb-5">
          <Stamp>
            Only for cash and money orders handed to you at the park. Bank deposits, the
            PO Box, and online payments post on their own — you do not enter those.
          </Stamp>
        </div>

        {!lot && (
          <div className="mb-4.5">
            <Label>Which lot</Label>
            <select
              className={inputClass}
              onChange={(e) => setPayLotId(e.target.value)}
              value={payLotId}
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

        <div className="mb-4.5 grid grid-cols-2 gap-3">
          <div>
            <Label>Amount received</Label>
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
          <div>
            <Label>Date received</Label>
            <input
              className={inputClass}
              onChange={(e) => setReceived(e.target.value)}
              type="date"
              value={received}
            />
          </div>
        </div>

        <div className="mb-4.5">
          <Label>How it was paid — pick one</Label>
          <div className="grid gap-2.5">
            {[
              ["cash", "Cash", "Handed to you at the park"],
              ["money_order", "Money order", "Photograph it before you deposit it"],
              ["cashiers_check", "Cashier's check", "Photograph it before you deposit it"],
            ].map(([value, title, hint]) => (
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-[11px] border bg-white px-4 py-4 ${
                  method === value ? "border-[#1E3A8A] ring-2 ring-[#1E3A8A]/15" : "border-[#D5D8DE]"
                }`}
                key={value}
              >
                <input
                  checked={method === value}
                  className="mt-0.5 h-5 w-5 flex-none accent-[#1E3A8A]"
                  name="how"
                  onChange={() => setMethod(value)}
                  type="radio"
                />
                <span>
                  <span className="block text-[15.5px] font-bold">{title}</span>
                  <span className="mt-0.5 block text-[13.5px] text-[#6C7484]">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4.5">
          <Label>Photo of the money order or your receipt stub</Label>
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
              disabled={busy || !planLotId || !each || !firstDue}
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
            {choosable.map((l) => (
              <option key={l.id} value={l.id}>
                Lot {l.lot_number} — {l.tenant_name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[13px] text-[#6C7484]">
            Lots already with Barrett do not appear here.
          </p>
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

        <div className="mb-4.5 grid grid-cols-2 gap-3">
          <div>
            <Label>First one due</Label>
            <input
              className={inputClass}
              onChange={(e) => setFirstDue(e.target.value)}
              type="date"
              value={firstDue}
            />
          </div>
          <div>
            <Label>How often</Label>
            <select className={inputClass} onChange={(e) => setFreq(e.target.value)} value={freq}>
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