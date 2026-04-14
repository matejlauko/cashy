import { describe, expect, test } from "bun:test";
import { signedDelta } from "./signed-delta";

describe("signedDelta (assets)", () => {
  test("assets: positive change is UP direction", () => {
    expect(signedDelta("checking", 10000, 12000)).toEqual({
      delta: 2000,
      direction: "up",
    });
  });

  test("assets: negative change is DOWN direction", () => {
    expect(signedDelta("savings", 50000, 45000)).toEqual({
      delta: -5000,
      direction: "down",
    });
  });

  test("assets: zero change is FLAT direction", () => {
    expect(signedDelta("cash", 10000, 10000)).toEqual({
      delta: 0,
      direction: "flat",
    });
  });
});

describe("signedDelta (credit_card)", () => {
  test("less debt (signed value toward zero from below) is UP direction", () => {
    expect(signedDelta("credit_card", -10000, -8000)).toEqual({
      delta: 2000,
      direction: "up",
    });
  });

  test("more debt (signed value further from zero below) is DOWN direction", () => {
    expect(signedDelta("credit_card", -8000, -10000)).toEqual({
      delta: -2000,
      direction: "down",
    });
  });

  test("flat credit-card balance is FLAT", () => {
    expect(signedDelta("credit_card", -5000, -5000)).toEqual({
      delta: 0,
      direction: "flat",
    });
  });

  test("credit card paid off: -1000 → 0 is UP", () => {
    expect(signedDelta("credit_card", -1000, 0)).toEqual({
      delta: 1000,
      direction: "up",
    });
  });
});

describe("signedDelta (no previous value)", () => {
  test("returns null delta and 'none' direction when prev is null", () => {
    expect(signedDelta("checking", null, 5000)).toEqual({
      delta: null,
      direction: "none",
    });
  });
});
