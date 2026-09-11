import React from "react";
import { Link, Navigate } from "react-router-dom";
import { LoaderIcon } from "lucide-react";
import { useAuth, type CockpitKey } from "../lib/AuthProvider";
import { setActingAs } from "../lib/apiFetch";

const COCKPIT_LABELS: Record<string, string> = {
  raj: "Raj",
  dane: "Dane",
  karen: "Karen",
  jeremiah: "Jeremiah",
  colton: "Colton",
  zo: "Zo",
};

/**
 * Where each cockpit starts. Zo opens on the Map because that is the screen he
 * works from on his feet. /zo is still Rehab, and rehab notifications deep-link
 * there, so the route is left alone and only the landing moves.
 */
const HOME_PATH: Record<string, string> = {
  zo: "/zo/map",
};

export function homePath(cockpit: string) {
  return HOME_PATH[cockpit] ?? `/${cockpit}`;
}

/** Shown while the stored session is being restored. */
function AuthLoading() {
  return (
    <div className="grid min-h-screen w-full place-items-center bg-[#EEF2F6]">
      <div className="flex items-center gap-3">
        <LoaderIcon
          className="animate-spin text-[#418BFF]"
          size={18}
          strokeWidth={2.5}
        />
        <span className="text-[12px] font-bold text-[#5B6B82]">
          Loading Able OS…
        </span>
      </div>
    </div>
  );
}

/** Signed in, but no row in profiles — account exists without a cockpit. */
function NoProfile() {
  const { signOut } = useAuth();

  return (
    <div className="grid min-h-screen w-full place-items-center bg-[#EEF2F6] px-5">
      <div className="w-full max-w-sm rounded-2xl border border-[#DCE4EE] bg-white p-6 text-center shadow-[0_8px_20px_rgba(30,58,138,0.08)]">
        <h1 className="text-[16px] font-extrabold tracking-[-0.025em] text-[#1A1A2E]">
          No cockpit assigned
        </h1>
        <p className="mt-2 text-[12px] font-medium leading-relaxed text-[#6B7A90]">
          Your account exists but isn&apos;t linked to a dashboard yet. Ask Dane
          to add you to the profiles table.
        </p>
        <button
          className="mt-5 w-full rounded-xl border border-[#DCE4EE] px-4 py-2.5 text-[12px] font-extrabold uppercase tracking-wide text-[#526176] transition-colors hover:bg-[#F1F5F9]"
          onClick={signOut}
          type="button"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Makes it obvious whose dashboard this is, so nothing gets done by accident. */
function VisitingBanner({
  cockpit,
  homeCockpit,
}: {
  cockpit: CockpitKey;
  homeCockpit: CockpitKey;
}) {
  return (
    <div className="sticky top-0 z-[70] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#1A1A2E] px-4 py-2 text-center">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#FF7832]">
        Viewing as {COCKPIT_LABELS[cockpit] ?? cockpit}
      </span>
      <span className="text-[10px] font-medium text-white/70">
        anything you do is recorded under your name
      </span>
      <Link
        className="text-[10px] font-extrabold uppercase tracking-wide text-white underline decoration-white/40 hover:decoration-white"
        to={homePath(homeCockpit)}
      >
        Back to yours
      </Link>
    </div>
  );
}

type ProtectedRouteProps = {
  cockpit: CockpitKey;
  children: React.ReactNode;
};

export function ProtectedRoute({ cockpit, children }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth();

  const isVisiting = Boolean(
    profile && profile.is_admin && profile.cockpit !== cockpit,
  );

  // Tell apiFetch which cockpit we're operating inside, so the server treats
  // this admin as that person for the duration.
  React.useEffect(() => {
    setActingAs(isVisiting ? cockpit : null);
    return () => setActingAs(null);
  }, [cockpit, isVisiting]);

  if (loading) return <AuthLoading />;
  if (!session) return <Navigate replace to="/login" />;
  if (!profile) return <NoProfile />;

  // Not yours, and you're not an admin — go home.
  if (profile.cockpit !== cockpit && !profile.is_admin) {
    return <Navigate replace to={homePath(profile.cockpit)} />;
  }

  return (
    <>
      {isVisiting && (
        <VisitingBanner cockpit={cockpit} homeCockpit={profile.cockpit} />
      )}
      {children}
    </>
  );
}

/** Sends "/" to whichever cockpit the signed-in user owns. */
export function HomeRedirect() {
  const { session, profile, loading } = useAuth();

  if (loading) return <AuthLoading />;
  if (!session) return <Navigate replace to="/login" />;
  if (!profile) return <NoProfile />;

  return <Navigate replace to={homePath(profile.cockpit)} />;
}
