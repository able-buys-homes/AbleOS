// src/pages/ZoMoveIn.tsx
// Exhibit C - the move-in condition checklist, walked on Zo's phone.
//
// Same items, same order and same wording as the paper form, so a resident
// who has seen one recognises the other. Fair or Poor needs a note and a
// photo before it can be signed - that is what the deposit is argued over
// at move-out. Saves as Zo goes: a dropped signal must not cost him the walk.

import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ZoScreenHeader } from "../components/ZoScreenHeader";
import { ZoTabBar } from "../components/ZoTabBar";
import { apiFetch } from "../lib/apiFetch";
import { Btn } from "../features/collections/parts";

type Rating = "good" | "fair" | "poor" | "na";
type Item = { rating: Rating | null; note: string; photos: string[]; photo_urls?: (string | null)[] };
type Section = { key: string; title: string; optional?: boolean; lotOnly?: boolean; items: [string, string, boolean?][] };

const ROOM = (p: string): [string, string][] => [
  [`${p}.door`, "Entry door, lock & deadbolt"],
  [`${p}.walls`, "Walls & ceiling"],
  [`${p}.floors`, "Floors / carpet"],
  [`${p}.windows`, "Windows, screens & blinds"],
  [`${p}.lights`, "Light fixtures & switches"],
  [`${p}.outlets`, "Outlets & cover plates"],
  [`${p}.closet`, "Closet & doors"],
];

// [key, label, allowsNotApplicable]
const SECTIONS: Section[] = [
  { key: "ext", title: "1. Exterior & Lot", lotOnly: true, items: [
    ["ext.skirting", "Skirting & vents"], ["ext.steps", "Steps, porch / deck & handrails"], ["ext.siding", "Siding & trim"],
    ["ext.roof", "Roof & gutters (visible)"], ["ext.doors", "Exterior doors & storm doors"], ["ext.lights", "Exterior lights"],
    ["ext.yard", "Yard, driveway & parking pad"], ["ext.trash", "Trash / debris on lot"],
    ["ext.hookups", "Water, sewer & electric hookups"], ["ext.shed", "Shed / outbuilding", true],
  ] },
  { key: "liv", title: "2. Living Room", items: ROOM("liv") },
  { key: "kit", title: "3. Kitchen", items: [
    ["kit.walls", "Walls, ceiling & floors"], ["kit.cabinets", "Cabinets, drawers & countertops"],
    ["kit.sink", "Sink, faucet & drain (no leaks underneath)"], ["kit.fridge", "Refrigerator & freezer (cold)"],
    ["kit.range", "Range / oven (all burners heat)"], ["kit.hood", "Range hood & light"],
    ["kit.dishwasher", "Dishwasher (if any)", true], ["kit.outlets", "Lights & outlets (GFCI tested)"],
  ] },
  { key: "ba1", title: "4. Bathroom 1", items: [
    ["ba1.walls", "Walls, ceiling & floors"], ["ba1.toilet", "Toilet (flushes, no rock, no leaks)"],
    ["ba1.sink", "Sink, faucet & drain"], ["ba1.tub", "Tub / shower, faucet & caulk"],
    ["ba1.vanity", "Vanity, mirror & medicine cabinet"], ["ba1.fan", "Exhaust fan"], ["ba1.outlets", "Lights & outlets (GFCI tested)"],
  ] },
  { key: "ba2", title: "5. Bathroom 2", optional: true, items: [
    ["ba2.walls", "Walls, ceiling & floors"], ["ba2.toilet", "Toilet (flushes, no rock, no leaks)"],
    ["ba2.sink", "Sink, faucet & drain"], ["ba2.tub", "Tub / shower, faucet & caulk"], ["ba2.fan", "Exhaust fan, lights & GFCI"],
  ] },
  { key: "bd1", title: "6. Bedroom 1", items: ROOM("bd1") },
  { key: "bd2", title: "7. Bedroom 2", optional: true, items: ROOM("bd2") },
  { key: "bd3", title: "8. Bedroom 3", optional: true, items: ROOM("bd3") },
  { key: "mech", title: "9. Laundry & Mechanical", items: [
    ["mech.hookups", "Washer / dryer hookups"], ["mech.vent", "Dryer vent (vented outside)"],
    ["mech.water_heater", "Water heater (no leaks, hot water at taps)"], ["mech.heat", "Furnace / heat (heats)"],
    ["mech.ac", "A/C (cools)", true], ["mech.filter", "HVAC filter (new)"],
    ["mech.panel", "Electrical panel (breakers labeled)"], ["mech.shutoff", "Water shut-off location shown to resident"],
  ] },
  { key: "safe", title: "10. Safety", lotOnly: true, items: [
    ["safe.smoke_bed", "Smoke alarm - each bedroom (tested)"], ["safe.smoke_hall", "Smoke alarm - hallway / living (tested)"],
    ["safe.co", "Carbon monoxide alarm (if gas/propane)", true], ["safe.wires", "No exposed wires or missing cover plates"],
    ["safe.address", "Lot address / number visible from road"],
  ] },
];

