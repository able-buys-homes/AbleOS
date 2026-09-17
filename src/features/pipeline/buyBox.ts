// src/features/pipeline/buyBox.ts
// Raj's buy box, as numbers. One module so the rule lives in exactly one
// place - the moment this logic is copied into a component it starts
// drifting from whatever Raj actually decided.
//
// Deliberately not included: hard disqualifiers like flood zone, property
// age or a deferred-maintenance ceiling. Those have never been ruled on,
// and inventing them here would mean the system quietly rejecting deals
// on criteria nobody agreed to.

export const BUY_BOX = {
  /** Rent divided by PITIA. Lender requirement, not preference. */
  minDscr: 1.25,

  /** Net monthly cash flow for the deal as a whole. */
  minMonthlyCashFlow: 2500,

  /**
   * The company box is Florida, Arkansas and Texas. State is the rule; the
   * city list below is a fallback for addresses that arrive without a state
   * on them, which is common from bird dogs.
   */
  states: ["fl", "florida", "ar", "arkansas", "tx", "texas"],

  /** Rex's own lane, roughly 300 miles around Lubbock. */
  markets: [
    "lubbock",
    "plainview",
    "amarillo",
    "midland",
    "odessa",
    "big spring",
    "san angelo",
    "abilene",
    "slaton",
    "idalou",
    "justiceburg",
    "brownfield",
    "levelland",
    "snyder",
    "post",
    "littlefield",
  ],
} as const;

export type BuyBoxVerdict = "in" | "out" | "unknown";

export type BuyBoxResult = {
  verdict: BuyBoxVerdict;
  /** Plain sentences, safe to show on screen. */
  reasons: string[];
};

type DealLike = {
  address?: string | null;
  dscr?: string | number | null;
  monthly_cash_flow?: string | number | null;
};

/** Postgres sends numerics as strings, so coerce before comparing. */
function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * In the box if the address names Florida, Arkansas or Texas, or one of the
 * cities Rex works. States are matched as whole words - the "ar" inside
 * "Arlington" is not Arkansas.
 */
function inMarket(address: string | null | undefined) {
  if (!address) return null;

  const haystack = address.toLowerCase();

  const stateHit = BUY_BOX.states.some((state) =>
    new RegExp(`\\b${state}\\b`).test(haystack),
  );

  if (stateHit) return true;

  return BUY_BOX.markets.some((city) => haystack.includes(city));
}

/**
 * Three outcomes, not two. "Unknown" matters: a deal with no DSCR hasn't
 * failed the box, it just hasn't been measured yet, and treating those as
 * failures would bin good deals for want of a number.
 */
export function evaluateBuyBox(deal: DealLike): BuyBoxResult {
  const dscr = toNumber(deal.dscr);
  const cashFlow = toNumber(deal.monthly_cash_flow);
  const market = inMarket(deal.address);

  const fails: string[] = [];
  const missing: string[] = [];
  const passes: string[] = [];

  if (dscr === null) {
    missing.push("No DSCR yet");
  } else if (dscr < BUY_BOX.minDscr) {
    fails.push(`DSCR ${dscr.toFixed(2)} is under ${BUY_BOX.minDscr}`);
  } else {
    passes.push(`DSCR ${dscr.toFixed(2)}`);
  }

  if (cashFlow === null) {
    missing.push("No cash flow figure yet");
  } else if (cashFlow < BUY_BOX.minMonthlyCashFlow) {
    fails.push(
      `Cash flow $${Math.round(cashFlow).toLocaleString()} is under $${BUY_BOX.minMonthlyCashFlow.toLocaleString()}`,
    );
  } else {
    passes.push(`$${Math.round(cashFlow).toLocaleString()} a month`);
  }

  if (market === null) {
    missing.push("No address yet");
  } else if (!market) {
    fails.push("Outside Florida, Arkansas and Texas");
  } else {
    passes.push("In market");
  }

  // A clear fail is a fail even if something else is missing - no point
  // chasing a rent roll for a deal that's already out of the box.
  if (fails.length > 0) return { verdict: "out", reasons: fails };
  if (missing.length > 0) return { verdict: "unknown", reasons: missing };

  return { verdict: "in", reasons: passes };
}
