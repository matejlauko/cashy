import path from "node:path";
import { isDateString } from "@/lib/date";
import type { ApiAccount } from "../client";
import { parseCsv } from "./csv";
import { parseMajorAmount } from "./amounts";
import { resolveAccountRef, accountListHint } from "./accounts";

export type MatrixCell = { accountRef: string; rawAmount: string };
export type MatrixRow = { date: string; cells: MatrixCell[] };

export type DatePlan = {
  date: string;
  snapshots: {
    financialAccountId: string;
    accountName: string;
    amountMinorRaw: number;
  }[];
};

export function parseImportFile(
  filename: string,
  content: string,
): { rows: MatrixRow[]; issues: string[] } {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".csv") return parseCsvMatrix(content);
  if (ext === ".json") return parseJsonMatrix(content);
  return {
    rows: [],
    issues: [`Unsupported file type: ${ext} (use .csv or .json)`],
  };
}

function parseCsvMatrix(content: string): {
  rows: MatrixRow[];
  issues: string[];
} {
  const issues: string[] = [];
  const grid = parseCsv(content);
  if (grid.length === 0) return { rows: [], issues: ["File is empty"] };

  const header = grid[0]!;
  if ((header[0] ?? "").toLowerCase() !== "date") {
    return {
      rows: [],
      issues: [`CSV header must start with a "date" column (got "${header[0] ?? ""}")`],
    };
  }
  const accountRefs = header.slice(1);
  const seenRefs = new Set<string>();
  for (const ref of accountRefs) {
    const key = ref.trim().toLowerCase();
    if (seenRefs.has(key)) issues.push(`Duplicate account column: "${ref}"`);
    seenRefs.add(key);
  }

  const rows: MatrixRow[] = [];
  const seenDates = new Set<string>();
  for (const line of grid.slice(1)) {
    const date = line[0] ?? "";
    if (seenDates.has(date)) issues.push(`Duplicate date: ${date}`);
    seenDates.add(date);
    const cells: MatrixCell[] = [];
    accountRefs.forEach((accountRef, i) => {
      const rawAmount = line[i + 1] ?? "";
      if (rawAmount !== "") cells.push({ accountRef, rawAmount });
    });
    rows.push({ date, cells });
  }
  return { rows, issues };
}

function parseJsonMatrix(content: string): {
  rows: MatrixRow[];
  issues: string[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return { rows: [], issues: [`Invalid JSON: ${String(err)}`] };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    return {
      rows: [],
      issues: ["JSON root must be an object keyed by date"],
    };
  }
  const rows: MatrixRow[] = [];
  for (const [date, value] of Object.entries(parsed)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {
        rows: [],
        issues: [`${date}: value must be an object of account → amount`],
      };
    }
    const cells: MatrixCell[] = Object.entries(value).map(
      ([accountRef, amount]) => ({ accountRef, rawAmount: String(amount) }),
    );
    rows.push({ date, cells });
  }
  return { rows, issues: [] };
}

export function buildDatePlans(
  rows: MatrixRow[],
  accounts: ApiAccount[],
  todayStr: string,
): { plans: DatePlan[]; issues: string[] } {
  const issues: string[] = [];
  const plans: DatePlan[] = [];

  for (const row of rows) {
    if (row.cells.length === 0) continue;
    if (!isDateString(row.date)) {
      issues.push(`${row.date}: invalid date`);
    } else if (row.date > todayStr) {
      issues.push(`${row.date}: future dates are not allowed`);
    }

    const snapshots: DatePlan["snapshots"] = [];
    for (const cell of row.cells) {
      const account = resolveAccountRef(cell.accountRef, accounts);
      if (!account) {
        issues.push(
          `${row.date} / "${cell.accountRef}": unknown account (${accountListHint(accounts)})`,
        );
      }
      let amountMinorRaw: number | undefined;
      try {
        amountMinorRaw = parseMajorAmount(cell.rawAmount);
      } catch (err) {
        issues.push(
          `${row.date} / "${cell.accountRef}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (account && amountMinorRaw !== undefined) {
        snapshots.push({
          financialAccountId: account.id,
          accountName: account.name,
          amountMinorRaw,
        });
      }
    }
    plans.push({ date: row.date, snapshots });
  }

  if (issues.length > 0) return { plans: [], issues };
  plans.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { plans, issues };
}
