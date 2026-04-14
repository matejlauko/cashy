import { z } from "zod";

const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Must be a valid YYYY-MM month key");

export const balanceHistoryQuerySchema = z.object({
  month: monthKeySchema,
});

export type BalanceHistoryQuery = z.infer<typeof balanceHistoryQuerySchema>;

// ─── Response shape (for client-side typing; not validated server-side) ────

export type BalanceHistoryAccountDto = {
  id: string;
  name: string;
  type: "cash" | "checking" | "savings" | "credit_card";
  archivedAt: string | null;
};

export type BalanceHistoryRowDto = {
  date: string; // YYYY-MM-DD
  balances: Record<string, number>; // signed minor units
};

export type BalanceHistoryResponse = {
  month: string;
  accounts: BalanceHistoryAccountDto[];
  rows: BalanceHistoryRowDto[];
  baseline: { balances: Record<string, number> };
};
