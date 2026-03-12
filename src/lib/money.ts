const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Assert a value can be safely represented in JSON as an integer.
 */
export function assertSafeInteger(value: number, label = "value"): number {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return value;
}

/**
 * Parse a user-entered decimal string into minor units (halere).
 * Accepts both "." and "," as decimal separators.
 * Input must be non-negative (sign is derived from transaction type).
 * "123,45" -> 12345, "100" -> 10000, "0.5" -> 50
 */
export function parseMoneyInput(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") throw new Error("Empty money input");

  // Normalize commas to dots
  const normalized = trimmed.replace(/,/g, ".");

  // Validate format: digits, optional decimal with up to 2 digits
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Invalid money format: "${input}"`);
  }

  const parts = normalized.split(".");
  const whole = parts[0]!;
  const frac = (parts[1] ?? "").padEnd(2, "0");

  return assertSafeInteger(
    Number(whole) * 100 + Number(frac),
    "Money amount in minor units",
  );
}

/**
 * Format minor units to a localized CZK string.
 * 12345 -> "123,45 CZK" (locale-dependent)
 */
const czkFormatter = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoneyMinor(amountMinor: number): string {
  assertSafeInteger(amountMinor, "Money amount in minor units");
  return czkFormatter.format(amountMinor / 100);
}

/**
 * Convert a bigint from the database to a safe JS number.
 * Throws if the value exceeds Number.MAX_SAFE_INTEGER / Number.MIN_SAFE_INTEGER.
 */
export function bigintToSafeNumber(value: bigint): number {
  if (value > MAX_SAFE_BIGINT) {
    throw new Error(`Value ${value} exceeds MAX_SAFE_INTEGER`);
  }
  if (value < MIN_SAFE_BIGINT) {
    throw new Error(`Value ${value} is below MIN_SAFE_INTEGER`);
  }
  return Number(value);
}
