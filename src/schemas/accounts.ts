import { z } from "zod";

export const accountTypeSchema = z.enum([
  "cash",
  "checking",
  "savings",
  "credit_card",
]);

export type AccountType = z.infer<typeof accountTypeSchema>;

export const ACCOUNT_TYPES = accountTypeSchema.options;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit Card",
};

const safeMinorUnitsSchema = z
  .number()
  .int("Must be a whole number (minor units)")
  .refine(Number.isSafeInteger, "Amount must be a safe integer");

export const createAccountInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  institutionName: z.string().trim().max(100).optional(),
  type: accountTypeSchema,
  initialBalance: safeMinorUnitsSchema,
});

export type CreateAccountInput = z.infer<typeof createAccountInput>;

export const updateAccountInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  institutionName: z.string().trim().max(100).optional(),
  type: accountTypeSchema,
});

export type UpdateAccountInput = z.infer<typeof updateAccountInput>;
