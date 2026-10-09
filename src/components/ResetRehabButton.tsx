import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LoaderIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const PHRASE = "RESET";

export function ResetRehabButton() {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setTyped("");
      setError("");
      setResult("");
      setBusy(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(""), 6000);
    return () => clearTimeout(timer);
  }, [result]);

  async function handleReset() {
    if (typed !== PHRASE) return;

    setBusy(true);
    setError("");

    try {
      const res = await apiFetch("/api/reset-rehab", {
        method: "POST",
        body: JSON.stringify({ confirm: PHRASE }),
      });

      const raw = await res.text();
      if (!res.ok) {
        let msg = `Reset failed (${res.status})`;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error) msg = parsed.error;
        } catch {
          /* keep default */
        }
        throw new Error(msg);
      }

      const data = JSON.parse(raw);
      setResult(
        `Deleted ${data.filesDeleted} photos and cleared ${data.rowsReset} stages.`,
      );
      setOpen(false);
    } catch (err) {
      console.error("Reset failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-white px-4 py-3 text-[16px] font-semibold tracking-wide text-[#DC2626] transition-colors hover:bg-[#FEE2E2]"
        onClick={() => setOpen(true)}
        type="button"
      >
        <RotateCcwIcon aria-hidden="true" size={14} strokeWidth={2.5} />
        Reset rehab checklist
      </button>

      {result && (
        <p className="mt-2 text-[16px] font-medium text-[#16A34A]">{result}</p>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1A1A2E]/60 px-5"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={(event) => {
              if (event.target === event.currentTarget && !busy) setOpen(false);
            }}
          >
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-[0_20px_40px_rgba(26,26,46,0.28)]"
              exit={{ opacity: 0, scale: 0.97 }}
              initial={{ opacity: 0, scale: 0.97 }}
              onClick={(event) => event.stopPropagation()}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#FEE2E2] text-[#DC2626]">
                    <TriangleAlertIcon size={17} strokeWidth={2.5} />
                  </span>
                  <h3 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#DC2626]">
                    Reset everything?
                  </h3>
                </div>
                <button
                  aria-label="Close"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#93A3B8] transition-colors hover:bg-[#F1F5F9]"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <XIcon aria-hidden="true" size={16} />
                </button>
              </div>

              <ul className="mt-4 space-y-1.5">
                {[
                  "Every photo in all 40 Drive folders is permanently deleted",
                  "All Drive links are removed from the checklist",
                  "Jeremiah, Karen and Raj approvals are unchecked",
                  "Every stage goes back to Not Started",
                ].map((line) => (
                  <li
                    className="flex gap-2 text-[16px] font-medium leading-snug text-[#733614]"
                    key={line}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#DC2626]"
                    />
                    {line}
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-[16px] font-medium leading-relaxed text-[#6B7A90]">
                Colton and Zo will have to re-shoot everything. This can&apos;t
                be undone, and the crew gets notified that you did it.
              </p>

              <label className="mt-4 block">
                <span className="text-[16px] font-semibold tracking-[0.08em] text-[#5B6B82]">
                  Type {PHRASE} to confirm
                </span>
                <input
                  autoFocus
                  className="mt-1.5 w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-2.5 text-[18px] font-medium tracking-wide text-[#1A1A2E] outline-none transition-colors placeholder:font-medium placeholder:text-[#A3B0C0] focus:border-[#DC2626]"
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder={PHRASE}
                  type="text"
                  value={typed}
                />
              </label>

              {error && (
                <p className="mt-3 text-[16px] font-medium text-red-500">
                  {error}
                </p>
              )}

              <div className="mt-5 flex gap-2.5">
                <button
                  className="flex-1 rounded-xl border border-[#DCE4EE] px-3 py-2.5 text-[16px] font-semibold tracking-wide text-[#526176] transition-colors hover:bg-[#F1F5F9] disabled:opacity-60"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#DC2626] px-3 py-2.5 text-[16px] font-semibold tracking-wide text-white transition-colors hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:bg-[#CBD5E1] disabled:text-[#8A99AC]"
                  disabled={typed !== PHRASE || busy}
                  onClick={handleReset}
                  type="button"
                >
                  {busy && (
                    <LoaderIcon
                      className="animate-spin"
                      size={12}
                      strokeWidth={2.5}
                    />
                  )}
                  {busy ? "Resetting…" : "Reset"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
