// src/pages/DaneNotices.tsx
// Dane's door onto the same announcements board Zo uses.
//
// Wears his cockpit's own chrome rather than a bare page - a screen that
// looks like it belongs to a different product reads as unfinished, however
// well it works.

import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "lucide-react";
import AnnouncementsBoard from "../features/announcements/AnnouncementsBoard";
import { NotificationBell } from "../components/NotificationBell";
import { UserMenu } from "../components/UserMenu";

export function DaneNotices() {
  return (
    <div className="min-h-screen w-full bg-[#EEF2F6] text-[#1A1A2E]">
      <header className="bg-gradient-to-r from-[#5EC5E8] to-[#3B82C4] text-white shadow-sm">
        <div className="mx-auto max-w-[428px] px-5 pb-8 pt-5 sm:max-w-2xl sm:px-8 sm:pb-10 sm:pt-6 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
          <div className="flex items-center justify-between">
            <Link
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-white/25"
              to="/dane"
            >
              <ArrowLeftIcon aria-hidden="true" size={16} strokeWidth={2.5} />
              Cockpit
            </Link>

            <div className="flex items-center gap-3">
              <NotificationBell />
              <UserMenu />
            </div>
          </div>

          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
            Hometown Meadows MHP
          </p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Announcements
          </h1>
          <p className="mt-2 max-w-md text-[18px] font-medium text-white/85">
            What the park sees in the resident portal. Zo writes here too.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[428px] px-5 pb-14 pt-6 sm:max-w-2xl sm:px-8 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
        <AnnouncementsBoard />
      </main>
    </div>
  );
}
