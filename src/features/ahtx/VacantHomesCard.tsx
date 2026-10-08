// src/features/ahtx/VacantHomesCard.tsx
// Rex's AHTX vacant homes (Raj, v1). Read-only. Same data as the rex_units MCP
// tool, so his screen and Raj's AI always agree. Access notes never carry a
// code - those stay with the office.

import React from "react";
import { apiFetch } from "../../lib/apiFetch";

type Home = {
  property: string;
  address: string;
  label: string;
  beds: number | null;
  baths: number | null;
  sq_ft: number | null;
  rent_amount: number | null;
  available_on: string | null;
  pets_policy: string | null;
  access_note: string | null;
  details_confirmed: boolean;
  notes: string | null;
};

const money = (n: number | null) => (n == null ? "Rent not set" : `$${Number(n).toLocaleString("en-US")}/mo`);

function daysSince(iso: string | null) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - Date.parse(`${iso}T12:00:00`)) / 86400000);
  return d >= 0 ? d : null;
}

export function VacantHomesCard() {
  const [homes, setHomes] = React.useState<Home[] | null>(null);
  const [problem, setProblem] = React.useState("");

  React.useEffect(() => {
    apiFetch("/api/rex-units")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Could not load the vacant homes");
        setHomes(body.vacant_homes ?? []);
      })
      .catch((e) => setProblem(e.message));
  }, []);

  return (
    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-5 shadow-[0_8px_20px_rgba(30,58,138,0.06)]">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-extrabold tracking-[-0.02em] text-[#1A1A2E]">Vacant homes · AHTX</h3>
        {homes && (
          <span className="rounded-full bg-[#EEF3FB] px-2.5 py-0.5 text-[12px] font-bold text-[#1E3A8A]">{homes.length}</span>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-[#6B7A90]">Read-only. Ask the office for lockbox or door codes - they are never shown here.</p>

      {problem && <p className="mt-3 text-[13px] font-semibold text-[#B91C1C]">{problem}</p>}
      {!homes && !problem && <p className="mt-3 text-[13px] text-[#6B7A90]">Loading…</p>}
      {homes && homes.length === 0 && <p className="mt-3 text-[13px] text-[#6B7A90]">No vacant AHTX homes right now.</p>}

      <div className="mt-3 grid gap-3">
        {(homes ?? []).map((h) => {
          const days = daysSince(h.available_on);
          return (
            <div className="rounded-xl border border-[#E3E8EF] p-4" key={`${h.property}-${h.label}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-bold text-[#1A1A2E]">{h.address}</div>
                  <div className="mt-0.5 text-[13px] text-[#526176]">
                    {[h.beds != null ? `${h.beds} bed` : null, h.baths != null ? `${h.baths} bath` : null, h.sq_ft ? `${h.sq_ft.toLocaleString()} sq ft` : null]
                      .filter(Boolean)
                      .join(" · ") || "Beds and baths not on file"}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[15px] font-extrabold text-[#1E3A8A]">{money(h.rent_amount)}</div>
                  {days != null && <div className="text-[12px] font-semibold text-[#B45309]">Vacant {days} days</div>}
                </div>
              </div>
              {!h.details_confirmed && (
                <span className="mt-2 inline-block rounded-full border border-[#F1C98A] bg-[#FFF6E5] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#7A4B00]">
                  Details not confirmed
                </span>
              )}
              <dl className="mt-2 grid gap-1 text-[13px]">
                {h.pets_policy && (
                  <div><dt className="inline font-semibold text-[#526176]">Pets: </dt><dd className="inline text-[#1A1A2E]">{h.pets_policy}</dd></div>
                )}
                <div>
                  <dt className="inline font-semibold text-[#526176]">Access: </dt>
                  <dd className="inline text-[#1A1A2E]">{h.access_note || "No access note yet - ask the office"}</dd>
                </div>
                {h.notes && <div className="text-[12.5px] leading-relaxed text-[#6B7A90]">{h.notes}</div>}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
