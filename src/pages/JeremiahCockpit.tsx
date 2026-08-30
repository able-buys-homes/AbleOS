import React from "react";
import { motion } from "framer-motion";
import { ExternalLinkIcon } from "lucide-react";
import { UserMenu } from "../components/UserMenu";
import { NotificationBell } from "../components/NotificationBell";
import { ApprovalQueue, type Stage } from "../features/approvals/ApprovalQueue";
import { ApprovedGatesModal } from "../features/approvals/ApprovedGatesModal";

type CrewStatus = {
  name: string;
  url: string;
};

const crewStatuses: CrewStatus[] = [
  {
    name: "Colton — Side A",
    url: "https://drive.google.com/drive/folders/1GCgpD8uJ1K-84NBkzZNs-ATp1clCUevB",
  },
  {
    name: "Zo — Side B",
    url: "https://drive.google.com/drive/folders/1FRPLHONtP_SobaVVIPqY9BmeaEgCzuBM",
  },
];

const reveal = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export function JeremiahCockpit() {
  const [pendingCount, setPendingCount] = React.useState<number | null>(null);
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [stagesLoaded, setStagesLoaded] = React.useState(false);
  const [approvedOpen, setApprovedOpen] = React.useState(false);

  const handleStagesLoaded = React.useCallback((loaded: Stage[]) => {
    setStages(loaded);
    setStagesLoaded(true);
  }, []);

  const approvedCount = stagesLoaded
    ? stages.filter((stage) => stage.jeremiahApproved).length
    : null;

  return (
    <div className="min-h-screen w-full bg-[#EEF2F6] text-[#1A1A2E]">
      <header className="bg-gradient-to-r from-[#5EC5E8] to-[#3B82C4] text-white shadow-sm">
        <div className="mx-auto max-w-[428px] px-5 pb-8 pt-5 sm:max-w-2xl sm:px-8 sm:pb-10 sm:pt-6 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
          <div className="flex items-center justify-between">
            <img
              alt="Able Buys Homes"
              className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain shadow-sm"
              src="/able-logo.png"
            />
            <div className="flex items-center gap-3">
              <NotificationBell />
              <UserMenu />
            </div>
          </div>

          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
            ABLE OS · Executive workspace
          </p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Jeremiah&apos;s Cockpit
          </h1>
          <p className="mt-2 max-w-md text-[18px] font-medium text-white/85">
            Rehab crew status and approvals awaiting you.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[428px] px-5 pb-10 sm:max-w-2xl sm:px-8 sm:pb-14 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
        <motion.section
          animate="visible"
          aria-labelledby="profile-heading"
          className="relative -mt-4 overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_8px_20px_rgba(30,58,138,0.08)]"
          initial="hidden"
          transition={{ duration: 0.35, ease: "easeOut" }}
          variants={reveal}
        >
          <div className="absolute inset-y-0 left-0 w-1.5 bg-[#1E3A8A]" />
          <div className="flex items-center justify-between gap-4 px-5 py-4 pl-6 sm:px-7 sm:py-5 sm:pl-8">
            <div>
              <p className="text-[16px] font-semibold tracking-[0.13em] text-[#5B6B82]">
                Personal dashboard
              </p>
              <h2
                className="mt-1 text-[16px] font-semibold tracking-[-0.025em]"
                id="profile-heading"
              >
                Jeremiah · Field Ops
              </h2>
              <p className="mt-1 text-[16px] font-medium leading-relaxed text-[#64748B]">
                VP Able Builds
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section
          animate="visible"
          aria-labelledby="queue-heading"
          className="pt-8"
          initial="hidden"
          transition={{ delay: 0.08, duration: 0.35, ease: "easeOut" }}
          variants={reveal}
        >
          <div className="mt-1 grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4 lg:gap-5">
            <InsightCard
              label="Photo approvals"
              tone={pendingCount ? "critical" : "success"}
              value={pendingCount !== null ? String(pendingCount) : "..."}
            />
            <InsightCard label="SOP total length" value="8wk" tone="queued" />
            <InsightCard label="Safety escalations" value="0" tone="success" />
            <InsightCard
              label="Gates approved"
              onClick={() => setApprovedOpen(true)}
              tone="success"
              value={approvedCount !== null ? String(approvedCount) : "..."}
            />
          </div>
        </motion.section>

        <motion.div
          animate="visible"
          initial="hidden"
          transition={{ delay: 0.16, duration: 0.38, ease: "easeOut" }}
          variants={reveal}
        >
          <div className="lg:grid lg:grid-cols-2 lg:gap-x-10 xl:gap-x-14">
            <section aria-labelledby="crew-heading" className="pt-9">
              <SectionHeading id="crew-heading">
                Crew phase status
              </SectionHeading>
              <div className="mt-4 space-y-3">
                {crewStatuses.map((crew) => (
                  <a
                    className="flex items-center gap-3 rounded-2xl border border-[#DCE4EE] bg-white px-4 py-4 shadow-[0_5px_14px_rgba(30,58,138,0.055)] transition-shadow hover:shadow-[0_8px_18px_rgba(30,58,138,0.1)] sm:px-5"
                    href={crew.url}
                    key={crew.name}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <div className="h-9 w-1 shrink-0 rounded-full bg-[#1E3A8A]" />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[18px] font-semibold leading-snug tracking-[-0.015em] text-[#1A1A2E]">
                        {crew.name}
                      </h3>
                    </div>
                    <ExternalLinkIcon
                      aria-hidden="true"
                      className="shrink-0 text-[#93A3B8]"
                      size={15}
                      strokeWidth={2.5}
                    />
                  </a>
                ))}
              </div>
            </section>

            <section aria-labelledby="approval-queue-heading" className="pt-9">
              <SectionHeading id="approval-queue-heading">
                Waiting on you
              </SectionHeading>
              <ApprovalQueue
                onCountChange={setPendingCount}
                onStagesLoaded={handleStagesLoaded}
                role="jeremiah"
              />
            </section>
          </div>
        </motion.div>

        <footer className="pt-10 text-center text-[16px] font-medium tracking-[0.12em] text-[#8291A5]">
          Able OS
        </footer>
      </main>

      <ApprovedGatesModal
        loading={!stagesLoaded}
        onClose={() => setApprovedOpen(false)}
        open={approvedOpen}
        role="jeremiah"
        stages={stages}
      />
    </div>
  );
}

/* ── Subcomponents ──────────────────────────────────────── */

type InsightCardProps = {
  label: string;
  value: string;
  tone: "critical" | "queued" | "success";
  onClick?: () => void;
};

function InsightCard({ label, value, tone, onClick }: InsightCardProps) {
  const tones = {
    critical: "text-[#FF7832] bg-[#FFF1E9]",
    queued: "text-[#418BFF] bg-[#EEF5FF]",
    success: "text-[#16A34A] bg-[#EAF8EF]",
  };

  const base =
    "min-w-0 rounded-2xl border border-[#DCE4EE] bg-white px-3.5 py-4 text-center shadow-[0_4px_12px_rgba(30,58,138,0.045)] sm:px-4 sm:py-5";

  const content = (
    <>
      <p
        className={`inline-flex items-center justify-center rounded-lg px-2 py-1 text-[24px] font-semibold leading-none tracking-[-0.06em] sm:text-[27px] ${tones[tone]}`}
      >
        {value}
      </p>
      <p className="mt-3 text-[14px] font-semibold leading-tight tracking-[0.06em] text-[#718096]">
        {label}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        className={`${base} w-full cursor-pointer transition-shadow hover:shadow-[0_6px_16px_rgba(30,58,138,0.09)]`}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return <article className={base}>{content}</article>;
}

type SectionHeadingProps = {
  id: string;
  children: React.ReactNode;
};

function SectionHeading({ id, children }: SectionHeadingProps) {
  return (
    <h2
      className="text-[19px] font-semibold leading-none tracking-[-0.035em] text-[#1A1A2E] sm:text-[21px]"
      id={id}
    >
      {children}
    </h2>
  );
}
