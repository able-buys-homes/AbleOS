// src/pages/CorneliusCockpit.tsx
// Cornelius is outside the company. One panel, one job: the deals waiting
// on a proof of funds letter. No pipeline, no drafts, no financials.
import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import { PofCard } from "../features/pof/PofCard";

export function CorneliusCockpit() {
  return (
    <MobileScreenShell
      headerContent={
        <>
          <div className="flex items-center justify-between">
            <img
              alt="Able Buys Homes"
              className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain shadow-sm"
              src="/able-logo.png"
            />

            <UserMenu />
          </div>

          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
            ABLE OS · Proof of funds
          </p>

          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            POF Desk
          </h1>

          <p className="mt-2 max-w-md text-[16px] font-medium text-white/85">
            Deals waiting on a letter, with what each one needs.
          </p>
        </>
      }
    >
      <section aria-labelledby="pof-heading" className="pt-6">
        <h2 className="sr-only" id="pof-heading">
          Proof of funds
        </h2>
        <PofCard />
      </section>

      <footer className="pt-10 text-center text-[16px] font-medium tracking-[0.12em] text-[#8291A5]">
        Able OS
      </footer>
    </MobileScreenShell>
  );
}
