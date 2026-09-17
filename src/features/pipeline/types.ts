/**
 * Workflow stages. These keys must stay identical to the check constraint
 * on public.deal_stages in Supabase and the STAGES array in api/deals.js.
 */
export const DEAL_STAGES = [
  "docs_submitted",
  "underwriting",
  "final_review",
  "proof_of_funds",
  "submit_to_broker",
  "awaiting_signatures",
  "under_contract",
  "funded_emd",
  "due_diligence",
  "coe",
  "dead",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const STAGE_LABELS: Record<DealStage, string> = {
  docs_submitted: "Docs Submitted",
  underwriting: "Underwriting",
  final_review: "Final Review",
  proof_of_funds: "Proof of Funds",
  submit_to_broker: "Submit to Broker/Seller",
  awaiting_signatures: "Awaiting Signatures",
  under_contract: "Under Contract",
  funded_emd: "Funded EMD",
  due_diligence: "Due Diligence",
  coe: "COE",
  dead: "Dead Deal",
};

/**
 * Stages where a deal has left the active pipeline. Wholesale deals stay on
 * the board through Due Diligence, so Find a buyer is no longer terminal -
 * it's a decision made inside Under Contract.
 */
export const TERMINAL_STAGES: DealStage[] = ["coe", "dead"];

/**
 * The only stages a deal may be created at. Underwriting and Final Review are
 * the two gates that check the buy box - starting a deal past them means
 * nothing ever checked it. Later stages are still reachable by moving a deal,
 * just not by creating one there.
 */
export const INTAKE_STAGES: DealStage[] = ["docs_submitted", "underwriting"];

/**
 * Who sourced the deal. Comes from the Notion "Deal Source" select, so it is
 * a plain string rather than a fixed union. Adding a source in Notion should
 * not require a code change.
 */
export type BirdDog = string;

export type Deal = {
  id: string;
  name: string;
  address: string;
  source: BirdDog;
  category: string;
  notes: string;
  stage: DealStage;
  stageChangedAt: string | null;
  movedBy: string | null;
  daysInStage: number | null;

  /**
   * Only on deals created inside Able OS. Notion imports carry no
   * numbers, so these stay undefined there.
   */
  birdDog?: string | null;
  purchasePrice?: string | number | null;
  monthlyCashFlow?: string | number | null;
  dscr?: string | number | null;
};
