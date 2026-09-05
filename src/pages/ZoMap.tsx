// src/pages/ZoMap.tsx
// The community, drawn the way Zo walks it.
//
// Status is the 1 September 2026 snapshot from the site drawing. It is not
// live yet - htm_lots and the wiring back to rent activity come next. The
// screen says so out loud rather than letting Zo assume a stale colour is
// today's truth.

import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import { ZoTabBar } from "../components/ZoTabBar";
import { DEFAULT_LOTS, HtmLotMap, lotCounts } from "../features/map/HtmLotMap";

export function ZoMap() {
  const { counts, doors, occupancy } = lotCounts(DEFAULT_LOTS);

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
          <p className="mt-3 text-[15px] font-semibold">
            {counts.occupied} of {doors} doors occupied &nbsp;•&nbsp;{" "}
            {occupancy}%
          </p>
        </>
      }
    >
      <div className="pt-4">
        <HtmLotMap />

        <div className="mt-4 rounded-2xl border-l-4 border-l-[#D97706] border-y border-r border-y-[#F0E2C4] border-r-[#F0E2C4] bg-[#FFFCF5] p-4">
          <div className="text-[15px] font-bold text-[#7A4E06]">
            Colours are from 1 September, not from today
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#92600A]">
            This is the snapshot from the site walk. It does not yet change when
            you take a payment or record a move-in. Until it does, treat Rent as
            the answer on who owes what — not this screen.
          </p>
          {counts.verify > 0 && (
            <p className="mt-2.5 text-[13.5px] font-semibold leading-relaxed text-[#7A4E06]">
              {counts.verify === 1
                ? "One home is"
                : `${counts.verify} homes are`}{" "}
              marked <b>Needs checking</b> — two records disagree about who is
              there. Do not show those to anyone until you have walked them
              yourself.
            </p>
          )}
        </div>
      </div>

      <ZoTabBar />
    </MobileScreenShell>
  );
}
