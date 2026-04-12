export type AccountType = "cash" | "checking" | "savings" | "credit_card";

export type Direction = "up" | "down" | "flat" | "none";

export type DeltaResult = {
  delta: number | null;
  direction: Direction;
};

export function signedDelta(
  _accountType: AccountType,
  prev: number | null,
  curr: number,
): DeltaResult {
  if (prev === null) return { delta: null, direction: "none" };
  const delta = curr - prev;
  if (delta > 0) return { delta, direction: "up" };
  if (delta < 0) return { delta, direction: "down" };
  return { delta: 0, direction: "flat" };
}
