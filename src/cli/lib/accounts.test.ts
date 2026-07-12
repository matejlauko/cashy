import { test, expect } from "bun:test";
import { resolveAccountRef, accountListHint } from "./accounts";
import type { ApiAccount } from "../client";

const accounts: ApiAccount[] = [
  { id: "acc_1", name: "Checking", type: "checking" },
  { id: "acc_2", name: "Air Bank", type: "savings" },
];

test("resolves by exact id", () => {
  expect(resolveAccountRef("acc_2", accounts)?.name).toBe("Air Bank");
});

test("resolves by case-insensitive name, trimmed", () => {
  expect(resolveAccountRef("checking", accounts)?.id).toBe("acc_1");
  expect(resolveAccountRef(" AIR BANK ", accounts)?.id).toBe("acc_2");
});

test("id match wins over name match", () => {
  const tricky: ApiAccount[] = [
    { id: "Checking", name: "Other", type: "checking" },
    { id: "acc_9", name: "Checking", type: "checking" },
  ];
  expect(resolveAccountRef("Checking", tricky)?.id).toBe("Checking");
});

test("returns undefined for unknown ref", () => {
  expect(resolveAccountRef("Nope", accounts)).toBeUndefined();
});

test("hint lists names", () => {
  expect(accountListHint(accounts)).toBe("Valid accounts: Checking, Air Bank");
});
