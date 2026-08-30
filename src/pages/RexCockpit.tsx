// src/pages/RexCockpit.tsx
// Rex works deals in the field. His screen answers one question: what am
// I sourcing, and where has it got to.
//
// Everything here is live. Walkthroughs, buy-box matching and field photo
// capture are deliberately absent rather than faked - they're the next
// build, and a placeholder that never updates is worse than a gap.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import { MyDealsCard } from "../features/pipeline/MyDealsCard";
import { DocumentsCard } from "../features/documents/DocumentsCard";
import { useDeals } from "../features/pipeline/useDeals";
import { useDocuments } from "../features/documents/useDocuments";

const OPEN_DOC_STAGES = [
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

export function RexCockpit() {
  const { deals, kpis, loading: dealsLoading } = useDeals();
  const { documents, loading: docsLoading } = useDocuments();

  const underwriting = useMemo(
    () => deals.filter((d) => d.stage === "underwriting").length,
    [deals],
  );

  const openDocs = useMemo(
    () => documents.filter((d) => OPEN_DOC_STAGES.includes(d.stage)).length,
    [documents],
  );

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
            ABLE OS · Field
          </p>

          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Rex's Cockpit
          </h1>

          <p className="mt-2 max-w-md text-[16px] font-medium text-white/85">
            What you are sourcing, and where it has got to.
          </p>
        </>
      }
    >
      <section
        aria-label="Deal metrics"
        className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4"
      >
        <Kpi
          label="My deals"
          value={dash(kpis.active, dealsLoading)}
          tone="primary"
        />
        <Kpi label="In underwriting" value={dash(underwriting, dealsLoading)} />
        <Kpi
          label="Stalled 4+ days"
          value={dash(kpis.stalled, dealsLoading)}
          tone={kpis.stalled > 0 ? "urgent" : "neutral"}
        />
        <Kpi label="Docs in progress" value={dash(openDocs, docsLoading)} />
      </section>

      <section aria-labelledby="deals-heading" className="pt-8">
        <h2 className="sr-only" id="deals-heading">
          My deals
        </h2>
        <MyDealsCard />
      </section>

      <section aria-labelledby="docs-heading" className="pt-3">
        <h2 className="sr-only" id="docs-heading">
          Documents
        </h2>
        {/* Rex can ask Ellery for a document; only she moves one along. */}
        <DocumentsCard canMove={false} />
      </section>

      <footer className="pt-10 text-center text-[16px] font-medium tracking-[0.12em] text-[#8291A5]">
        Able OS
      </footer>
    </MobileScreenShell>
  );
}
