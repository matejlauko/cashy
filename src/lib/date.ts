const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Check if a string is a valid YYYY-MM-DD date.
 */
export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(value + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  // Ensure the parsed date matches the input (rejects Feb 30, etc.)
  const [y, m, day] = value.split("-").map(Number) as [number, number, number];
  return (
    d.getFullYear() === y &&
    d.getMonth() + 1 === m &&
    d.getDate() === day
  );
}

/**
 * Assert that a string is a valid YYYY-MM-DD date. Returns the string if valid.
 */
export function assertDateString(value: string): string {
  if (!isDateString(value)) {
    throw new Error(`Invalid date string: "${value}"`);
  }
  return value;
}

/**
 * Today's date as YYYY-MM-DD in UTC.
 */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * First day of the current month as YYYY-MM-DD in UTC.
 */
export function currentMonthStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Format a Date to YYYY-MM-DD in UTC.
 */
export function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