const KEY_FIELDS: [string, string][] = [
  ["key_front", "Front door keys"], ["key_back", "Back door keys"], ["key_mailbox", "Mailbox keys"],
  ["key_shed", "Shed keys"], ["key_other", "Other keys"], ["meter_electric", "Electric meter"],
  ["meter_water", "Water meter"], ["meter_gas", "Gas / propane meter"], ["hvac_filter_size", "HVAC filter size"],
];

const RATE: { v: Rating; label: string; on: string }[] = [
  { v: "good", label: "Good", on: "border-[#1B7A4B] bg-[#E7F6EE] text-[#14532D]" },
  { v: "fair", label: "Fair", on: "border-[#B45309] bg-[#FEF3C7] text-[#78350F]" },
  { v: "poor", label: "Poor", on: "border-[#B42318] bg-[#FDECEC] text-[#9B1C1C]" },
  { v: "na", label: "N/A", on: "border-[#64748B] bg-[#EEF0F3] text-[#334155]" },
];

const inputClass =
  "w-full rounded-[9px] border border-[#D5D8DE] bg-white px-3.5 py-3 text-[16px] text-[#1B2231] focus:border-[#1E3A8A] focus:outline-none";

async function json(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Something went wrong");
  return body;
}

async function upload(lotId: string, blob: Blob, ext: string) {
  const ticket = await json(await apiFetch("/api/move-in?photo=1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lot_id: lotId, ext }),
  }));
  const put = await fetch(ticket.signedUrl, { method: "PUT", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return ticket.path as string;
}

/** A finger-drawn signature. Returns a PNG, or null if nothing was drawn. */
function SignaturePad({ label, onChange }: { label: string; onChange: (b: Blob | null) => void }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const drawn = React.useRef(false);

  React.useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1B2231";
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    ref.current!.toBlob((b) => onChange(drawn.current ? b : null), "image/png");
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    drawn.current = false;
    onChange(null);
  };

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">{label}</span>
        <button className="text-[13px] font-semibold text-[#1E3A8A]" onClick={clear} type="button">Clear</button>
      </div>
      <canvas
        className="h-[130px] w-full touch-none rounded-[9px] border border-[#D5D8DE] bg-white"
        onPointerDown={(e) => {
          drawing.current = true;
          const [x, y] = point(e);
          const ctx = ref.current!.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const [x, y] = point(e);
          const ctx = ref.current!.getContext("2d")!;
          ctx.lineTo(x, y);
          ctx.stroke();
          drawn.current = true;
        }}
        onPointerUp={finish}
        onPointerLeave={finish}
        ref={ref}
      />
    </div>
  );
}

