import { describe, expect, test } from "bun:test";
import { computeFromRecurringDate } from "@/lib/date";

describe("computeFromRecurringDate", () => {
  test("uses dayOfMonth when it is in the past this month", () => {
    expect(computeFromRecurringDate(1, "2026-04-11")).toBe("2026-04-01");
  });

  test("uses today when dayOfMonth matches today", () => {
    expect(computeFromRecurringDate(11, "2026-04-11")).toBe("2026-04-11");
  });

  test("clamps to today when dayOfMonth is still in the future this month", () => {
    expect(computeFromRecurringDate(25, "2026-04-11")).toBe("2026-04-11");
  });

  test("clamps day 31 to last day of a 30-day month when in the past", () => {
    // Today is May 31 — dayOfMonth=31 resolves to 2026-05-31
    expect(computeFromRecurringDate(31, "2026-05-31")).toBe("2026-05-31");
  });

  test("clamps day 31 to today in April (30-day month) when today is earlier than clamped day", () => {
    // April has 30 days. min(31, 30) = 30, which is still > today 11 → return today
    expect(computeFromRecurringDate(31, "2026-04-11")).toBe("2026-04-11");
  });

  test("clamps day 31 to 28 in a non-leap February when today matches", () => {
    // Feb 2026 has 28 days. min(31, 28) = 28. today is 28 → return 2026-02-28
    expect(computeFromRecurringDate(31, "2026-02-28")).toBe("2026-02-28");
  });

  test("clamps day 31 to today in a non-leap February when today is mid-month", () => {
    // min(31, 28) = 28, 28 > 15 → today
    expect(computeFromRecurringDate(31, "2026-02-15")).toBe("2026-02-15");
  });

  test("pads single-digit months and days correctly", () => {
    expect(computeFromRecurringDate(5, "2026-01-10")).toBe("2026-01-05");
  });
});
