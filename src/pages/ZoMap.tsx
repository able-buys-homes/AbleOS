// src/pages/ZoMap.tsx
// Placeholder. The real site plan is traced from the Hometown Meadows
// drawing - 34 doors plus Lot 24, six statuses, tap a lot for detail.
// Geometry is fixed; status will read live from the rent data, so the map
// is never a second source of truth.

import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import { ZoTabBar } from "../components/ZoTabBar";

export function ZoMap() {
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
        </>
      }
    >
      <div className="mt-5 rounded-2xl border border-[#DCE4EE] bg-white p-5">
        <div className="text-[17px] font-bold tracking-[-0.01em]">
          Not built yet
        </div>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[#6C7484]">
          The community map goes here — every lot, who is in it, and what is
          open on it. Use Rent for now; it holds the same information as a list.
        </p>
      </div>

      <ZoTabBar />
    </MobileScreenShell>
  );
}
