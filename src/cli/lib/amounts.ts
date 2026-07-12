const AMOUNT_RE = /^-?\d+(\.\d{1,2})?$/;

/** Parse a major-unit amount string ("1234.56") into integer minor units. */
export function parseMajorAmount(input: string): number {
  const trimmed = input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`"${input}" is not a valid amount`);
  }
  if (!AMOUNT_RE.test(trimmed)) {
    throw new Error(`"${input}" has more than 2 decimal places`);
  }
  const negative = trimmed.startsWith("-");
  const [wholePart, fracPart = ""] = (negative ? trimmed.slice(1) : trimmed)
    .split(".") as [string, string?];
  const minor =
    Number(wholePart) * 100 + Number((fracPart ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`"${input}" is too large`);
  }
  return negative ? -minor : minor;
}

/** Format integer minor units as "1 234.56" (space thousands grouping). */
export function formatMinor(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString();
  const frac = (abs % 100).toString().padStart(2, "0");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negative ? "-" : ""}${grouped}.${frac}`;
}
