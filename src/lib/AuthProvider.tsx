// src/lib/AuthProvider.tsx
// Holds the signed-in session and the user's profile (which cockpit they own).

import React from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type CockpitKey =
  | "raj"
  | "dane"
  | "karen"
  | "jeremiah"
  | "colton"
  | "zo"
  | "rex"
  | "ellery"
  | "cornelius"
  | "manita";

export type Profile = {
  id: string;
  full_name: string;
  cockpit: CockpitKey;
  is_admin: boolean;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadProfile = React.useCallback(async (userId: string) => {
    function fetchOnce() {
      return supabase
        .from("profiles")
        .select("id, full_name, cockpit, is_admin")
        .eq("id", userId)
        .single();
    }

    let { data, error } = await fetchOnce();

    // A stale access token surfaces here as a JWT decode error, which is not
    // the same thing as "this account has no cockpit". Refresh and retry once
    // before showing the user a dead end.
    const tokenProblem =
      error?.code === "PGRST301" || /jwt/i.test(error?.message ?? "");

    if (tokenProblem) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) ({ data, error } = await fetchOnce());
    }

    if (error) {
      console.error("Failed to load profile:", error);
      setProfile(null);
      return;
    }

    setProfile(data as Profile);
  }, []);

  React.useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);

        if (newSession?.user) {
          // Deferred on purpose: calling other Supabase methods directly
          // inside this callback can deadlock the auth client.
          setTimeout(() => {
            loadProfile(newSession.user.id).finally(() => setLoading(false));
          }, 0);
        } else {
          setProfile(null);
          setLoading(false);
        }
      },
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = React.useMemo(
    () => ({ session, profile, loading, signIn, signOut }),
    [session, profile, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
