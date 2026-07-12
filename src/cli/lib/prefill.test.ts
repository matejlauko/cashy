import { test, expect } from "bun:test";
import { mergeWithPrefill, type PlannedSnapshot } from "./prefill";
import type { PrefillRow } from "../client";

const prefill: PrefillRow[] = [
  {
    financialAccountId: "acc_1",
    accountName: "Checking",
    accountType: "checking",
    amountMinorRaw: 100,
  },
  {
    financialAccountId: "acc_2",
    accountName: "Air Bank",
    accountType: "savings",
    amountMinorRaw: 200,
  },
  {
    financialAccountId: "acc_3",
    accountName: "Fio",
    accountType: "checking",
    amountMinorRaw: 300,
  },
];

test("fills only missing accounts; explicit values win", () => {
  const specified: PlannedSnapshot[] = [
    { financialAccountId: "acc_1", accountName: "Checking", amountMinorRaw: 999 },
  ];
  const { snapshots, carriedForward } = mergeWithPrefill(specified, prefill);

  expect(carriedForward.map((s) => s.financialAccountId).sort()).toEqual([
    "acc_2",
    "acc_3",
  ]);
  const acc1 = snapshots.find((s) => s.financialAccountId === "acc_1");
  expect(acc1?.amountMinorRaw).toBe(999);
  const acc2 = snapshots.find((s) => s.financialAccountId === "acc_2");
  expect(acc2?.amountMinorRaw).toBe(200);
});

test("all specified → no carry-forward", () => {
  const specified: PlannedSnapshot[] = prefill.map((p) => ({
    financialAccountId: p.financialAccountId,
    accountName: p.accountName,
    amountMinorRaw: 1,
  }));
  const { snapshots, carriedForward } = mergeWithPrefill(specified, prefill);
  expect(carriedForward).toHaveLength(0);
  expect(snapshots).toHaveLength(3);
});

test("none specified → all carried forward", () => {
  const { snapshots, carriedForward } = mergeWithPrefill([], prefill);
  expect(carriedForward).toHaveLength(3);
  expect(snapshots).toHaveLength(3);
  expect(snapshots.map((s) => s.amountMinorRaw).sort()).toEqual([100, 200, 300]);
});

test("result covers exactly the prefill account set when specified ⊆ prefill", () => {
  const specified: PlannedSnapshot[] = [
    { financialAccountId: "acc_2", accountName: "Air Bank", amountMinorRaw: 50 },
  ];
  const { snapshots } = mergeWithPrefill(specified, prefill);
  expect(snapshots.map((s) => s.financialAccountId).sort()).toEqual([
    "acc_1",
    "acc_2",
    "acc_3",
  ]);
});
