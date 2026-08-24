import React from "react";
import { AnimatePresence } from "framer-motion";
import { LayersIcon, RefreshCwIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import { NavCard } from "../components/NavCard";
import { FilterMenu } from "../components/FilterMenu";
// Leads are hidden for now — uncomment this and the card below to restore.
// import { LeadsCard } from "../features/leads/LeadsCard";
import { DraftDealsCard } from "../features/pipeline/DraftDealsCard";
import { DocumentsCard } from "../features/documents/DocumentsCard";
import { PofCard } from "../features/pof/PofCard";
import { AskAble } from "../features/assistant/AskAble";
import { NotificationBell } from "../components/NotificationBell";
import { DealDetail } from "../features/pipeline/DealDetail";
import { IntakeStatus } from "../features/pipeline/IntakeStatus";
import { KpiTile } from "../features/pipeline/KpiTile";
import { StageBrowserModal } from "../features/pipeline/StageBrowserModal";
import { stages } from "../features/pipeline/data";
import { useDeals } from "../features/pipeline/useDeals";
import {
  STAGE_LABELS,
  TERMINAL_STAGES,
  type Deal,
  type DealStage,
} from "../features/pipeline/types";

export function PipelineBoard() {
  const { deals, error, loading, moveDeal, movingId, refresh } = useDeals();

  const [selectedBirdDog, setSelectedBirdDog] = React.useState("All");
  const [selectedStage, setSelectedStage] =
    React.useState<DealStage>("docs_submitted");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = React.useState(false);
  const [pofOpen, setPofOpen] = React.useState(false);
  const [docsOpen, setDocsOpen] = React.useState(false);

  // The cards below own the data, so they hand their counts up for the tiles.
  const [pofWaiting, setPofWaiting] = React.useState<number | null>(null);
  const [docCount, setDocCount] = React.useState<number | null>(null);

  // A fixed list, not one derived from the deals. Claude's extracted
  // "source" is whatever the email happened to say - a sender name, a
  // company - which is how "jaysonmiguel" ended up in a filter.
  const birdDogOptions = React.useMemo(
    () => [
      { value: "All", label: "All bird dogs" },
      { value: "rex", label: "Rex" },
      { value: "chirag", label: "Chirag" },
      { value: "direct", label: "Direct / inbound" },
      { value: "direct_message", label: "Direct Message" },
      { value: "website", label: "From the Website" },
      { value: "underwriting", label: "From Underwriting Email" },
      { value: "other", label: "Other" },
      { value: "none", label: "Not set" },
    ],
    [],
  );

  const scopedDeals = React.useMemo(
    () =>
      deals.filter((deal) => {
        if (selectedBirdDog === "All") return true;
        // Worth having: deals nobody has attributed yet are easy to lose.
        if (selectedBirdDog === "none") return !deal.birdDog;
        return deal.birdDog === selectedBirdDog;
      }),
    [deals, selectedBirdDog],
  );

  const displayedDeals = React.useMemo(
    () => scopedDeals.filter((deal) => deal.stage === selectedStage),
    [scopedDeals, selectedStage],
  );

  const stageCounts = React.useMemo(
    () =>
      Object.fromEntries(
        stages.map((stage) => [
          stage.key,
          scopedDeals.filter((deal) => deal.stage === stage.key).length,
        ]),
      ),
    [scopedDeals],
  );

  /* KPIs follow the bird dog filter, so the numbers match what is on screen. */
  const metrics = React.useMemo(() => {
    const active = scopedDeals.filter(
      (deal) => !TERMINAL_STAGES.includes(deal.stage),
    );
    const timed = active.filter((deal) => typeof deal.daysInStage === "number");

    return {
      active: active.length,
      inReview: scopedDeals.filter((deal) => deal.stage === "final_review")
        .length,
      avgDays: timed.length
        ? (
            timed.reduce((sum, deal) => sum + (deal.daysInStage as number), 0) /
            timed.length
          ).toFixed(1)
        : "--",
      stalled: timed.filter((deal) => (deal.daysInStage as number) >= 4).length,
    };
  }, [scopedDeals]);

  // Read the open deal out of the live list so it updates after a move.
  const selectedDeal: Deal | null =
    deals.find((deal) => deal.id === selectedId) ?? null;

  const activeBirdDogLabel =
    birdDogOptions.find((option) => option.value === selectedBirdDog)?.label ??
    "All bird dogs";

  React.useEffect(() => {
    if (!selectedId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

  async function handleMove(id: string, stage: DealStage) {
    const ok = await moveDeal(id, stage);
    if (ok) {
      setSelectedId(null);
      setSelectedStage(stage);
    }
  }

  return (
    <MobileScreenShell
      headerContent={
        <>
          <div className="flex items-center justify-between">
            <Link aria-label="Return to Raj's Cockpit" to="/raj">
              <img
                alt="Able Buys Homes"
                className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain shadow-sm"
                src="/able-logo.png"
              />
            </Link>
            <div className="flex items-center gap-3">
              <nav
                aria-label="Workspace pages"
                className="flex items-center gap-1 rounded-full bg-white/15 p-1"
              >
                <Link
                  className="rounded-full px-3 py-2 text-[16px] font-medium text-white/80 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
                  to="/raj"
                >
                  Cockpit
                </Link>
                <span
                  aria-current="page"
                  className="rounded-full bg-white px-3 py-2 text-[16px] font-medium text-[#1E3A8A]"
                >
                  Pipeline
                </span>
              </nav>
              <NotificationBell />
              <UserMenu />
            </div>
          </div>

          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
            ABLE OS · Deal flow
          </p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Pipeline
          </h1>
          <p className="mt-2 max-w-md text-[18px] font-medium text-white/85">
            Reliable sourcing, visible at every stage.
          </p>
        </>
      }
    >
      <section
        aria-label="Pipeline metrics"
        className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3"
      >
        <KpiTile
          label="Deals in pipe"
          onClick={() => setBrowserOpen(true)}
          tone="primary"
          value={loading ? "..." : String(metrics.active)}
        />
        <KpiTile
          label="Proof of funds"
          onClick={() => setPofOpen(true)}
          tone={pofWaiting && pofWaiting > 0 ? "urgent" : "neutral"}
          value={pofWaiting === null ? "..." : String(pofWaiting)}
        />
        <KpiTile
          label="Documents"
          onClick={() => setDocsOpen(true)}
          tone="neutral"
          value={docCount === null ? "..." : String(docCount)}
        />
      </section>

      <IntakeStatus />

      {error ? (
        <p className="pt-3 text-[16px] font-medium text-[#DC2626]">{error}</p>
      ) : null}
      <section aria-label="Pipeline lists" className="pt-8">
        <div className="flex items-center gap-2">
          <FilterMenu
            value={selectedBirdDog}
            options={birdDogOptions.map((option) => ({
              key: option.value,
              label: option.label,
            }))}
            onChange={setSelectedBirdDog}
          />

          <button
            aria-label="Refresh deals"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#93A3B8] transition-colors hover:bg-[#E3EDF8] hover:text-[#526176]"
            onClick={refresh}
            type="button"
          >
            <RefreshCwIcon
              aria-hidden="true"
              className={loading ? "animate-spin" : ""}
              size={16}
              strokeWidth={2.5}
            />
          </button>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_5px_14px_rgba(30,58,138,0.055)]">
          <DraftDealsCard onConfirmed={refresh} />

          {/* Hidden for now — kept here so it's one line to bring back. */}
          {/* <LeadsCard divider /> */}

          <PofCard
            canSetDetails
            onCountChange={setPofWaiting}
            onOpenChange={setPofOpen}
            open={pofOpen}
            row
          />

          <DocumentsCard
            canMove={false}
            initialFilter="all"
            onCountChange={setDocCount}
            onOpenChange={setDocsOpen}
            open={docsOpen}
            row
          />

          <NavCard
            icon={<LayersIcon aria-hidden="true" size={17} strokeWidth={2.5} />}
            title="Deals by stage"
            subtitle={`${STAGE_LABELS[selectedStage]} · ${activeBirdDogLabel}`}
            count={loading ? null : displayedDeals.length}
            tone="green"
            variant="row"
            divider
            onClick={() => setBrowserOpen(true)}
          />
        </div>
      </section>

      <footer className="pt-10 text-center text-[16px] font-medium tracking-[0.12em] text-[#8291A5]">
        Able OS · V1 Build
      </footer>

      <AskAble
        context={{
          dealsInPipe: loading ? null : metrics.active,
          stalledDeals: loading ? null : metrics.stalled,
        }}
      />

      <StageBrowserModal
        birdDogLabel={activeBirdDogLabel}
        counts={stageCounts}
        deals={displayedDeals}
        loading={loading}
        onClose={() => setBrowserOpen(false)}
        onSelectDeal={(deal) => setSelectedId(deal.id)}
        onSelectStage={setSelectedStage}
        open={browserOpen}
        selectedStage={selectedStage}
      />

      <AnimatePresence>
        {selectedDeal ? (
          <DealDetail
            deal={selectedDeal}
            moving={movingId === selectedDeal.id}
            onClose={() => setSelectedId(null)}
            onMove={handleMove}
          />
        ) : null}
      </AnimatePresence>
    </MobileScreenShell>
  );
}
