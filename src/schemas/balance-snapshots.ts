import { z } from "zod";
import { isDateString, today } from "@/lib/date";

const safeMinorUnitsSchema = z
  .number()
  .int("Must be a whole number (minor units)")
  .refine(Number.isSafeInteger, "Amount must be a safe integer");

const dateStringSchema = z
  .string()
  .refine(isDateString, "Must be a valid YYYY-MM-DD date");

export const prefillQuerySchema = z.object({
  date: dateStringSchema,
});

export const bulkBalanceUpdateInput = z.object({
  effectiveDate: dateStringSchema.refine(
    (value) => value <= today(),
    "Future dates are not allowed",
  ),
  snapshots: z
    .array(
      z.object({
        financialAccountId: z.string().min(1),
        amountMinorRaw: safeMinorUnitsSchema,
      }),
    )
    .min(1, "At least one snapshot is required")
    .superRefine((snapshots, ctx) => {
      const seenIds = new Set<string>();
      for (let i = 0; i < snapshots.length; i++) {
        const accountId = snapshots[i]!.financialAccountId;
        if (seenIds.has(accountId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Each account can appear only once",
            path: [i, "financialAccountId"],
          });
        }
        seenIds.add(accountId);
      }
    }),
});

export type BulkBalanceUpdateInput = z.infer<typeof bulkBalanceUpdateInput>;
