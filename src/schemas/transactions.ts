import { z } from "zod";
import { isDateString, today } from "@/lib/date";

export const transactionTypeSchema = z.enum(["income", "expense"]);

export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const TRANSACTION_TYPES = transactionTypeSchema.options;

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
};

const safeMinorUnitsSchema = z
  .number()
  .int("Must be a whole number (minor units)")
  .refine(Number.isSafeInteger, "Amount must be a safe integer");

const transactionDateSchema = z
  .string()
  .refine(isDateString, "Must be a valid YYYY-MM-DD date")
  .refine((v) => v <= today(), "Future dates are not allowed");

const transactionInputShape = {
  name: z.string().trim().min(1, "Name is required").max(200),
  financialAccountId: z.string().min(1, "Account is required"),
  amountMinor: safeMinorUnitsSchema.refine(
    (v) => v > 0,
    "Amount must be positive",
  ),
  transactionDate: transactionDateSchema,
  type: transactionTypeSchema,
} as const;

export const createTransactionInput = z.object(transactionInputShape);

export type CreateTransactionInput = z.infer<typeof createTransactionInput>;

export const updateTransactionInput = z
  .object(transactionInputShape)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateTransactionInput = z.infer<typeof updateTransactionInput>;
