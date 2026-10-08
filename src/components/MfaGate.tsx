// src/components/MfaGate.tsx
// The second sign-in step (MFA). Raj, v1: required for Manita before her page
// shows anything. Other cockpits pass straight through until we choose to
// require it for them too.
//
// Written for someone who is not technical: one thing per screen, big type,
// plain words, and a way out (Sign out) on every screen.

import React from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthProvider";

/** Cockpits that must pass the second step. */
const MFA_REQUIRED = new Set(["manita"]);

type Stage = "checking" | "ok" | "enroll" | "verify" | "error";

export function MfaGate({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const required = profile ? MFA_REQUIRED.has(profile.cockpit) : false;
  const [stage, setStage] = React.useState<Stage>("checking");
  const [factorId, setFactorId] = React.useState("");
  const [qr, setQr] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [code, setCode] = React.useState("");
  const [problem, setProblem] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const check = React.useCallback(async () => {
    if (!required) return setStage("ok");
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") return setStage("ok");

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const ready = (factors?.totp ?? []).find((f) => f.status === "verified");
      if (ready) {
        setFactorId(ready.id);
        return setStage("verify");
      }

      // A half-finished setup from before would block a new one.
      for (const f of (factors?.all ?? []).filter((f) => f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: en, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Able OS phone" });
      if (error || !en) throw error ?? new Error("Could not start the setup");
      setFactorId(en.id);
      setQr(en.totp.qr_code);
      setSecret(en.totp.secret);
      setStage("enroll");
    } catch (e: any) {
      setProblem(e?.message || "Something went wrong. Please sign out and try again.");
      setStage("error");
    }
  }, [required]);

  React.useEffect(() => {
    check();
  }, [check]);

  const verify = async () => {
    setBusy(true);
    setProblem("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\D/g, "") });
    setBusy(false);
    if (error) {
      setProblem("That code did not work. Look at the app again and type the newest 6 numbers.");
      setCode("");
      return;
    }
    setStage("ok");
  };

  if (stage === "ok") return <>{children}</>;

  return (
    <div className="min-h-screen w-full bg-[#F4F6F9] text-[#14213D]">
      <header className="bg-[#1E3A8A] text-white">
        <div className="mx-auto max-w-2xl px-6 pb-8 pt-8">
          <h1 className="text-[32px] font-extrabold leading-tight">One more step to keep your account safe</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 pb-16">
        {stage === "checking" && <p className="mt-8 text-[22px]">One moment…</p>}

        {stage === "enroll" && (
          <div className="mt-6 rounded-2xl border-2 border-[#D5DCE6] bg-white p-6">
            <p className="text-[20px] leading-relaxed">You only do this once.</p>
            <ol className="mt-4 space-y-4 text-[20px] leading-relaxed">
              <li><b>1.</b> On your phone, open the <b>Google Authenticator</b> app (or Microsoft Authenticator).</li>
              <li><b>2.</b> Tap the <b>+</b> button, then <b>Scan a QR code</b>, and point your phone at this square:</li>
            </ol>
            {qr && <img alt="QR code to scan with your phone" className="mx-auto my-5 h-56 w-56" src={qr} />}
            <details className="text-[16px] text-[#4A5568]">
              <summary className="cursor-pointer">Can&apos;t scan it?</summary>
              <p className="mt-2">Choose <b>Enter a setup key</b> in the app and type this key:</p>
              <p className="mt-1 break-all font-mono text-[18px] text-[#14213D]">{secret}</p>
            </details>
            <p className="mt-5 text-[20px] leading-relaxed"><b>3.</b> Type the 6 numbers the app shows:</p>
          </div>
        )}

        {stage === "verify" && (
          <div className="mt-6 rounded-2xl border-2 border-[#D5DCE6] bg-white p-6">
            <p className="text-[20px] leading-relaxed">
              Open the <b>Authenticator</b> app on your phone and type the 6 numbers it shows for <b>Able OS</b>.
            </p>
          </div>
        )}

        {(stage === "enroll" || stage === "verify") && (
          <div className="mt-4">
            <input
              aria-label="6-digit code"
              autoComplete="one-time-code"
              className="w-full rounded-2xl border-2 border-[#1E3A8A] bg-white px-5 py-5 text-center text-[34px] font-bold tracking-[0.4em]"
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
              placeholder="– – – – – –"
              value={code}
            />
            <button
              className="mt-4 w-full rounded-2xl bg-[#1E3A8A] px-6 py-5 text-[22px] font-bold text-white disabled:opacity-50"
              disabled={busy || code.length !== 6}
              onClick={verify}
              type="button"
            >
              {busy ? "Checking…" : "Continue"}
            </button>
          </div>
        )}

        {problem && (
          <div className="mt-4 rounded-2xl border-2 border-[#F0A8A0] bg-[#FDECEC] p-5 text-[20px] font-semibold text-[#8A1C1C]">
            {problem}
          </div>
        )}

        <button
          className="mt-6 w-full rounded-2xl border-2 border-[#1E3A8A] bg-white px-6 py-4 text-[20px] font-bold text-[#1E3A8A]"
          onClick={signOut}
          type="button"
        >
          Sign out
        </button>
        <p className="mt-4 text-center text-[17px] text-[#4A5568]">Stuck? Call Dane and he will help you.</p>
      </main>
    </div>
  );
}
