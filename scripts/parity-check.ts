// Compares the API responses of two Cashy deployments that hold the same data
// (for example the old PostgreSQL stack and the new D1 one) and reports every
// difference.
//
//   CASHY_TOKEN=<api key> bun scripts/parity-check.ts <old base URL> <new base URL>
//
// The token defaults to the one saved by `cashy auth login`. Every month is
// checked, walking back from next month until six months in a row hold no
// data. Timestamps are compared as instants, so their string format is free
// to differ. Exits 1 if anything else differs.
import { readConfigFile } from "../src/cli/config";
import {
  currentMonthKey,
  lastDayOfMonthFromKey,
  nextMonthKey,
  prevMonthKey,
} from "../src/lib/date";

const [oldUrl, newUrl] = process.argv.slice(2);
const token = process.env.CASHY_TOKEN ?? (await readConfigFile()).token;

if (!oldUrl || !newUrl || !token) {
  console.error(
    "Usage: CASHY_TOKEN=<api key> bun scripts/parity-check.ts <old base URL> <new base URL>",
  );
  process.exit(2);
}

const EMPTY_MONTHS_BEFORE_STOPPING = 6;
const IGNORED_KEYS = new Set(["createdAt", "updatedAt"]);
const INSTANT_KEYS = new Set(["archivedAt"]);

type Fetched = { status: number; body: unknown };

async function get(baseUrl: string, apiPath: string): Promise<Fetched> {
  const res = await fetch(new URL(apiPath, baseUrl), {
    headers: { "x-api-key": token! },
  });
  const text = await res.text();
  try {
    return { status: res.status, body: normalize(JSON.parse(text)) };
  } catch {
    return { status: res.status, body: text };
  }
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (IGNORED_KEYS.has(key)) continue;
    out[key] =
      INSTANT_KEYS.has(key) && typeof v === "string"
        ? new Date(v).getTime()
        : normalize(v);
  }
  return out;
}

function diff(a: unknown, b: unknown, at: string, out: string[]): void {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push(`${at}: length ${a.length} vs ${b.length}`);
      return;
    }
    a.forEach((item, i) => diff(item, b[i], `${at}[${i}]`, out));
    return;
  }
  if (isRecord(a) && isRecord(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diff(a[key], b[key], `${at}.${key}`, out);
    }
    return;
  }
  if (a !== b) out.push(`${at}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

let checked = 0;
let failed = 0;

async function compare(apiPath: string): Promise<Fetched> {
  const [a, b] = await Promise.all([get(oldUrl!, apiPath), get(newUrl!, apiPath)]);
  const differences: string[] = [];
  if (a.status !== b.status) {
    differences.push(`status ${a.status} vs ${b.status}`);
  }
  diff(a.body, b.body, "body", differences);

  checked++;
  if (differences.length > 0) {
    failed++;
    console.log(`DIFF ${apiPath}`);
    for (const line of differences.slice(0, 10)) console.log(`     ${line}`);
    if (differences.length > 10) {
      console.log(`     … and ${differences.length - 10} more`);
    }
  }
  return a;
}

function hasData(history: Fetched, transactions: Fetched): boolean {
  const rows = isRecord(history.body) ? history.body.rows : undefined;
  const txs = isRecord(transactions.body)
    ? transactions.body.transactions
    : undefined;
  return (
    (Array.isArray(rows) && rows.length > 0) ||
    (Array.isArray(txs) && txs.length > 0)
  );
}

console.log(`old: ${oldUrl}\nnew: ${newUrl}\n`);

const session = await compare("/api/session");
if (session.status !== 200) {
  console.error(
    `The old deployment answered /api/session with ${session.status}; is the token valid there?`,
  );
  process.exit(1);
}

for (const apiPath of [
  "/api/accounts",
  "/api/budget-items",
  "/api/recurring-transactions",
  "/api/dashboard",
]) {
  await compare(apiPath);
}

let month = nextMonthKey(currentMonthKey());
let emptyStreak = 0;
let oldestWithData = "";
let months = 0;

while (emptyStreak < EMPTY_MONTHS_BEFORE_STOPPING) {
  await compare(`/api/dashboard?month=${month}`);
  const history = await compare(`/api/balance-history?month=${month}`);
  const transactions = await compare(`/api/transactions?month=${month}`);
  await compare(
    `/api/balance-snapshots/prefill?date=${lastDayOfMonthFromKey(month)}`,
  );

  months++;
  if (hasData(history, transactions)) {
    emptyStreak = 0;
    oldestWithData = month;
  } else {
    emptyStreak++;
  }
  month = prevMonthKey(month);
}

console.log(
  `\n${checked} requests over ${months} months (data back to ${oldestWithData || "none"}): ` +
    (failed === 0 ? "no differences" : `${failed} with differences`),
);
process.exit(failed === 0 ? 0 : 1);
