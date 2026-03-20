import { z } from "zod";

const safeMinorUnitsSchema = z
  .number()
  .int("Must be a whole number (minor units)")
  .refine(Number.isSafeInteger, "Amount must be a safe integer");

const budgetItemInputShape = {
  name: z.string().trim().min(1, "Name is required").max(200),
  amountMinor: safeMinorUnitsSchema.refine(
    (v) => v > 0,
    "Amount must be positive",
  ),
} as const;

export const createBudgetItemInput = z.object(budgetItemInputShape);

export type CreateBudgetItemInput = z.infer<typeof createBudgetItemInput>;

export const updateBudgetItemInput = z
  .object(budgetItemInputShape)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateBudgetItemInput = z.infer<typeof updateBudgetItemInput>;
