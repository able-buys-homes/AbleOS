// src/features/properties/parts.tsx
// The property card and its pieces, in cockpit tokens.
//
// Layout comes from the walkthrough mock; the palette, type and spacing are the
// ones already on Zo's and Raj's screens.

import React from "react";

export type Unit = {
  id: string;
  property_id: string;
  label: string;
  occupied: boolean;
  tenant_name: string | null;
  lease_state: "none" | "draft" | "out_for_signature" | "signed";
  lease_version: string | null;
  lease_url: string | null;
  move_in_on: string | null;
  rent_amount: string | number | null;
  rent_note: string | null;
  rent_starts_on: string | null;
  applicant_id: string | null;
  notes: string | null;
};

export type Property = {
  id: string;
  portfolio: "ahtx" | "htm";
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  market_note: string | null;
  sale_status: "hold" | "for_sale" | "sold";
  appraisal_on_file: boolean;
  appraisal_note: string | null;
  payoff_note: string | null;
  owner_name: string | null;
  drive_url: string | null;
  details_confirmed: boolean;
  notes: string | null;
  units: Unit[];
  /** Worked out by the server from the doors, never stored. */
  status:
    | "missing_lease"
    | "lease_pending"
    | "for_sale"
    | "sold"
    | "occupied"
    | "vacant";
};

export function when(iso?: string | null) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function money(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  return `$${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

const STATUS: Record<Property["status"], { label: string; className: string }> =
  {
    missing_lease: {
      label: "Missing lease",
      className: "bg-[#FBEDEA] text-[#A83A2A]",
    },
    lease_pending: {
      label: "Lease pending",
      className: "bg-[#FDF4E0] text-[#92600A]",
    },
    for_sale: { label: "For sale", className: "bg-[#EAF1F8] text-[#2A5B8C]" },
    sold: { label: "Sold", className: "bg-[#EEF0F3] text-[#6C7484]" },
    occupied: { label: "Occupied", className: "bg-[#EAF6EE] text-[#166534]" },
    vacant: { label: "Vacant", className: "bg-[#EEF0F3] text-[#6C7484]" },
  };

export const LEASE_WORD: Record<Unit["lease_state"], string> = {
  none: "No signed lease on file",
  draft: "Draft",
  out_for_signature: "Awaiting signatures",
  signed: "Signed",
};

function Row({
  label,
  children,
  tone = "normal",
}: {
  label: string;
  children: React.ReactNode;
  tone?: "normal" | "alarm";
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#E3E5E9] py-2 last:border-b-0">
      <span className="shrink-0 text-[13.5px] text-[#6C7484]">{label}</span>
      <span
        className={`min-w-0 text-right text-[13.5px] font-semibold ${
          tone === "alarm" ? "text-[#A83A2A]" : "text-[#0F1E33]"
        }`}
      >
        {children}
      </span>
    </div>
  );
}

/** "2 units, both occupied". Counted, never typed - a typed count drifts. */
function doorLine(units: Unit[]) {
  if (units.length === 0) return "No doors recorded";

  const lived = units.filter((u) => u.occupied).length;
  const word = units.length === 1 ? "1 unit" : `${units.length} units`;

  if (lived === 0) return `${word}, empty`;
  if (lived === units.length) {
    return units.length === 1 ? `${word}, occupied` : `${word}, all occupied`;
  }
  return `${word}, ${lived} occupied`;
}

export function PropertyCard({
  property,
  onEdit,
}: {
  property: Property;
  onEdit: () => void;
}) {
  const pill = STATUS[property.status];
  const single = property.units.length === 1 ? property.units[0] : null;

  const context = [
    [property.city, property.state].filter(Boolean).join(", "),
    doorLine(property.units),
    property.market_note,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="rounded-2xl border border-[#DCE4EE] bg-white p-4 shadow-[0_1px_2px_rgba(30,58,138,0.04)] sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold tracking-[-0.02em] text-[#0F1E33]">
            {property.name}
          </h3>
          {context && (
            <p className="mt-0.5 text-[13.5px] leading-snug text-[#6C7484]">
              {context}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.05em] ${pill.className}`}
        >
          {pill.label}
        </span>
      </div>

      <div className="mt-3">
        {/* One door: its lease and rent read as the property's own. Several:
            each door gets its own line, because they can disagree. */}
        {single ? (
          <>
            <Row
              label="Lease"
              tone={
                single.occupied && single.lease_state !== "signed"
                  ? "alarm"
                  : "normal"
              }
            >
              {single.lease_version
                ? `${single.lease_version} — ${LEASE_WORD[single.lease_state]}`
                : LEASE_WORD[single.lease_state]}
            </Row>
            {single.move_in_on && (
              <Row label="Move-in">{when(single.move_in_on)}</Row>
            )}
            {(single.rent_note || single.rent_amount != null) && (
              <Row label="Rent">
                {single.rent_note || `${money(single.rent_amount)}/mo`}
                {single.rent_starts_on
                  ? ` from ${when(single.rent_starts_on)}`
                  : ""}
              </Row>
            )}
          </>
        ) : (
          property.units.map((u) => (
            <Row
              key={u.id}
              label={u.label}
              tone={
                u.occupied && u.lease_state !== "signed" ? "alarm" : "normal"
              }
            >
              {u.occupied ? u.tenant_name || "Occupied" : "Empty"}
              {" · "}
              {LEASE_WORD[u.lease_state]}
            </Row>
          ))
        )}

        {property.sale_status !== "hold" && (
          <Row label="Status">
            {property.sale_status === "for_sale"
              ? "To be sold, not refinanced"
              : "Sold"}
          </Row>
        )}

        {(property.appraisal_on_file || property.appraisal_note) && (
          <Row label="Appraisal">
            {property.appraisal_on_file
              ? `On file${
                  property.appraisal_note ? ` (${property.appraisal_note})` : ""
                }`
              : property.appraisal_note}
          </Row>
        )}

        {property.payoff_note && (
          <Row label="Note payoff">{property.payoff_note}</Row>
        )}

        {property.owner_name && (
          <Row label="Owner of this item">{property.owner_name}</Row>
        )}
      </div>

      {/* Said out loud rather than shown as confident figures. These came
          across from the Fuller portfolio and nobody has checked them against
          the Shared Drive yet. */}
      {!property.details_confirmed && (
        <p className="mt-3 rounded-[9px] border-l-4 border-l-[#D97706] bg-[#FFFCF5] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#92600A]">
          Details not confirmed against the Shared Drive yet.
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {property.drive_url ? (
         <a 
            className="min-h-[40px] rounded-[9px] border border-[#D5D8DE] bg-white px-3.5 py-2 text-[14px] font-semibold text-[#1B2231]"
            href={property.drive_url}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open file
          </a>
        ) : (
          <span className="min-h-[40px] rounded-[9px] border border-dashed border-[#D5D8DE] px-3.5 py-2 text-[14px] font-semibold text-[#A3B0C0]">
            No folder linked
          </span>
        )}

        <button
          className="min-h-[40px] rounded-[9px] border border-[#1E3A8A] bg-[#1E3A8A] px-3.5 py-2 text-[14px] font-semibold text-white"
          onClick={onEdit}
          type="button"
        >
          Open
        </button>
      </div>
    </article>
  );
}