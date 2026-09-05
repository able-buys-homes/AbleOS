// src/components/ZoTabBar.tsx
// The four places Zo goes, fixed to the bottom of every /zo screen.
// One row, four targets, sized to be hit with a thumb in work gloves.
//
// Labels are the words Zo says out loud - "Rent", not "Collections". The
// route keeps its existing path so nothing already deployed has to move.

import { NavLink } from "react-router-dom";
import {
  BanknoteIcon,
  ClipboardCheckIcon,
  HardHatIcon,
  MapIcon,
  WrenchIcon,
} from "lucide-react";

// Hard hat for Rehab and wrench for Jobs, not two spanners. One is a build
// that runs for months, the other is a leak Zo fixes this afternoon.
const TABS = [
  { to: "/zo", label: "Rehab", Icon: HardHatIcon },
  { to: "/zo/collections", label: "Rent", Icon: BanknoteIcon },
  { to: "/zo/jobs", label: "Jobs", Icon: WrenchIcon },
  { to: "/zo/map", label: "Map", Icon: MapIcon },
  { to: "/zo/inspect", label: "Inspect", Icon: ClipboardCheckIcon },
] as const;

export function ZoTabBar() {
  return (
    <>
      {/* Holds the last card clear of the bar instead of under it. */}
      <div
        aria-hidden="true"
        className="h-[calc(68px+env(safe-area-inset-bottom))]"
      />

      <nav
        aria-label="Zo sections"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E3E5E9] bg-white"
      >
        <div className="mx-auto flex max-w-[428px] items-stretch pb-[env(safe-area-inset-bottom)] sm:max-w-2xl">
          {TABS.map(({ to, label, Icon }) => (
            <NavLink
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 px-0.5 pb-2 pt-2.5 ${
                  isActive ? "text-[#1E3A8A]" : "text-[#6C7484]"
                }`
              }
              // Rehab is at "/zo" itself, so without `end` it would light up
              // on every child route.
              end={to === "/zo"}
              key={to}
              to={to}
            >
              <>
                {/* Identical size and weight on all five. The active tab
                    differs by colour and nothing else - a heavier stroke on
                    the active icon read as a larger label. */}
                <Icon aria-hidden="true" size={22} strokeWidth={2} />
                <span className="text-[11px] font-semibold leading-none">
                  {label}
                </span>
              </>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
