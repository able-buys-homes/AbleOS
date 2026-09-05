// src/pages/ZoJobs.tsx
// Placeholder. The real board sits on work_orders and lands last in the
// agreed build order. It exists now so the Jobs tab is a real destination
// rather than a dead button.

import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import { ZoTabBar } from "../components/ZoTabBar";

export function ZoJobs() {
  return (
    <MobileScreenShell
      headerContent={
        <>
          <div className="flex items-center justify-end">
            <UserMenu />
          </div>
          <h1 className="mt-3 text-[27px] font-bold tracking-[-0.015em]">
            Jobs
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
          Work orders still come to you the way they do today. Nothing has been
          moved here and nothing has been lost — this screen is empty because it
          has not been built, not because there is no work.
        </p>
      </div>

      <ZoTabBar />
    </MobileScreenShell>
  );
}
