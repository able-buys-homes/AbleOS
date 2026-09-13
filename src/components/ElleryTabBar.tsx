// src/components/ElleryTabBar.tsx
// The places Ellery goes, fixed to the bottom of every /ellery screen.
//
// Same shape as Zo's bar on purpose - one row, thumb-sized targets, active by
// colour alone. Two cockpits that navigate differently are two cockpits to
// learn.

import { NavLink } from "react-router-dom";
import { Building2Icon, FolderIcon, UsersIcon } from "lucide-react";

const TABS = [
  { to: "/ellery/applicants", label: "Applicants", Icon: UsersIcon },
  { to: "/ellery/properties", label: "Properties", Icon: Building2Icon },
  { to: "/ellery", label: "Documents", Icon: FolderIcon },
] as const;

export function ElleryTabBar() {
  return (
    <>
      {/* Holds the last card clear of the bar instead of under it. */}
      <div
        aria-hidden="true"
        className="h-[calc(68px+env(safe-area-inset-bottom))]"
      />

      <nav
        aria-label="Ellery sections"
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
              // Documents is at "/ellery" itself, so without `end` it would
              // light up on every child route.
              end={to === "/ellery"}
              key={to}
              to={to}
            >
              <>
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
