// src/pages/ElleryCockpit.tsx
// Documents & Dates. Being rebuilt to the walkthrough layout - one dated list,
// overdue first. The documents pipeline and deals feed were removed on
// 15 Sep 2026 to clear the way; both are still in
// src/features/documents and src/features/pipeline if they come back.

import { Link } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ElleryTabBar } from "../components/ElleryTabBar";
import { UserMenu } from "../components/UserMenu";

export function ElleryCockpit() {
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
            Documents &amp; Dates
          </h1>

          <p className="mt-2 max-w-md text-[16px] font-medium text-white/85">
            What is late, what is due, and what is coming.
          </p>
        </>
      }
    >
      <footer className="pt-10 text-center text-[16px] font-medium tracking-[0.12em] text-[#8291A5]">
        Able OS
      </footer>

      <ElleryTabBar />
    </MobileScreenShell>
  );
}