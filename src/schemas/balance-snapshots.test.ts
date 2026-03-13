import { describe, expect, test } from "bun:test";
import { bulkBalanceUpdateInput } from "@/schemas/balance-snapshots";
import { today } from "@/lib/date";

function tomorrow(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

describe("bulkBalanceUpdateInput", () => {
  test("accepts valid payload", () => {
    const result = bulkBalanceUpdateInput.safeParse({
      effectiveDate: today(),
      snapshots: [
        { financialAccountId: "acc-1", amountMinorRaw: 12345 },
        { financialAccountId: "acc-2", amountMinorRaw: 0 },
      ],
    });

    expect(result.success).toBe(true);
  });

  test("rejects future effectiveDate", () => {
    const result = bulkBalanceUpdateInput.safeParse({
      effectiveDate: tomorrow(),
      snapshots: [{ financialAccountId: "acc-1", amountMinorRaw: 100 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("Future dates")),
      ).toBe(true);
    }
  });

  test("rejects duplicate account snapshots", () => {
    const result = bulkBalanceUpdateInput.safeParse({
      effectiveDate: today(),
      snapshots: [
        { financialAccountId: "acc-1", amountMinorRaw: 100 },
        { financialAccountId: "acc-1", amountMinorRaw: 200 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("Each account can appear only once"),
        ),
      ).toBe(true);
    }
  });
});
