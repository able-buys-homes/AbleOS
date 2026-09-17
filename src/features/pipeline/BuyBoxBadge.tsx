// src/features/pipeline/BuyBoxBadge.tsx
// Shows whether a deal fits the buy box. Grey for "not measured yet" on
// purpose - it reads as neutral, because an unmeasured deal is neither
// good news nor bad.

import { evaluateBuyBox, BUY_BOX } from "./buyBox";

const STYLES = {
  in: { chip: "bg-[#16A34A] text-white", label: "In buy box" },
  out: { chip: "bg-[#DC2626] text-white", label: "Out of box" },
  unknown: { chip: "bg-[#E2E8F0] text-[#475569]", label: "Not measured" },
} as const;

type DealLike = {
  address?: string | null;
  dscr?: string | number | null;
  monthly_cash_flow?: string | number | null;
};

export function BuyBoxBadge({
  deal,
  showReasons = false,
}: {
  deal: DealLike;
  showReasons?: boolean;
}) {
  const { verdict, reasons } = evaluateBuyBox(deal);
  const style = STYLES[verdict];

  if (!showReasons) {
    return (
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[14px] font-semibold ${style.chip}`}
      >
        {style.label}
      </span>
    );
  }

  return (
    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-semibold uppercase tracking-wide text-[#7A8AA3]">
          Buy box
        </span>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[14px] font-semibold ${style.chip}`}
        >
          {style.label}
        </span>
      </div>

      <ul className="mt-2 space-y-1">
        {reasons.map((reason) => (
          <li key={reason} className="text-[16px] text-[#3A4A62]">
            {reason}
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-[#EEF2F7] pt-3 text-[14px] text-[#7A8AA3]">
        The box is DSCR {BUY_BOX.minDscr} or better and $
        {BUY_BOX.minMonthlyCashFlow.toLocaleString()} a month net, in Florida,
        Arkansas and Texas.
      </p>
    </div>
  );
}
