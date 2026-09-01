import React from "react";
import { motion } from "framer-motion";
import { EyeIcon, EyeOffIcon, LoaderIcon } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthProvider";

export function Login() {
  const { signIn, session, profile, loading } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const canSubmit = email.trim() !== "" && password !== "" && !submitting;

  // Already signed in (or just signed in) - go to their cockpit.
  if (!loading && session && profile) {
    return <Navigate replace to={`/${profile.cockpit}`} />;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");

    try {
      await signIn(email, password);
      // Routing is handled by App once the session lands.
    } catch (err) {
      console.error("Sign in failed:", err);
      const message =
        err instanceof Error ? err.message : "Could not sign you in";
      // Supabase returns this verbatim; soften it for the crew.
      setError(
        message.toLowerCase().includes("invalid login")
          ? "Wrong email or password. Check both and try again."
          : message,
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-[#5EC5E8] to-[#3B82C4] px-5 py-10">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 14 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="flex flex-col items-center text-center">
          <img
            alt="Able Buys Homes"
            className="h-16 w-16 rounded-2xl bg-[#191919] p-1 object-contain shadow-[0_8px_20px_rgba(26,26,46,0.22)]"
            src="/able-logo.png"
          />
          <p className="mt-4 text-[16px] font-medium tracking-[0.14em] text-white/85">
            Executive workspace
          </p>
          <h1 className="mt-1 text-[30px] font-semibold leading-tight tracking-[-0.04em] text-white">
            Sign in
          </h1>
        </div>

        <form
          className="mt-6 rounded-2xl border border-white/40 bg-white p-6 shadow-[0_18px_38px_rgba(30,58,138,0.22)]"
          onSubmit={handleSubmit}
        >
          <label className="block">
            <span className="text-[16px] font-semibold tracking-[0.08em] text-[#5B6B82]">
              Email
            </span>
            <input
              autoCapitalize="none"
              autoComplete="email"
              className="mt-1.5 w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-2.5 text-[18px] font-medium text-[#1A1A2E] outline-none transition-colors placeholder:text-[#A3B0C0] focus:border-[#418BFF]"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@ablebuyshomes.com"
              type="email"
              value={email}
            />
          </label>

          <label className="mt-4 block">
            <span className="text-[16px] font-semibold tracking-[0.08em] text-[#5B6B82]">
              Password
            </span>
            <div className="relative mt-1.5">
              <input
                autoComplete="current-password"
                className="w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-2.5 pr-11 text-[18px] font-medium text-[#1A1A2E] outline-none transition-colors placeholder:text-[#A3B0C0] focus:border-[#418BFF]"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#93A3B8] transition-colors hover:bg-[#F1F5F9]"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? (
                  <EyeOffIcon size={16} strokeWidth={2.25} />
                ) : (
                  <EyeIcon size={16} strokeWidth={2.25} />
                )}
              </button>
            </div>
          </label>

          {error && (
            <p className="mt-4 rounded-xl bg-[#FFF1E9] px-3 py-2.5 text-[16px] font-medium leading-snug text-[#D95717]">
              {error}
            </p>
          )}

          <button
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#418BFF] px-4 py-3 text-[16px] font-semibold tracking-wide text-white transition-colors hover:bg-[#2F6FD8] disabled:cursor-not-allowed disabled:bg-[#CBD5E1] disabled:text-[#8A99AC]"
            disabled={!canSubmit}
            type="submit"
          >
            {submitting ? (
              <>
                <LoaderIcon
                  className="animate-spin"
                  size={14}
                  strokeWidth={2.5}
                />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <p className="mt-4 text-center text-[16px] font-medium leading-snug text-[#8A99AC]">
            Trouble signing in? Ask Dane to reset your password.
          </p>
        </form>

        <p className="mt-6 text-center text-[16px] font-medium tracking-[0.12em] text-white/70">
          Able OS, LLC
        </p>
      </motion.div>
    </div>
  );
}
