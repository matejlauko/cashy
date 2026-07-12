import { test, expect } from "bun:test";
import { parseImportFile, buildDatePlans } from "./import-matrix";
import type { ApiAccount } from "../client";

const accounts: ApiAccount[] = [
  { id: "acc_1", name: "Checking", type: "checking" },
  { id: "acc_2", name: "Savings", type: "savings" },
];

const TODAY = "2026-07-12";

test("CSV: parses matrix, skips empty cells", () => {
  const csv = "date,Checking,Savings\n2026-07-08,1100.20,9050\n2026-07-01,1234.56,\n";
  const { rows, issues } = parseImportFile("balances.csv", csv);
  expect(issues).toEqual([]);
  expect(rows).toEqual([
    {
      date: "2026-07-08",
      cells: [
        { accountRef: "Checking", rawAmount: "1100.20" },
        { accountRef: "Savings", rawAmount: "9050" },
      ],
    },
    {
      date: "2026-07-01",
      cells: [{ accountRef: "Checking", rawAmount: "1234.56" }],
    },
  ]);
});

test("CSV: header must start with 'date'", () => {
  const { issues } = parseImportFile("f.csv", "day,Checking\n2026-07-01,1\n");
  expect(issues).toEqual(['CSV header must start with a "date" column (got "day")']);
});

test("CSV: duplicate account columns and duplicate dates reported", () => {
  const csv = "date,Checking,checking\n2026-07-01,1,2\n2026-07-01,3,4\n";
  const { issues } = parseImportFile("f.csv", csv);
  expect(issues).toContain('Duplicate account column: "checking"');
  expect(issues).toContain("Duplicate date: 2026-07-01");
});

test("JSON: parses date-keyed matrix", () => {
  const json = JSON.stringify({
    "2026-07-08": { Checking: 1100.2 },
    "2026-07-01": { Checking: 1234.56, Savings: 9000 },
  });
  const { rows, issues } = parseImportFile("balances.json", json);
  expect(issues).toEqual([]);
  expect(rows.length).toBe(2);
  expect(rows[1]).toEqual({
    date: "2026-07-01",
    cells: [
      { accountRef: "Checking", rawAmount: "1234.56" },
      { accountRef: "Savings", rawAmount: "9000" },
    ],
  });
});

test("JSON: rejects non-object roots and unsupported extensions", () => {
  expect(parseImportFile("f.json", "[1,2]").issues.length).toBe(1);
  expect(parseImportFile("f.txt", "").issues).toEqual([
    "Unsupported file type: .txt (use .csv or .json)",
  ]);
});

test("buildDatePlans: resolves, validates, sorts oldest first", () => {
  const rows = [
    {
      date: "2026-07-08",
      cells: [{ accountRef: "checking", rawAmount: "1100.20" }],
    },
    {
      date: "2026-07-01",
      cells: [{ accountRef: "acc_2", rawAmount: "9000" }],
    },
  ];
  const { plans, issues } = buildDatePlans(rows, accounts, TODAY);
  expect(issues).toEqual([]);
  expect(plans.map((p) => p.date)).toEqual(["2026-07-01", "2026-07-08"]);
  expect(plans[1]!.snapshots).toEqual([
    { financialAccountId: "acc_1", accountName: "Checking", amountMinorRaw: 110020 },
  ]);
});

test("buildDatePlans: collects ALL issues, returns no plans on any issue", () => {
  const rows = [
    {
      date: "2026-07-99",
      cells: [{ accountRef: "Nope", rawAmount: "abc" }],
    },
    {
      date: "2026-12-31",
      cells: [{ accountRef: "Checking", rawAmount: "1.234" }],
    },
  ];
  const { plans, issues } = buildDatePlans(rows, accounts, TODAY);
  expect(plans).toEqual([]);
  expect(issues).toEqual([
    '2026-07-99: invalid date',
    '2026-07-99 / "Nope": unknown account (Valid accounts: Checking, Savings)',
    '2026-07-99 / "Nope": "abc" is not a valid amount',
    "2026-12-31: future dates are not allowed",
    '2026-12-31 / "Checking": "1.234" has more than 2 decimal places',
  ]);
});

test("buildDatePlans: rows with no cells are dropped", () => {
  const { plans, issues } = buildDatePlans(
    [{ date: "2026-07-01", cells: [] }],
    accounts,
    TODAY,
  );
  expect(issues).toEqual([]);
  expect(plans).toEqual([]);
});
