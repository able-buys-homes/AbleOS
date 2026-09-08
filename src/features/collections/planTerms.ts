// src/features/collections/planTerms.ts
// The terms of a payment plan, read back off the installments it created.
//
// Shared by Zo's Plans tab and Raj's approvals on purpose. A card that names a
// resident but not what they agreed to is how somebody ends up approving, or
// signing, terms nobody on the screen can see — and the two screens must never
// be able to describe the same plan differently.

import { money } from "./parts";

function when(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function planTerms(p: any): string[] {
  const rows = [...(p.plan_installments ?? [])].sort((a: any, b: any) =>
    String(a.due_date).localeCompare(String(b.due_date)),
  );

  // A plan with no installments is not a plan. Nothing may be printed or
  // signed against it, and the card has to say so rather than looking empty.
  if (rows.length === 0) {
    return [
      "No payments are recorded against this plan. Do not print or sign anything — tell Raj.",
    ];
  }

  const each = Number(rows[0].amount);
  const total = rows.reduce((sum: number, r: any) => sum + Number(r.amount), 0);

  const lines = [
    `${money(each)} each · ${rows.length} payment${
      rows.length === 1 ? "" : "s"
    } · ${money(total)} in total`,
    `First payment ${when(rows[0].due_date)}${
      rows.length > 1
        ? ` · ${String(p.frequency ?? "Every two weeks").toLowerCase()}`
        : ""
    }`,
  ];

  // Every date, not just the first. Raj is agreeing to all of them.
  if (rows.length > 1) {
    lines.push(`Dates: ${rows.map((r: any) => when(r.due_date)).join(", ")}`);
  }

  if (p.reason) lines.push(`Reason given: ${p.reason}`);

  return lines;
}