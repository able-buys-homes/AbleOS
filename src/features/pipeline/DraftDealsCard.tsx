// src/features/pipeline/DraftDealsCard.tsx
// The inbox queue. Each email is a draft until someone reads it, fills in
// what the email didn't say, and confirms it onto the board.

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/apiFetch";
import { AnimatePresence, motion } from "framer-motion";
import { InboxIcon, PaperclipIcon, XIcon } from "lucide-react";
import { NavCard } from "../../components/NavCard";
import { BuyBoxBadge } from "./BuyBoxBadge";
import { DEAL_STAGES, STAGE_LABELS, type DealStage } from "./types";
import { useDraftDeals, type DraftDeal } from "./useDraftDeals";

type DealFile = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  url: string | null;
};

/** Signed links expire, so they are fetched fresh each time a draft opens. */
function useDealFiles(dealId: string | null) {
  const [files, setFiles] = useState<DealFile[]>([]);
  useEffect(() => {
    if (!dealId) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/deal-files?deal_id=${encodeURIComponent(dealId)}`)
      .then((res) => (res.ok ? res.json() : { files: [] }))
      .then((body) => {
        if (!cancelled) setFiles(body?.files ?? []);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [dealId]);
  return files;
}

function prettySize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

type Form = {
  name: string;
  address: string;
  birdDog: string;
  source: string;
  purchasePrice: string;
  monthlyCashFlow: string;
  dscr: string;
  notes: string;
  stage: DealStage;
};

function formFor(draft: DraftDeal): Form {
  const str = (v: string | number | null) => (v === null ? "" : String(v));

  return {
    name: draft.name ?? "",
    address: draft.address ?? "",
    birdDog: draft.bird_dog ?? "",
    source: draft.source ?? "",
    purchasePrice: str(draft.purchase_price),
    monthlyCashFlow: str(draft.monthly_cash_flow),
    dscr: str(draft.dscr),
    notes: draft.notes ?? "",
    stage: draft.stage ?? "docs_submitted",
  };
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-2.5 text-[18px] text-[#0F1E33] focus:border-[#418BFF] focus:outline-none"
      />
    </label>
  );
}

export function DraftDealsCard({
  divider = false,
  onConfirmed,
}: {
  divider?: boolean;
  /** Refresh the board once a draft joins it. */
  onConfirmed?: () => void;
}) {
  const { drafts, loading, error, confirm, dismiss } = useDraftDeals();

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<DraftDeal | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const dealFiles = useDealFiles(active?.id ?? null);

  function openDraft(draft: DraftDeal) {
    setActive(draft);
    setForm(formFor(draft));
    setProblem(null);
  }

  async function handleConfirm() {
    if (!active || !form) return;

    if (!form.name.trim()) {
      setProblem("A deal name is required");
      return;
    }

    setBusy("confirm");
    setProblem(null);

    try {
      await confirm(active.id, form);
      setActive(null);
      onConfirmed?.();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not confirm");
    } finally {
      setBusy(null);
    }
  }

  async function handleDismiss() {
    if (!active) return;

    setBusy("dismiss");
    setProblem(null);

    try {
      await dismiss(active.id);
      setActive(null);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not dismiss");
    } finally {
      setBusy(null);
    }
  }

  const set = (key: keyof Form) => (v: string) =>
    setForm((f) => (f ? { ...f, [key]: v } : f));

  return (
    <>
      <NavCard
        icon={<InboxIcon aria-hidden="true" size={17} strokeWidth={2.5} />}
        title="From the inbox"
        subtitle="Emails waiting to become deals"
        count={loading ? null : drafts.length}
        tone="orange"
        variant="row"
        divider={divider}
        onClick={() => setOpen(true)}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-[#1A1A2E]/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:px-4 sm:py-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setOpen(false);
              setActive(null);
            }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[#EEF2F6] shadow-[0_20px_40px_rgba(30,58,138,0.18)]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#DCE4EE] bg-white px-5 pb-4 pt-5">
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold tracking-[0.13em] text-[#5B6B82]">
                    Underwriting inbox
                  </p>
                  <h2 className="mt-1 text-[20px] font-bold text-[#0F1E33]">
                    {active
                      ? "Review this email"
                      : `${drafts.length} waiting for you`}
                  </h2>
                </div>

                <button
                  aria-label="Close"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#93A3B8] transition-colors hover:bg-[#F1F5F9]"
                  onClick={() => {
                    if (active) setActive(null);
                    else setOpen(false);
                  }}
                  type="button"
                >
                  <XIcon aria-hidden="true" size={16} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {/* ---- LIST ---- */}
                {!active && (
                  <>
                    {loading && (
                      <div className="space-y-3">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="h-[84px] animate-pulse rounded-2xl bg-white"
                          />
                        ))}
                      </div>
                    )}

                    {!loading && error && (
                      <div className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[16px] text-[#B91C1C]">
                        {error}
                      </div>
                    )}

                    {!loading && !error && drafts.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-5 py-10 text-center">
                        <p className="text-[18px] font-semibold text-[#526176]">
                          Inbox clear
                        </p>
                        <p className="mt-1 text-[16px] text-[#8291A5]">
                          New emails to underwriting@ show up here.
                        </p>
                      </div>
                    )}

                    {!loading && !error && drafts.length > 0 && (
                      <div className="space-y-3">
                        {drafts.map((draft) => (
                          <button
                            key={draft.id}
                            type="button"
                            onClick={() => openDraft(draft)}
                            className="w-full rounded-2xl border border-[#DCE4EE] bg-white px-4 py-3.5 text-left transition hover:border-[#B9C7DB]"
                          >
                            <span className="block truncate text-[18px] font-semibold text-[#0F1E33]">
                              {draft.email_subject || draft.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[16px] text-[#5A6B85]">
                              {draft.origin === "website"
                                ? `${draft.contact_name ?? "Someone"} · from the website`
                                : draft.email_from || "Added by hand"}
                            </span>
                            <span className="mt-1.5 flex items-center justify-between gap-3 text-[14px] text-[#7A8AA3]">
                              <span className="truncate">
                                {new Date(
                                  draft.email_received_at || draft.created_at,
                                ).toLocaleString()}
                              </span>

                              {/* Only when there is something to open, so the
                                  badge means "documents here" at a glance. */}
                              {draft.file_count > 0 && (
                                <span
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EEF5FF] px-2 py-0.5 font-semibold text-[#2465B5]"
                                  title={`${draft.file_count} document${
                                    draft.file_count === 1 ? "" : "s"
                                  }`}
                                >
                                  <PaperclipIcon
                                    aria-hidden="true"
                                    size={11}
                                    strokeWidth={2.5}
                                  />
                                  {draft.file_count}
                                </span>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* ---- REVIEW ---- */}
                {active && form && (
                  <div className="space-y-3">
                    {/* Reads off the form, not the stored row, so it
                        re-checks live as Raj corrects the numbers. */}
                    <BuyBoxBadge
                      showReasons
                      deal={{
                        address: form.address,
                        dscr: form.dscr,
                        monthly_cash_flow: form.monthlyCashFlow,
                      }}
                    />

                    {(active.contact_name ||
                      active.contact_email ||
                      active.contact_phone) && (
                      <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
                        <div className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                          Who sent it
                        </div>

                        <dl className="mt-2 space-y-2 text-[16px]">
                          {active.contact_name && (
                            <div className="flex justify-between gap-4">
                              <dt className="text-[#7A8AA3]">Name</dt>
                              <dd className="text-right font-medium text-[#0F1E33]">
                                {active.contact_name}
                              </dd>
                            </div>
                          )}

                          {active.contact_phone && (
                            <div className="flex justify-between gap-4">
                              <dt className="text-[#7A8AA3]">Phone</dt>
                              <dd className="text-right">
                                <a
                                  className="font-medium text-[#418BFF] underline"
                                  href={`tel:${active.contact_phone}`}
                                >
                                  {active.contact_phone}
                                </a>
                              </dd>
                            </div>
                          )}

                          {active.contact_email && (
                            <div className="flex justify-between gap-4">
                              <dt className="text-[#7A8AA3]">Email</dt>
                              <dd className="min-w-0 text-right">
                                <a
                                  className="break-words font-medium text-[#418BFF] underline"
                                  href={`mailto:${active.contact_email}`}
                                >
                                  {active.contact_email}
                                </a>
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}

                    {active.extracted?.reasoning && (
                      <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                            What Claude read
                          </span>
                          {typeof active.extracted.confidence === "number" && (
                            <span className="shrink-0 rounded-full bg-[#EEF5FF] px-2.5 py-1 text-[14px] font-semibold text-[#2465B5]">
                              {Math.round(active.extracted.confidence * 100)}% sure
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-[16px] leading-relaxed text-[#3A4A62]">
                          {active.extracted.reasoning}
                        </p>
                      </div>
                    )}

                    {active.email_excerpt && (
                      <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
                        <div className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                          The email
                        </div>
                        <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line text-[16px] leading-relaxed text-[#3A4A62]">
                          {active.email_excerpt}
                        </p>
                      </div>
                    )}

                    {dealFiles.length > 0 && (
                      <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
                        <div className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                          Attachments
                        </div>
                        <ul className="mt-2 space-y-2">
                          {dealFiles.map((file) => (
                            <li
                              key={file.id}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="min-w-0 flex-1 truncate text-[16px] text-[#0F1E33]">
                                {file.url ? (
                                  <a
                                    className="font-medium text-[#418BFF] underline"
                                    href={file.url}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {file.file_name}
                                  </a>
                                ) : (
                                  file.file_name
                                )}
                              </span>
                              {/* Email attachments often arrive without a size.
                                  Better blank than a wrong number. */}
                              {file.size_bytes > 0 && (
                                <span className="shrink-0 text-[14px] text-[#7A8AA3]">
                                  {prettySize(file.size_bytes)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="space-y-3 rounded-2xl border border-[#DCE4EE] bg-white p-4">
                      <Field
                        label="Deal name"
                        value={form.name}
                        onChange={set("name")}
                      />
                      <Field
                        label="Address"
                        value={form.address}
                        onChange={set("address")}
                      />
                      <label className="block">
                        <span className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                          Bird dog
                        </span>
                        <select
                          value={form.birdDog}
                          onChange={(e) =>
                            setForm((f) =>
                              f ? { ...f, birdDog: e.target.value } : f,
                            )
                          }
                          className="mt-1 w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-2.5 text-[18px] text-[#0F1E33] focus:border-[#418BFF] focus:outline-none"
                        >
                          <option value="">Not set</option>
                          <option value="rex">Rex</option>
                          <option value="chirag">Chirag</option>
                          <option value="direct">Direct / inbound</option>
                          <option value="direct_message">Direct Message</option>
                          <option value="website">From the Website</option>
                          <option value="other">Other</option>
                        </select>
                      </label>

                      <Field
                        label="Source, as the email had it"
                        value={form.source}
                        onChange={set("source")}
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <Field
                          label="Purchase price"
                          value={form.purchasePrice}
                          onChange={set("purchasePrice")}
                        />
                        <Field
                          label="Monthly cash flow"
                          value={form.monthlyCashFlow}
                          onChange={set("monthlyCashFlow")}
                        />
                      </div>

                      <Field
                        label="DSCR"
                        value={form.dscr}
                        onChange={set("dscr")}
                      />

                      <label className="block">
                        <span className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                          Starting stage
                        </span>
                        <select
                          value={form.stage}
                          onChange={(e) =>
                            setForm((f) =>
                              f
                                ? { ...f, stage: e.target.value as DealStage }
                                : f,
                            )
                          }
                          className="mt-1 w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-2.5 text-[18px] text-[#0F1E33] focus:border-[#418BFF] focus:outline-none"
                        >
                          {DEAL_STAGES.map((stage) => (
                            <option key={stage} value={stage}>
                              {STAGE_LABELS[stage]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
                          Notes
                        </span>
                        <textarea
                          rows={3}
                          value={form.notes}
                          onChange={(e) => set("notes")(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-2.5 text-[18px] text-[#0F1E33] focus:border-[#418BFF] focus:outline-none"
                        />
                      </label>
                    </div>

                    {problem && (
                      <div className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[16px] text-[#B91C1C]">
                        {problem}
                      </div>
                    )}

                    <div className="flex gap-3 pb-2">
                      <button
                        type="button"
                        onClick={handleDismiss}
                        disabled={busy !== null}
                        className="flex-1 rounded-xl border border-[#DCE4EE] bg-white px-4 py-3 text-[18px] font-semibold text-[#5A6B85] hover:border-[#B9C7DB] disabled:opacity-60"
                      >
                        {busy === "dismiss" ? "Dismissing…" : "Not a deal"}
                      </button>

                      <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={busy !== null}
                        className="flex-1 rounded-xl bg-[#16A34A] px-4 py-3 text-[18px] font-semibold text-white hover:bg-[#15803D] disabled:opacity-60"
                      >
                        {busy === "confirm" ? "Adding…" : "Add to pipeline"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
