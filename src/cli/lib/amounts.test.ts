import { test, expect } from "bun:test";
import { parseMajorAmount, formatMinor } from "./amounts";

test("parses integers and decimals to minor units", () => {
  expect(parseMajorAmount("1234.56")).toBe(123456);
  expect(parseMajorAmount("9000")).toBe(900000);
  expect(parseMajorAmount("0.5")).toBe(50);
  expect(parseMajorAmount("0.05")).toBe(5);
  expect(parseMajorAmount("-250.00")).toBe(-25000);
  expect(parseMajorAmount(" 42 ")).toBe(4200);
});

test("rejects invalid amounts", () => {
  expect(() => parseMajorAmount("1.234")).toThrow(/decimal/);
  expect(() => parseMajorAmount("abc")).toThrow(/not a valid amount/i);
  expect(() => parseMajorAmount("")).toThrow(/not a valid amount/i);
  expect(() => parseMajorAmount("1,5")).toThrow(/not a valid amount/i);
  expect(() => parseMajorAmount("1e5")).toThrow(/not a valid amount/i);
});

test("formats minor units with space grouping", () => {
  expect(formatMinor(123456)).toBe("1 234.56");
  expect(formatMinor(12345678)).toBe("123 456.78");
  expect(formatMinor(900000)).toBe("9 000.00");
  expect(formatMinor(5)).toBe("0.05");
  expect(formatMinor(0)).toBe("0.00");
  expect(formatMinor(-25000)).toBe("-250.00");
});