export function ZoMoveIn() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = params.get("id");

  const [lots, setLots] = React.useState<any[]>([]);
  const [pickLot, setPickLot] = React.useState("");
  const [drafts, setDrafts] = React.useState<any[]>([]);
  const [c, setC] = React.useState<any | null>(null);
  const [problem, setProblem] = React.useState("");
  const [saved, setSaved] = React.useState<"" | "saving" | "saved">("");
  const [busy, setBusy] = React.useState(false);
  const [stage, setStage] = React.useState<"fill" | "sign">("fill");
  const [sig1, setSig1] = React.useState<Blob | null>(null);
  const [sig2, setSig2] = React.useState<Blob | null>(null);
  const [sigZo, setSigZo] = React.useState<Blob | null>(null);
  const [copyGiven, setCopyGiven] = React.useState(false);
  const [skipped, setSkipped] = React.useState<Record<string, boolean>>({});
  const timer = React.useRef<number | undefined>(undefined);

  // The lot list, for starting one.
  React.useEffect(() => {
    if (id) return;
    apiFetch("/api/move-in?lots=1").then(json).then((b) => setLots(b.lots ?? [])).catch((e) => setProblem(e.message));
  }, [id]);

  React.useEffect(() => {
    if (!pickLot) return setDrafts([]);
    apiFetch(`/api/move-in?lot_id=${pickLot}`).then(json).then((b) => setDrafts(b.checklists ?? [])).catch(() => setDrafts([]));
  }, [pickLot]);

  const load = React.useCallback(async () => {
    if (!id) return;
    try {
      const b = await json(await apiFetch(`/api/move-in?id=${id}`));
      setC(b.checklist);
      // Optional rooms the home does not have start skipped.
      const beds = Number(b.checklist.bedrooms ?? 0), baths = Number(b.checklist.baths ?? 0);
      setSkipped((s) => ({ ba2: baths > 0 && baths < 2, bd2: beds > 0 && beds < 2, bd3: beds > 0 && beds < 3, ...s }));
    } catch (e: any) {
      setProblem(e.message);
    }
  }, [id]);
  React.useEffect(() => { load(); }, [load]);

  const save = (next: any) => {
    setC(next);
    setSaved("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const items: Record<string, Item> = {};
        for (const [k, v] of Object.entries(next.items ?? {})) {
          const it = v as Item;
          items[k] = { rating: it.rating, note: it.note, photos: it.photos };
        }
        await json(await apiFetch(`/api/move-in?id=${next.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items, keys_meters: next.keys_meters, resident_names: next.resident_names,
            move_in_on: next.move_in_on, lease_type: next.lease_type, bedrooms: next.bedrooms, baths: next.baths,
          }),
        }));
        setSaved("saved");
      } catch (e: any) {
        setSaved("");
        setProblem(e.message);
      }
    }, 900);
  };

  const setItem = (key: string, patch: Partial<Item>) => {
    const cur: Item = c.items?.[key] ?? { rating: null, note: "", photos: [], photo_urls: [] };
    save({ ...c, items: { ...c.items, [key]: { ...cur, ...patch } } });
  };

  const addPhoto = async (key: string, file: File) => {
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = await upload(c.lot_id, file, ext);
      const cur: Item = c.items?.[key] ?? { rating: null, note: "", photos: [], photo_urls: [] };
      setItem(key, { photos: [...cur.photos, path], photo_urls: [...(cur.photo_urls ?? []), URL.createObjectURL(file)] });
    } catch (e: any) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sections = c
    ? SECTIONS.filter((s) => c.lease_type !== "lot_only" || s.lotOnly).filter((s) => !skipped[s.key])
    : [];
  const allItems = sections.flatMap((s) => s.items);
  const rated = allItems.filter(([k]) => c?.items?.[k]?.rating).length;
  const needsProof = allItems.filter(([k]) => {
    const it = c?.items?.[k];
    return it && (it.rating === "fair" || it.rating === "poor") && (!it.note?.trim() || !(it.photos ?? []).length);
  });

  const start = async (lotId: string) => {
    setBusy(true);
    try {
      const b = await json(await apiFetch("/api/move-in", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lot_id: lotId }),
      }));
      setParams({ id: b.id });
    } catch (e: any) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sign = async () => {
    setBusy(true);
    setProblem("");
    try {
      if (!sig1) throw new Error("The resident needs to sign");
      if (!sigZo) throw new Error("You need to sign for the community");
      const [p1, p2, pz] = await Promise.all([
        upload(c.lot_id, sig1, "png"),
        sig2 ? upload(c.lot_id, sig2, "png") : Promise.resolve(null),
        upload(c.lot_id, sigZo, "png"),
      ]);
      await json(await apiFetch(`/api/move-in?sign=1&id=${c.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resident_signature: p1, resident2_signature: p2, community_signature: pz, copy_given: copyGiven }),
      }));
      setStage("fill");
      await load();
    } catch (e: any) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  };

  const signed = c?.status === "signed";

  return (
    <MobileScreenShell
      headerContent={
        <ZoScreenHeader
          eyebrow="Hometown Meadows MHP"
          stat={c ? `Lot ${c.lot_number}${signed ? " · signed" : ` · ${rated} of ${allItems.length} checked`}` : undefined}
          subtitle="Exhibit C. Walk the home with the resident."
          title="Move-in checklist"
        />
      }
    >
      <div className="pb-28 pt-4">
        {problem && (
          <div className="mb-4 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[15px] text-[#B91C1C]" onClick={() => setProblem("")}>
            {problem}
          </div>
        )}

        {/* ---------- pick a lot ---------- */}
        {!id && (
          <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
            <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">Which lot?</label>
            <select className={inputClass} onChange={(e) => setPickLot(e.target.value)} value={pickLot}>
              <option value="">Pick a lot</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  Lot {l.lot_number}{l.tenant_name ? ` - ${l.tenant_name}` : ""}
                </option>
              ))}
            </select>
            {drafts.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-[13px] font-semibold text-[#6C7484]">Already started for this lot</div>
                {drafts.map((d) => (
                  <button
                    className="mb-2 block w-full rounded-[9px] border border-[#D5D8DE] px-3.5 py-3 text-left text-[14.5px]"
                    key={d.id}
                    onClick={() => setParams({ id: d.id })}
                    type="button"
                  >
                    {d.status === "signed" ? "Signed" : "Draft"} · {d.resident_names ?? "No name yet"} · {String(d.created_at).slice(0, 10)}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2.5 [&>button]:flex-1">
              <Btn onClick={() => navigate("/zo/collections")}>Back</Btn>
              <Btn disabled={!pickLot || busy} onClick={() => start(pickLot)} variant="primary">
                {busy ? "Starting…" : "Start a new one"}
              </Btn>
            </div>
          </div>
        )}

        {id && !c && !problem && (
          <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[15px] text-[#6C7484]">Loading…</div>
        )}

        {/* ---------- the walk ---------- */}
        {c && stage === "fill" && (
          <>
            <div className="mb-4 rounded-2xl border border-[#DCE4EE] bg-white p-4">
              <div className="grid gap-3">
                <div>
                  <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">Resident(s)</label>
                  <input className={inputClass} disabled={signed} onChange={(e) => save({ ...c, resident_names: e.target.value })} value={c.resident_names ?? ""} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">Move-in date</label>
                    <input className={inputClass} disabled={signed} onChange={(e) => save({ ...c, move_in_on: e.target.value })} type="date" value={c.move_in_on ?? ""} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">Lease type</label>
                    <select className={inputClass} disabled={signed} onChange={(e) => save({ ...c, lease_type: e.target.value })} value={c.lease_type}>
                      <option value="home_and_lot">Home and Lot</option>
                      <option value="lot_only">Lot Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">Bedrooms</label>
                    <input className={inputClass} disabled={signed} inputMode="numeric" onChange={(e) => save({ ...c, bedrooms: e.target.value })} value={c.bedrooms ?? ""} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">Baths</label>
                    <input className={inputClass} disabled={signed} inputMode="decimal" onChange={(e) => save({ ...c, baths: e.target.value })} value={c.baths ?? ""} />
                  </div>
                </div>
                {c.lease_type === "lot_only" && (
                  <p className="text-[13px] text-[#6C7484]">Lot Only: the resident owns the home, so only Exterior, Safety and Keys are checked.</p>
                )}
                {signed && (
                  <p className="rounded-[9px] bg-[#E7F6EE] px-3.5 py-3 text-[13.5px] text-[#14532D]">
                    Signed {String(c.signed_at).slice(0, 10)}. The resident can add missed items in writing until {String(c.additions_due_at).slice(0, 10)}.
                  </p>
                )}
              </div>
            </div>

            {SECTIONS.filter((s) => c.lease_type !== "lot_only" || s.lotOnly).map((s) => (
              <div className="mb-4 rounded-2xl border border-[#DCE4EE] bg-white p-4" key={s.key}>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[16px] font-bold">{s.title}</h2>
                  {s.optional && !signed && (
                    <button
                      className="text-[13px] font-semibold text-[#1E3A8A]"
                      onClick={() => setSkipped({ ...skipped, [s.key]: !skipped[s.key] })}
                      type="button"
                    >
                      {skipped[s.key] ? "This home has one" : "Not in this home"}
                    </button>
                  )}
                </div>
                {skipped[s.key] ? (
                  <p className="text-[13.5px] text-[#6C7484]">Not in this home.</p>
                ) : (
                  s.items.map(([key, label, naOk]) => {
                    const it: Item = c.items?.[key] ?? { rating: null, note: "", photos: [] };
                    const needs = (it.rating === "fair" || it.rating === "poor");
                    return (
                      <div className="border-t border-[#E3E5E9] py-3 first:border-t-0" key={key}>
                        <div className="mb-2 text-[14.5px] font-semibold text-[#1B2231]">{label}</div>
                        <div className="flex gap-2">
                          {RATE.filter((r) => r.v !== "na" || naOk).map((r) => (
                            <button
                              className={`flex-1 rounded-[9px] border px-2 py-2.5 text-[14px] font-bold ${it.rating === r.v ? r.on : "border-[#D5D8DE] bg-white text-[#6C7484]"}`}
                              disabled={signed}
                              key={r.v}
                              onClick={() => setItem(key, { rating: r.v })}
                              type="button"
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                        {(needs || it.note || (it.photos ?? []).length > 0) && (
                          <div className="mt-2.5">
                            <textarea
                              className={inputClass}
                              disabled={signed}
                              onChange={(e) => setItem(key, { note: e.target.value })}
                              placeholder={needs ? "What is wrong? (required)" : "Note"}
                              rows={2}
                              value={it.note ?? ""}
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {(it.photo_urls ?? []).map((u, i) => u && (
                                <img alt="" className="h-16 w-16 rounded-[8px] object-cover" key={i} src={u} />
                              ))}
                              {!signed && (
                                <label className="cursor-pointer rounded-[9px] border border-dashed border-[#1E3A8A] px-3 py-2 text-[13.5px] font-semibold text-[#1E3A8A]">
                                  {needs && !(it.photos ?? []).length ? "Add photo (required)" : "Add photo"}
                                  <input
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={(e) => e.target.files?.[0] && addPhoto(key, e.target.files[0])}
                                    type="file"
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {/* Most of a home is fine. Zo taps the problems, then fills the
                    rest in one go - it never overwrites a Fair or Poor. */}
                {!signed && !skipped[s.key] && s.items.some(([k]) => !c.items?.[k]?.rating) && (
                  <button
                    className="mt-2 w-full rounded-[9px] border border-[#1B7A4B] px-3 py-2.5 text-[14px] font-bold text-[#1B7A4B]"
                    onClick={() =>
                      save({
                        ...c,
                        items: {
                          ...c.items,
                          ...Object.fromEntries(
                            s.items
                              .filter(([k]) => !c.items?.[k]?.rating)
                              .map(([k]) => [k, { rating: "good", note: "", photos: [], photo_urls: [] }]),
                          ),
                        },
                      })
                    }
                    type="button"
                  >
                    Mark the rest Good
                  </button>
                )}
              </div>
            ))}

            <div className="mb-4 rounded-2xl border border-[#DCE4EE] bg-white p-4">
              <h2 className="mb-3 text-[16px] font-bold">11. Keys & readings</h2>
              <div className="grid grid-cols-2 gap-3">
                {KEY_FIELDS.map(([k, label]) => (
                  <div key={k}>
                    <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.06em] text-[#8A929E]">{label}</label>
                    <input
                      className={inputClass}
                      disabled={signed}
                      onChange={(e) => save({ ...c, keys_meters: { ...(c.keys_meters ?? {}), [k]: e.target.value } })}
                      value={c.keys_meters?.[k] ?? ""}
                    />
                  </div>
                ))}
              </div>
            </div>

            {signed ? (
              <div className="flex gap-2.5 [&>button]:flex-1">
                <Btn onClick={() => navigate("/zo/collections")}>Back to Rent</Btn>
                <Btn onClick={() => window.print()} variant="primary">Print / save PDF</Btn>
              </div>
            ) : (
              <div className="sticky bottom-20 rounded-2xl border border-[#DCE4EE] bg-white p-3 shadow-lg">
                <div className="mb-2 text-[13px] text-[#6C7484]">
                  {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : " "} · {rated} of {allItems.length} checked
                  {needsProof.length > 0 ? ` · ${needsProof.length} need a note and photo` : ""}
                </div>
                <div className="flex gap-2.5 [&>button]:flex-1">
                  <Btn onClick={() => navigate("/zo/collections")}>Finish later</Btn>
                  <Btn
                    disabled={busy || rated < allItems.length || needsProof.length > 0}
                    onClick={() => { setStage("sign"); window.scrollTo(0, 0); }}
                    variant="primary"
                  >
                    Go to signatures
                  </Btn>
                </div>
              </div>
            )}
          </>
        )}

        {/* ---------- signatures ---------- */}
        {c && stage === "sign" && (
          <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
            <p className="mb-4 text-[13.5px] leading-relaxed text-[#6C7484]">
              The resident has 5 days after move-in to add anything missed, in writing. Anything not listed counts as
              good at move-in, and this is compared at move-out (Lease Sections 6 and 18).
            </p>
            <SignaturePad label="Resident 1" onChange={setSig1} />
            <SignaturePad label="Resident 2 (if any)" onChange={setSig2} />
            <SignaturePad label="Community - Zo" onChange={setSigZo} />
            <label className="mb-4 flex items-start gap-3 text-[14px]">
              <input checked={copyGiven} className="mt-1 h-5 w-5" onChange={(e) => setCopyGiven(e.target.checked)} type="checkbox" />
              <span>The resident received a copy of this checklist.</span>
            </label>
            <div className="flex gap-2.5 [&>button]:flex-1">
              <Btn onClick={() => setStage("fill")}>Back</Btn>
              <Btn disabled={busy || !sig1 || !sigZo} onClick={sign} variant="primary">
                {busy ? "Signing…" : "Sign and finish"}
              </Btn>
            </div>
          </div>
        )}
      </div>
      <ZoTabBar />
    </MobileScreenShell>
  );
}
