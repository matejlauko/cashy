import { describe, expect, test } from "bun:test";
import { balanceHistoryQuerySchema } from "@/schemas/balance-history";

describe("balanceHistoryQuerySchema", () => {
  test("accepts a valid YYYY-MM string", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-04" });
    expect(result.success).toBe(true);
  });

  test("accepts single-digit-like months with leading zero", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-01" });
    expect(result.success).toBe(true);
  });

  test("accepts December", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-12" });
    expect(result.success).toBe(true);
  });

  test("rejects month without leading zero", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-4" });
    expect(result.success).toBe(false);
  });

  test("rejects month 13", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-13" });
    expect(result.success).toBe(false);
  });

  test("rejects month 00", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "2026-00" });
    expect(result.success).toBe(false);
  });

  test("rejects non-string input", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: 202604 });
    expect(result.success).toBe(false);
  });

  test("rejects missing field", () => {
    const result = balanceHistoryQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects garbage string", () => {
    const result = balanceHistoryQuerySchema.safeParse({ month: "april" });
    expect(result.success).toBe(false);
  });
});
