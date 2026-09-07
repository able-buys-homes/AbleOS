// src/pages/ZoMap.tsx
// The community, drawn the way Zo walks it.
//
// Status is live now. It comes from lots.home_status - the same column the
// rent roll derives `occupied` from - so the two screens can no longer
// disagree about a home. The hardcoded snapshot that used to live in
// HtmLotMap.tsx was a guarantee that eventually they would.

import React from "react";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import { ZoTabBar } from "../components/ZoTabBar";
import {
  HtmLotMap,
  lotCounts,
  type Lot,
  type LotStatus,
} from "../features/map/HtmLotMap";
import { apiFetch } from "../lib/apiFetch";

type Row = {
  id: string;
  lot_number: string;
  tenant_name: string | null;
  home_status: LotStatus;
  repair_note: string | null;
  bed: string | number | null;
  bath: string | number | null;
  sq_ft: number | null;
  notes: string | null;
  status_set_by: string | null;
  status_set_at: string | null;
};

const num = (v: string | number | null) =>
  v === null || v === "" ? undefined : Number(v);

export function ZoMap() {
  const [lots, setLots] = React.useState<Lot[] | null>(null);
  const [problem, setProblem] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/lots");
      if (res.status === 401) return;

      // A dev server and a sign-in page both answer an unknown /api path with
      // the app's own HTML. Trusting a 200 without checking is how this screen
      // went blank once already.
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("application/json")) {
        throw new Error(
          "The site plan did not come back. Nothing has been changed. Reload to try again, or tell Dane if it keeps happening.",
        );
      }

      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load the lots");

      // Only a numbered lot has a place on the drawing. 106 Fox Run Rd is on
      // the rent roll but is not on this site plan, so it is left off rather
      // than drawn somewhere invented.
      const mapped: Lot[] = ((body?.lots ?? []) as Row[])
        .filter((r) => /^\d+$/.test(r.lot_number))
        .map((r) => ({
          id: Number(r.lot_number),
          lotId: r.id,
          status: r.home_status,
          tenant: r.tenant_name ?? undefined,
          note: r.notes ?? undefined,
          repairNote: r.repair_note ?? undefined,
          statusSetBy: r.status_set_by ?? undefined,
          statusSetAt: r.status_set_at ?? undefined,
          bed: num(r.bed),
          bath: num(r.bath),
          sqft: r.sq_ft ?? undefined,
        }));

      setLots(mapped);
    } catch (err) {
      setProblem(
        err instanceof Error ? err.message : "Could not load the lots",
      );
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const { counts, doors, occupancy } = lotCounts(lots ?? []);

  return (
    <MobileScreenShell
      headerContent={
        <>
          <div className="flex items-center justify-end">
            <UserMenu />
          </div>
          <h1 className="mt-3 text-[27px] font-bold tracking-[-0.015em]">
            Map
          </h1>
          <p className="mt-1.5 text-[13.5px] text-white/75">
            Hometown Meadows MHP &nbsp;•&nbsp; 121 Smith Lane, Nashville AR
          </p>
          {lots && (
            <p className="mt-3 text-[15px] font-semibold">
              {counts.occupied} of {doors} doors occupied &nbsp;•&nbsp;{" "}
              {occupancy}%
            </p>
          )}
        </>
      }
    >
      <div className="pt-4">
        {problem && (
          <div className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[16px] text-[#B91C1C]">
            {problem}
          </div>
        )}

        {!lots && !problem && (
          <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[15px] text-[#6C7484]">
            Loading the site…
          </div>
        )}

        {lots && (
          <>
            <HtmLotMap lots={lots} onChanged={load} />

            {counts.verify > 0 && (
              <div className="mt-4 rounded-2xl border-l-4 border-l-[#D97706] border-y border-r border-y-[#F0E2C4] border-r-[#F0E2C4] bg-[#FFFCF5] p-4">
                <div className="text-[15px] font-bold text-[#7A4E06]">
                  {counts.verify === 1
                    ? "One home needs checking"
                    : `${counts.verify} homes need checking`}
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#92600A]">
                  Two records disagree about who is there. Do not show those to
                  anyone until you have walked them yourself.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <ZoTabBar />
    </MobileScreenShell>
  );
}
