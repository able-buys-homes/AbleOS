// src/lib/byLot.ts
// Lot numbers are text in the database, so a plain sort puts 12 before 2.
// Numbers are compared as numbers; anything that is not a number
// ("106 Fox Run Rd") goes after the lots, alphabetically.
export function byLot<T extends { lot_number?: string | number | null }>(
  a: T,
  b: T,
): number {
  const x = Number(a.lot_number);
  const y = Number(b.lot_number);
  const xNum = a.lot_number != null && a.lot_number !== "" && Number.isFinite(x);
  const yNum = b.lot_number != null && b.lot_number !== "" && Number.isFinite(y);

  if (xNum && yNum) return x - y;
  if (xNum) return -1;
  if (yNum) return 1;

  return String(a.lot_number ?? "").localeCompare(String(b.lot_number ?? ""));
}