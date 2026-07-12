import { test, expect } from "bun:test";
import { parseCsv } from "./csv";

test("parses simple rows", () => {
  expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("handles quoted fields with commas and escaped quotes", () => {
  expect(parseCsv('date,"Credit Card, Main"\n2026-07-01,"say ""hi"""\n')).toEqual([
    ["date", "Credit Card, Main"],
    ["2026-07-01", 'say "hi"'],
  ]);
});

test("handles CRLF, BOM, empty cells, empty lines", () => {
  expect(parseCsv("﻿date,A,B\r\n2026-07-01,1.5,\r\n\r\n")).toEqual([
    ["date", "A", "B"],
    ["2026-07-01", "1.5", ""],
  ]);
});

test("trims unquoted cells", () => {
  expect(parseCsv("a , b\n 1, 2 \n")).toEqual([
    ["a", "b"],
    ["1", "2"],
  ]);
});
