// src/features/applicants/ApplicantDetail.tsx
// One applicant, and the single thing Ellery can do next.
//
// The action area shows exactly one state at a time. A screen that offers
// "approve" while the report is still out invites a decision nobody can
// account for later - so the button that does not apply yet is not shown as
// disabled, it says what is being waited on instead.

import React from "react";
import {
  type Applicant,
  PortfolioTag,
  StageStrip,
  money,
  when,
} from "./parts";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#E3E5E9] py-2.5 last:border-b-0">
      <span className="shrink-0 text-[14px] text-[#6C7484]">{label}</span>
      <span className="min-w-0 text-right text-[14px] font-semibold text-[#0F1E33]">
        {children}
      </span>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled = false,
  variant = "plain",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "plain" | "primary" | "danger";
}) {
  const styles = {
    plain: "border-[#D5D8DE] bg-white text-[#1B2231]",
    primary: "border-[#1E3A8A] bg-[#1E3A8A] text-white",
    danger: "border-[#B4462B] bg-[#B4462B] text-white",
  }[variant];

  return (
    <button
      className={`min-h-[40px] flex-1 rounded-[9px] border px-3.5 py-2 text-[14px] font-semibold disabled:opacity-45 ${styles}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

const input =
  "mt-1.5 block w-full min-w-0 appearance-none rounded-[10px] border border-[#DCE4EE] bg-white px-3 py-2.5 text-[15px] text-[#1B2231]";

const label =
  "block text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]";

const waiting =
  "rounded-[9px] bg-[#F1F3F6] px-3.5 py-3 text-center text-[14px] font-semibold text-[#6C7484]";

export function ApplicantDetail({
  applicant,
  busy,
  problem,
  onSave,
}: {
  applicant: Applicant;
  busy: boolean;
  problem: string;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [fee, setFee] = React.useState("");
  const [feeOn, setFeeOn] = React.useState("");
  const [report, setReport] = React.useState("");
  const [note, setNote] = React.useState("");

  // Cleared when the card changes, so one applicant's half-typed report can
  // never be saved against the next one.
  React.useEffect(() => {
    setFee(applicant.fee_amount != null ? String(applicant.fee_amount) : "");
    setFeeOn("");
    setReport("");
    setNote("");
  }, [applicant.id, applicant.fee_amount]);

  const decided = Boolean(applicant.decision);
  const reportBack = Boolean(applicant.screening_result);

  return (
    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4 shadow-[0_1px_2px_rgba(30,58,138,0.04)] sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <PortfolioTag of={applicant.portfolio} />
        <h3 className="min-w-0 text-[18px] font-bold tracking-[-0.02em] text-[#0F1E33]">
          {applicant.name}
        </h3>
      </div>

      {applicant.property_label && (
        <p className="mt-0.5 text-[14px] text-[#6C7484]">
          {applicant.property_label}
        </p>
      )}

      <div className="mt-3.5">
        <StageStrip stage={applicant.stage} />
      </div>

      <div className="mt-3.5">
        <Row label="Came in by">{applicant.came_in_by || "Not recorded"}</Row>
        <Row label="Application fee">
          {applicant.fee_paid_on
            ? `Paid ${when(applicant.fee_paid_on)}${
                applicant.fee_amount != null
                  ? ` · ${money(applicant.fee_amount)}`
                  : ""
              }`
            : "Not yet"}
        </Row>
        <Row label="Who else knows">
          {applicant.who_else_knows || "Nobody copied"}
        </Row>
        <Row label="Attached">
          {applicant.application_id ? (
            <a
              className="font-semibold text-[#418BFF] hover:underline"
              href={`/api/applications?pdf=${applicant.application_id}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              Application.pdf
            </a>
          ) : (
            "Nothing attached yet"
          )}
        </Row>
      </div>

      {applicant.screening_result && (
        <div className="mt-3.5 rounded-[9px] border-l-4 border-l-[#1E3A8A] bg-[#F8FAFC] px-3.5 py-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]">
            Screening report
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-[#1B2231]">
            {applicant.screening_result}
          </p>
        </div>
      )}

      {problem && (
        <p className="mt-3 text-[14px] font-medium text-[#B91C1C]">{problem}</p>
      )}

      {/* ---- the one thing to do next ---- */}
      <div className="mt-4">
        {/* Waiting on the fee. */}
        {applicant.stage === "received" && (
          <>
            <label className={label}>Record the fee</label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <input
                className={input}
                inputMode="decimal"
                onChange={(e) => setFee(e.target.value)}
                placeholder="25"
                step="0.01"
                type="number"
                value={fee}
              />
              <input
                className={input}
                onChange={(e) => setFeeOn(e.target.value)}
                type="date"
                value={feeOn}
              />
            </div>
            <div className="mt-2.5 flex gap-2.5">
              <Btn
                disabled={busy || !feeOn}
                onClick={() =>
                  onSave({
                    fee_paid_on: feeOn,
                    fee_amount: fee === "" ? null : Number(fee),
                  })
                }
                variant="primary"
              >
                {busy ? "Saving…" : "Fee received"}
              </Btn>
            </div>
          </>
        )}

        {/* Fee in, screening not ordered. */}
        {applicant.stage === "fee_paid" && (
          <div className="flex gap-2.5">
            <Btn
              disabled={busy}
              onClick={() => onSave({ order_screening: true })}
              variant="primary"
            >
              {busy ? "Saving…" : "Order screening"}
            </Btn>
          </div>
        )}

        {/* Ordered, nothing back. */}
        {applicant.stage === "screening" && !reportBack && (
          <>
            <div className={waiting}>
              Waiting on the report · ordered{" "}
              {when(applicant.screening_ordered_on)}
            </div>

            <label className={`${label} mt-3.5`}>The report is back</label>
            <textarea
              className={input}
              onChange={(e) => setReport(e.target.value)}
              placeholder="What the report says"
              rows={3}
              value={report}
            />
            <div className="mt-2.5 flex gap-2.5">
              <Btn
                disabled={busy || report.trim().length < 3}
                onClick={() => onSave({ screening_result: report.trim() })}
                variant="primary"
              >
                {busy ? "Saving…" : "Save the report"}
              </Btn>
            </div>
          </>
        )}

        {/* Report in, no decision. */}
        {reportBack && !decided && (
          <>
            <label className={label}>Anything to note (optional)</label>
            <input
              className={input}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Conditions, or why"
              type="text"
              value={note}
            />
            <div className="mt-2.5 flex flex-wrap gap-2.5">
              <Btn
                disabled={busy}
                onClick={() =>
                  onSave({ decision: "approved", decision_note: note })
                }
                variant="primary"
              >
                Approve
              </Btn>
              <Btn
                disabled={busy}
                onClick={() =>
                  onSave({ decision: "conditions", decision_note: note })
                }
              >
                With conditions
              </Btn>
              <Btn
                disabled={busy}
                onClick={() =>
                  onSave({ decision: "denied", decision_note: note })
                }
                variant="danger"
              >
                Deny
              </Btn>
            </div>
          </>
        )}

        {/* Decided, not yet told. */}
        {decided && !applicant.notified_on && (
          <div className="flex gap-2.5">
            <Btn
              disabled={busy}
              onClick={() => onSave({ notified: true })}
              variant="primary"
            >
              {busy ? "Saving…" : "They have been told"}
            </Btn>
          </div>
        )}

        {/* Finished. */}
        {applicant.notified_on && (
          <div className="rounded-[9px] bg-[#EAF6EE] px-3.5 py-3 text-[14px] font-medium text-[#166534]">
            Decided {when(applicant.decision_on)} · told{" "}
            {when(applicant.notified_on)}
            {applicant.decision_note ? ` · ${applicant.decision_note}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}