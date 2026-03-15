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
 * First day of the next month as YYYY-MM-DD in UTC.
 */
export function nextMonthStart(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 0-indexed -> 1-indexed
  if (month === 12) {
    return `${year + 1}-01-01`;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/**
 * Format a YYYY-MM-DD string for display: "Mar 12" (current year) or "Mar 12, 2025" (other years).
 */
export function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;

  const isCurrentYear = year === new Date().getUTCFullYear();

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(isCurrentYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
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

// ─── Month-key helpers (YYYY-MM format) ─────────────────────────────────────

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value);
}

export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthStartFromKey(key: string): string {
  return `${key}-01`;
}

export function monthEndFromKey(key: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  if (month === 12) return `${year + 1}-01-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export function lastDayOfMonthFromKey(key: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  // Day 0 of the next month = last day of this month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${key}-${String(lastDay).padStart(2, "0")}`;
}

export function prevMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

export function nextMonthKey(key: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
