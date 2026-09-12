import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOutIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthProvider";
import { PushToggle } from "./PushToggle";

const COCKPITS = [
  { key: "raj", name: "Raj", role: "CEO", path: "/raj", initial: "R" },
  {
    key: "dane",
    name: "Dane",
    role: "Integration lead",
    path: "/dane",
    initial: "D",
  },
  {
    key: "karen",
    name: "Karen",
    role: "Operations",
    path: "/karen",
    initial: "K",
  },
  {
    key: "jeremiah",
    name: "Jeremiah",
    role: "Field ops",
    path: "/jeremiah",
    initial: "J",
  },
  {
    key: "colton",
    name: "Colton",
    role: "Crew lead, Side A",
    path: "/colton",
    initial: "C",
  },
  { 
    key: "zo",
    name: "Zo",
    // Covers both sides since 3 Sep 2026, so no side is named here.
    role: "Site manager",
    // The Map, matching where he lands when he signs in himself - see
    // HOME_PATH in ProtectedRoute. Rehab is still one tap away on the tab bar.
    path: "/zo/map",
    initial: "Z",
  },
  {
    key: "rex",
    name: "Rex",
    role: "Field, West Texas",
    path: "/rex",
    initial: "R",
  },
  {
    key: "ellery",
    name: "Ellery",
    role: "Documents",
    path: "/ellery",
    initial: "E",
  },
  {
    key: "cornelius",
    name: "Cornelius",
    role: "Proof of funds",
    path: "/cornelius",
    initial: "C",
  },
];

export function UserMenu() {
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const currentCockpit = location.pathname.split("/")[1] || "";
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const initial = profile?.full_name?.trim().charAt(0).toUpperCase() ?? "?";

  // Only admins get the cockpit list. Everyone else just gets Sign out.
  // Hide whichever cockpit is currently open, so his own always reappears
  // once he's viewing someone else's.
  const others = profile?.is_admin
    ? COCKPITS.filter((c) => c.key !== currentCockpit)
    : [];

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="grid h-9 w-9 place-items-center rounded-full border-2 border-white/70 bg-[#1E3A8A] text-xs font-semibold transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#3B82C4]"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {initial}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_16px_32px_rgba(30,58,138,0.18)]"
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            role="menu"
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {/* Who you are */}
            <div className="border-b border-[#E6ECF2] px-4 py-3">
              <p className="text-[18px] font-semibold tracking-[-0.015em] text-[#1A1A2E]">
                {profile?.full_name ?? "Signed in"}
              </p>
              <p className="mt-0.5 truncate text-[16px] font-medium text-[#6B7A90]">
                {session?.user?.email}
              </p>
            </div>

            {/* Other cockpits */}
            {others.length > 0 && (
              <div className="max-h-[280px] overflow-y-auto">
                <p className="px-4 pb-1.5 pt-3 text-[16px] font-semibold tracking-[0.13em] text-[#5B6B82]">
                  Open a cockpit
                </p>

                {others.map((cockpit) => (
                  <button
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#F8FAFC]"
                    key={cockpit.key}
                    onClick={() => {
                      setOpen(false);
                      navigate(cockpit.path);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1E3A8A] text-[16px] font-semibold text-white">
                      {cockpit.initial}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[18px] font-semibold tracking-[-0.015em] text-[#1A1A2E]">
                        {cockpit.name}
                        {cockpit.key === profile?.cockpit && (
                          <span className="ml-1.5 text-[16px] font-medium tracking-wide text-[#418BFF]">
                            yours
                          </span>
                        )}
                      </span>
                      <span className="block text-[16px] font-medium text-[#6B7A90]">
                        {cockpit.role}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <PushToggle />

            {/* Sign out, always last */}
            <button
              className="flex w-full items-center gap-2.5 border-t border-[#E6ECF2] px-4 py-3 text-left transition-colors hover:bg-[#FEE2E2]"
              onClick={signOut}
              role="menuitem"
              type="button"
            >
              <LogOutIcon
                aria-hidden="true"
                className="text-[#DC2626]"
                size={15}
                strokeWidth={2.5}
              />
              <span className="text-[16px] font-semibold tracking-wide text-[#DC2626]">
                Sign out
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
