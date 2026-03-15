import { z } from "zod";
import { transactionTypeSchema } from "./transactions";

const safeMinorUnitsSchema = z
  .number()
  .int("Must be a whole number (minor units)")
  .refine(Number.isSafeInteger, "Amount must be a safe integer");

const recurringTransactionInputShape = {
  name: z.string().trim().min(1, "Name is required").max(200),
  bankName: z.string().trim().max(100).optional(),
  type: transactionTypeSchema,
  amountMinor: safeMinorUnitsSchema.refine(
    (v) => v > 0,
    "Amount must be positive",
  ),
  dayOfMonth: z
    .number()
    .int("Must be a whole number")
    .min(1, "Day must be between 1 and 31")
    .max(31, "Day must be between 1 and 31"),
} as const;

export const createRecurringTransactionInput = z.object(
  recurringTransactionInputShape,
);

export type CreateRecurringTransactionInput = z.infer<
  typeof createRecurringTransactionInput
>;

export const updateRecurringTransactionInput = z
  .object(recurringTransactionInputShape)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateRecurringTransactionInput = z.infer<
  typeof updateRecurringTransactionInput
>;
