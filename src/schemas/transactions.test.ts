import { describe, expect, test } from "bun:test";
import {
  createTransactionInput,
  updateTransactionInput,
} from "@/schemas/transactions";

function tomorrowUtcDateString(): string {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

describe("createTransactionInput", () => {
  test("accepts a valid transaction payload", () => {
    const result = createTransactionInput.safeParse({
      name: "Salary",
      financialAccountId: "acc_1",
      amountMinor: 12345,
      transactionDate: "2026-03-01",
      type: "income",
    });
    expect(result.success).toBe(true);
  });

  test("rejects future transactionDate", () => {
    const result = createTransactionInput.safeParse({
      name: "Future expense",
      financialAccountId: "acc_1",
      amountMinor: 5000,
      transactionDate: tomorrowUtcDateString(),
      type: "expense",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateTransactionInput", () => {
  test("accepts partial payloads", () => {
    const result = updateTransactionInput.safeParse({
      name: "Renamed transaction",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty payload", () => {
    const result = updateTransactionInput.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects future transactionDate when provided", () => {
    const result = updateTransactionInput.safeParse({
      transactionDate: tomorrowUtcDateString(),
    });
    expect(result.success).toBe(false);
  });
});
