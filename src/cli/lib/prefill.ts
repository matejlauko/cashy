import type { PrefillRow } from "../client";

export type PlannedSnapshot = {
  financialAccountId: string;
  accountName: string;
  amountMinorRaw: number;
};

/**
 * Merge explicitly-set snapshots with prefill rows so the result covers
 * every active account (the bulk API requires the full set). Explicit
 * values win; missing accounts are carried forward from prefill.
 */
export function mergeWithPrefill(
  specified: PlannedSnapshot[],
  prefill: PrefillRow[],
): { snapshots: PlannedSnapshot[]; carriedForward: PlannedSnapshot[] } {
  const specifiedIds = new Set(specified.map((s) => s.financialAccountId));
  const carriedForward = prefill
    .filter((p) => !specifiedIds.has(p.financialAccountId))
    .map((p) => ({
      financialAccountId: p.financialAccountId,
      accountName: p.accountName,
      amountMinorRaw: p.amountMinorRaw,
    }));
  return { snapshots: [...specified, ...carriedForward], carriedForward };
}
