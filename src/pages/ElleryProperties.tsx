// src/pages/ElleryProperties.tsx
// Everything Able Housing Texas owns, on one screen.
//
// Red means a document is missing. That is the whole reason this screen
// exists - two occupied doors with nothing signed is legal and lender
// exposure, and it should be impossible to look at this list and not see it.

import React from "react";
import { Link } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ElleryTabBar } from "../components/ElleryTabBar";
import { UserMenu } from "../components/UserMenu";
import { apiFetch } from "../lib/apiFetch";
import { PropertyCard, type Property } from "../features/properties/parts";
import { PropertyEditor } from "../features/properties/PropertyEditor";

type Counts = {
  doors: number;
  occupied: number;
  lease_pending: number;
  missing_lease: number;
};

function Tile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "warn" | "alarm" | "good";
}) {
  const colour = {
    neutral: "text-[#0F1E33]",
    primary: "text-[#418BFF]",
    warn: "text-[#C2870B]",
    alarm: "text-[#B4462B]",
    good: "text-[#166534]",
  }[tone];

  return (
    <div className="rounded-2xl border border-[#DCE4EE] bg-white px-4 py-3.5">
      <p className={`text-[28px] font-bold leading-none ${colour}`}>{value}</p>
      <p className="mt-1.5 text-[12px] font-bold uppercase tracking-[0.07em] text-[#6C7484]">
        {label}
      </p>
    </div>
  );
}

const input =
  "mt-1.5 block w-full min-w-0 appearance-none rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-2.5 text-[15px] text-[#1B2231]";

const label =
  "block text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]";

export function ElleryProperties() {
  const [properties, setProperties] = React.useState<Property[] | null>(null);
  const [counts, setCounts] = React.useState<Counts | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/properties");
      if (res.status === 401) return;

      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load");

      setProperties(body.properties ?? []);
      setCounts(body.counts ?? null);
      setProblem("");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not load");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // The id, not the object. After a save the array is replaced, and a stored
  // object would leave the editor showing what the property used to be.
  const editing = properties?.find((p) => p.id === editingId) ?? null;

  return (
    <MobileScreenShell
      headerContent={
        <>
          <div className="flex items-center justify-between">
            <Link aria-label="Return to your cockpit" to="/">
              <img
                alt="Able Buys Homes"
                className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain shadow-sm"
                src="/able-logo.png"
              />
            </Link>
            <UserMenu />
          </div>

          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
            ABLE OS · Transaction coordination
          </p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Properties
          </h1>
          <p className="mt-2 max-w-md text-[16px] font-medium text-white/85">
            Every home we own, and what its file is still missing.
          </p>
        </>
      }
    >
      <section
        aria-label="Portfolio"
        className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4"
      >
        <Tile label="Homes" value={counts ? String(counts.doors) : "..."} />
        <Tile
          label="Lived in"
          tone="good"
          value={counts ? String(counts.occupied) : "..."}
        />
        <Tile
          label="Waiting on signing"
          tone="warn"
          value={counts ? String(counts.lease_pending) : "..."}
        />
        <Tile
          label="No lease signed"
          tone={counts && counts.missing_lease > 0 ? "alarm" : "neutral"}
          value={counts ? String(counts.missing_lease) : "..."}
        />
      </section>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-[14px] text-[#6C7484]">
          {properties
            ? `${properties.length} ${
                properties.length === 1 ? "property" : "properties"
              }`
            : "Loading…"}
        </p>
        <button
          className="rounded-[9px] border border-[#1E3A8A] bg-[#1E3A8A] px-3.5 py-2 text-[14px] font-semibold text-white"
          onClick={() => setAdding(true)}
          type="button"
        >
          Add a property
        </button>
      </div>

      {problem && (
        <p className="mt-3 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[15px] font-medium text-[#B91C1C]">
          {problem}
        </p>
      )}

      {properties && properties.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-[#DCE4EE] bg-white px-5 py-10 text-center">
          <p className="text-[15px] text-[#8291A5]">No homes added yet.</p>
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {(properties ?? []).map((p) => (
          <PropertyCard
            key={p.id}
            onEdit={() => setEditingId(p.id)}
            property={p}
          />
        ))}
      </div>

      {editing && (
        <PropertyEditor
          onChanged={load}
          onClose={() => setEditingId(null)}
          property={editing}
        />
      )}

      {adding && (
        <NewProperty
          onClose={() => setAdding(false)}
          onDone={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}

      <ElleryTabBar />
    </MobileScreenShell>
  );
}

function NewProperty({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("TX");
  const [note, setNote] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [drive, setDrive] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  async function submit() {
    setBusy(true);
    setProblem("");
    try {
      const res = await apiFetch("/api/properties", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          city: city.trim() || null,
          state: state.trim() || null,
          market_note: note.trim() || null,
          owner_name: owner.trim() || null,
          drive_url: drive.trim() || null,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not save");

      onDone();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0F1E33]/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(30,58,138,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 bg-[#1E3A8A] px-5 py-4">
          <h2 className="text-[18px] font-semibold text-white">
            Add a property
          </h2>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-5">
          <div>
            <label className={label}>Name</label>
            <input
              className={input}
              onChange={(e) => setName(e.target.value)}
              placeholder="1920 27th St — Duplex"
              type="text"
              value={name}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>City</label>
              <input
                className={input}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Lubbock"
                type="text"
                value={city}
              />
            </div>
            <div>
              <label className={label}>State</label>
              <input
                className={input}
                onChange={(e) => setState(e.target.value)}
                type="text"
                value={state}
              />
            </div>
          </div>

          <div>
            <label className={label}>Context line</label>
            <input
              className={input}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Fuller portfolio · seller-finance note"
              type="text"
              value={note}
            />
          </div>

          <div>
            <label className={label}>Owner of this item</label>
            <input
              className={input}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Ellery"
              type="text"
              value={owner}
            />
          </div>

          <div>
            <label className={label}>Drive folder link</label>
            <input
              className={input}
              onChange={(e) => setDrive(e.target.value)}
              placeholder="https://drive.google.com/..."
              type="url"
              value={drive}
            />
          </div>

          {problem && (
            <p className="text-[15px] font-medium text-[#B91C1C]">{problem}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-2.5 border-t border-[#DCE4EE] p-4">
          <button
            className="min-h-[44px] flex-1 rounded-[9px] border border-[#D5D8DE] bg-white text-[15px] font-semibold text-[#1B2231]"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-[44px] flex-1 rounded-[9px] border border-[#1E3A8A] bg-[#1E3A8A] text-[15px] font-semibold text-white disabled:opacity-45"
            disabled={busy || name.trim().length < 2}
            onClick={submit}
            type="button"
          >
            {busy ? "Saving…" : "Add it"}
          </button>
        </div>
      </div>
    </div>
  );
}
