// src/features/properties/PropertyEditor.tsx
// Editing one property and its doors.
//
// The property and each door save separately, on purpose. Ellery edits one
// thing at a time standing in a folder, and a single Save across the whole
// sheet would make a correction to Unit B feel like it might disturb Unit A.

import React from "react";
import { apiFetch } from "../../lib/apiFetch";
import { LEASE_WORD, type Property, type Unit } from "./parts";

const input =
  "mt-1.5 block w-full min-w-0 appearance-none rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-2.5 text-[15px] text-[#1B2231]";

const label =
  "block text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]";

function Field({
  label: text,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className={label}>{text}</label>
      {children}
    </div>
  );
}

export function PropertyEditor({
  property,
  onClose,
  onChanged,
}: {
  property: Property;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const [openUnit, setOpenUnit] = React.useState<string | null>(null);

  const [p, setP] = React.useState(property);

  // Follows the record rather than the first render, so a reload after saving
  // a door does not leave the property fields showing what they used to be.
  React.useEffect(() => setP(property), [property]);

  async function call(path: string, init: RequestInit) {
    setBusy(true);
    setProblem("");
    try {
      const res = await apiFetch(path, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save");
      await onChanged();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const saveProperty = () =>
    call(`/api/properties?id=${encodeURIComponent(p.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: p.name,
        address: p.address,
        city: p.city,
        state: p.state,
        market_note: p.market_note,
        owner_name: p.owner_name,
        drive_url: p.drive_url,
        sale_status: p.sale_status,
        appraisal_on_file: p.appraisal_on_file,
        appraisal_note: p.appraisal_note,
        payoff_note: p.payoff_note,
        details_confirmed: p.details_confirmed,
        notes: p.notes,
      }),
    });

  const addDoor = () =>
    call("/api/properties?unit=1", {
      method: "POST",
      body: JSON.stringify({
        property_id: p.id,
        label: `Unit ${String.fromCharCode(65 + property.units.length)}`,
      }),
    });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0F1E33]/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[#EEF2F6] shadow-[0_20px_40px_rgba(30,58,138,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 bg-[#1E3A8A] px-5 py-4">
          <h2 className="min-w-0 truncate text-[18px] font-semibold text-white">
            {property.name}
          </h2>
          <button
            aria-label="Close"
            className="shrink-0 text-[20px] leading-none text-white/80"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {problem && (
            <p className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[15px] font-medium text-[#B91C1C]">
              {problem}
            </p>
          )}

          {/* ---- the property ---- */}
          <section className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="What is it called">
                <input
                  className={input}
                  onChange={(e) => setP({ ...p, name: e.target.value })}
                  type="text"
                  value={p.name}
                />
              </Field>
              <Field label="Street address">
                <input
                  className={input}
                  onChange={(e) => setP({ ...p, address: e.target.value })}
                  type="text"
                  value={p.address ?? ""}
                />
              </Field>
              <Field label="City">
                <input
                  className={input}
                  onChange={(e) => setP({ ...p, city: e.target.value })}
                  type="text"
                  value={p.city ?? ""}
                />
              </Field>
              <Field label="State">
                <input
                  className={input}
                  onChange={(e) => setP({ ...p, state: e.target.value })}
                  type="text"
                  value={p.state ?? ""}
                />
              </Field>
              <Field label="Short note under the name">
                <input
                  className={input}
                  onChange={(e) => setP({ ...p, market_note: e.target.value })}
                  placeholder="Fuller portfolio · seller-finance note"
                  type="text"
                  value={p.market_note ?? ""}
                />
              </Field>
              <Field label="Who is looking after it">
                <input
                  className={input}
                  onChange={(e) => setP({ ...p, owner_name: e.target.value })}
                  type="text"
                  value={p.owner_name ?? ""}
                />
              </Field>
              <Field label="Link to its folder in Drive">
                <input
                  className={input}
                  onChange={(e) => setP({ ...p, drive_url: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  type="url"
                  value={p.drive_url ?? ""}
                />
              </Field>
              <Field label="Are we keeping it?">
                <select
                  className={input}
                  onChange={(e) =>
                    setP({
                      ...p,
                      sale_status: e.target.value as Property["sale_status"],
                    })
                  }
                  value={p.sale_status}
                >
                  <option value="hold">Yes, keeping it</option>
                  <option value="for_sale">No, selling it</option>
                  <option value="sold">No, already sold</option>
                </select>
              </Field>
              <Field label="Who did the appraisal">
                <input
                  className={input}
                  onChange={(e) =>
                    setP({ ...p, appraisal_note: e.target.value })
                  }
                  placeholder="Seideman"
                  type="text"
                  value={p.appraisal_note ?? ""}
                />
              </Field>
              <Field label="What is still owed on it">
                <input
                  className={input}
                  onChange={(e) => setP({ ...p, payoff_note: e.target.value })}
                  type="text"
                  value={p.payoff_note ?? ""}
                />
              </Field>
            </div>

            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2.5 text-[15px] text-[#1B2231]">
                <input
                  checked={p.appraisal_on_file}
                  onChange={(e) =>
                    setP({ ...p, appraisal_on_file: e.target.checked })
                  }
                  type="checkbox"
                />
                	We have the appraisal
              </label>
              <label className="flex items-center gap-2.5 text-[15px] text-[#1B2231]">
                <input
                  checked={p.details_confirmed}
                  onChange={(e) =>
                    setP({ ...p, details_confirmed: e.target.checked })
                  }
                  type="checkbox"
                />
                I have checked these against the Drive
              </label>
            </div>

            <button
              className="mt-3.5 min-h-[44px] w-full rounded-[9px] border border-[#1E3A8A] bg-[#1E3A8A] text-[15px] font-semibold text-white disabled:opacity-45"
              disabled={busy || !p.name.trim()}
              onClick={saveProperty}
              type="button"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </section>

          {/* ---- the doors ---- */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.09em] text-[#6C7484]">
                Homes — {property.units.length}
              </p>
              <button
                className="rounded-[9px] border border-[#D5D8DE] bg-white px-3 py-1.5 text-[14px] font-semibold text-[#1B2231]"
                disabled={busy}
                onClick={addDoor}
                type="button"
              >
                Add a home
              </button>
            </div>

            {property.units.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#DCE4EE] bg-white px-5 py-6 text-center text-[15px] text-[#8291A5]">
                No homes added yet.
              </div>
            )}

            {property.units.map((u) => (
              <UnitRow
                busy={busy}
                key={u.id}
                onSave={(patch) =>
                  call(`/api/properties?unit=${encodeURIComponent(u.id)}`, {
                    method: "PATCH",
                    body: JSON.stringify(patch),
                  })
                }
                onRemove={() =>
                  call(`/api/properties?unit=${encodeURIComponent(u.id)}`, {
                    method: "DELETE",
                  })
                }
                onToggle={() => setOpenUnit(openUnit === u.id ? null : u.id)}
                open={openUnit === u.id}
                unit={u}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function UnitRow({
  unit,
  open,
  busy,
  onToggle,
  onSave,
  onRemove,
}: {
  unit: Unit;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const [u, setU] = React.useState(unit);

  React.useEffect(() => setU(unit), [unit]);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={onToggle}
        type="button"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-[#0F1E33]">
            {unit.label}
          </span>
          <span className="mt-0.5 block truncate text-[13.5px] text-[#6C7484]">
            {unit.occupied
              ? `${unit.tenant_name || "Occupied"} · ${LEASE_WORD[unit.lease_state]}`
              : `Empty · ${LEASE_WORD[unit.lease_state]}`}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-[#8A929E]">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="border-t border-[#E3E5E9] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What to call it">
              <input
                className={input}
                onChange={(e) => setU({ ...u, label: e.target.value })}
                type="text"
                value={u.label}
              />
            </Field>
            <Field label="Who lives there">
              <input
                className={input}
                onChange={(e) => setU({ ...u, tenant_name: e.target.value })}
                placeholder="Full name"
                type="text"
                value={u.tenant_name ?? ""}
              />
            </Field>
            <Field label="Where the lease is up to">
              <select
                className={input}
                onChange={(e) =>
                  setU({
                    ...u,
                    lease_state: e.target.value as Unit["lease_state"],
                  })
                }
                value={u.lease_state}
              >
                <option value="none">No lease signed yet</option>
                <option value="draft">Being written</option>
                <option value="out_for_signature">Waiting for signatures</option>
                <option value="signed">Signed and on file</option>
              </select>
            </Field>
            <Field label="Which version">
              <input
                className={input}
                onChange={(e) => setU({ ...u, lease_version: e.target.value })}
                placeholder="v10"
                type="text"
                value={u.lease_version ?? ""}
              />
            </Field>
            <Field label="Link to the lease">
              <input
                className={input}
                onChange={(e) => setU({ ...u, lease_url: e.target.value })}
                type="url"
                value={u.lease_url ?? ""}
              />
            </Field>
            	<Field label="When they moved in">
              <input
                className={input}
                onChange={(e) => setU({ ...u, move_in_on: e.target.value })}
                type="date"
                value={u.move_in_on ?? ""}
              />
            </Field>
            	<Field label="Rent each month">
              <input
                className={input}
                inputMode="decimal"
                onChange={(e) => setU({ ...u, rent_amount: e.target.value })}
                placeholder="3000"
                step="0.01"
                type="number"
                value={u.rent_amount ?? ""} 
              />
            </Field>
            <Field label="If the rent needs explaining">
              <input
                className={input}
                onChange={(e) => setU({ ...u, rent_note: e.target.value })}
                placeholder="$2,800 + $200 pool = $3,000/mo"
                type="text"
                value={u.rent_note ?? ""}
              />
            </Field>
            <Field label="When rent starts">
              <input
                className={input}
                onChange={(e) => setU({ ...u, rent_starts_on: e.target.value })}
                type="date"
                value={u.rent_starts_on ?? ""}
              />
            </Field>
          </div>

          <label className="mt-3 flex items-center gap-2.5 text-[15px] text-[#1B2231]">
            <input
              checked={u.occupied}
              onChange={(e) => setU({ ...u, occupied: e.target.checked })}
              type="checkbox"
            />
            Somebody lives here
          </label>

          <div className="mt-3.5 flex flex-wrap gap-2.5">
            <button
              className="min-h-[44px] flex-1 rounded-[9px] border border-[#1E3A8A] bg-[#1E3A8A] text-[15px] font-semibold text-white disabled:opacity-45"
              disabled={busy || !u.label.trim()}
              onClick={() =>
                onSave({
                  label: u.label,
                  occupied: u.occupied,
                  tenant_name: u.tenant_name,
                  lease_state: u.lease_state,
                  lease_version: u.lease_version,
                  lease_url: u.lease_url,
                  move_in_on: u.move_in_on,
                  rent_amount: u.rent_amount,
                  rent_note: u.rent_note,
                  rent_starts_on: u.rent_starts_on,
                })
              }
              type="button"
            >
              {busy ? "Saving…" : "Save this home"}
            </button>
            <button
              className="min-h-[44px] rounded-[9px] border border-[#D5D8DE] bg-white px-4 text-[15px] font-semibold text-[#B4462B] disabled:opacity-45"
              disabled={busy}
              onClick={onRemove}
              type="button"
            >
              Delete this home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
