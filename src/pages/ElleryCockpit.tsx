// src/pages/ElleryCockpit.tsx
// Ellery coordinates every document. Her screen answers one question:
// what is due, stuck, or out for signature.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import { DocumentsCard } from "../features/documents/DocumentsCard";
import { MyDealsCard } from "../features/pipeline/MyDealsCard";
import { CriticalDatesCard } from "../features/documents/CriticalDatesCard";
import {
  useDocuments,
  useCriticalDates,
  daysUntil,
} from "../features/documents/useDocuments";

const OPEN_STAGES = [
  "requested",
  "draft",
  "internal_review",
  "out_for_signature",
];

function Kpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "urgent";
}) {
  const colour =
    tone === "urgent"
      ? "text-[#DC2626]"
      : tone === "primary"
        ? "text-[#418BFF]"
        : "text-[#0F1E33]";

  return (
    <div className="rounded-2xl border border-[#DCE4EE] bg-white px-4 py-3.5">
      <p className="text-[16px] font-medium text-[#5A6B85]">{label}</p>
      <p className={`mt-1 text-[28px] font-bold leading-none ${colour}`}>
        {value}
      </p>
    </div>
  );
}

export function ElleryCockpit() {
  const { documents, loading: docsLoading } = useDocuments();
  const { dates, loading: datesLoading } = useCriticalDates();

  const metrics = useMemo(() => {
    const open = documents.filter((d) => OPEN_STAGES.includes(d.stage));

    const outForSignature = documents.filter(
      (d) => d.stage === "out_for_signature",
    ).length;

    const stuck = open.filter(
      (d) =>
        Math.floor(
          (Date.now() - new Date(d.stage_changed_at).getTime()) / 86400000,
        ) >= 5,
    ).length;

    const thisWeek = dates.filter((d) => daysUntil(d.due_on) <= 7).length;

    return { open: open.length, outForSignature, stuck, thisWeek };
  }, [documents, dates]);

  const dash = (value: number, loading: boolean) =>
    loading ? "..." : String(value);

  return (
    <MobileScreenShell
      headerContent={
        <>
          <div className="flex items-center justify-between">
            <Link aria-label="Return to your cockpit" to="/">
              <img
                alt="Able Buys Homes"
                className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain shadow-sm"
                src="/able-logo.png"
              />
            </Link>

            <UserMenu />
          </div>

          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
            ABLE OS · Transaction coordination
          </p>

          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Ellery's Cockpit
          </h1>

          <p className="mt-2 max-w-md text-[16px] font-medium text-white/85">
            What is due, stuck, or out for signature.
          </p>
        </>
      }
    >
      <section
        aria-label="Document metrics"
        className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4"
      >
        <Kpi
          label="In progress"
          value={dash(metrics.open, docsLoading)}
          tone="primary"
        />
        <Kpi
          label="Out for signature"
          value={dash(metrics.outForSignature, docsLoading)}
        />
        <Kpi
          label="Stuck 5+ days"
          value={dash(metrics.stuck, docsLoading)}
          tone={metrics.stuck > 0 ? "urgent" : "neutral"}
        />
        <Kpi
          label="Dates this week"
          value={dash(metrics.thisWeek, datesLoading)}
          tone={metrics.thisWeek > 0 ? "primary" : "neutral"}
        />
      </section>

      <section aria-labelledby="documents-heading" className="pt-8">
        <h2 className="sr-only" id="documents-heading">
          Documents
        </h2>
        <DocumentsCard />
      </section>

      <section aria-labelledby="feed-heading" className="pt-3">
        <h2 className="sr-only" id="feed-heading">
          Deals
        </h2>
        {/* Read-only. She coordinates documents on these, she doesn't
            move deals between stages. */}
        <MyDealsCard title="Deals" subtitle="What Rex is sourcing" />
      </section>

      <section aria-labelledby="dates-heading" className="pt-3">
        <h2 className="sr-only" id="dates-heading">
          Critical dates
        </h2>
        <CriticalDatesCard />
      </section>

      <div className="mt-8 rounded-2xl bg-[#0F1E33] px-5 py-4">
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#F5C86B]">
          Signatures
        </p>
        <p className="mt-1.5 text-[16px] leading-relaxed text-white/85">
          Brokerage-side documents: Ellery signs as TC per TREC under Keller
          Williams. Able-entity-side signatures are Mooni Sanwal only — no other
          Able-side name appears on any template.
        </p>
      </div>

      <footer className="pt-10 text-center text-[16px] font-medium tracking-[0.12em] text-[#8291A5]">
        Able OS
      </footer>
    </MobileScreenShell>
  );
}
