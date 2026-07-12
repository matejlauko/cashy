import type { Command } from "commander";
import { makeClient, fail } from "../index";
import { formatMinor } from "../lib/amounts";
import { today } from "@/lib/date";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${name} ${y}`;
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show dashboard stats")
    .option("--month <YYYY-MM>", "month to show (default: current)")
    .action(async (opts: { month?: string }) => {
      try {
        if (opts.month && !MONTH_RE.test(opts.month)) {
          console.error(`Invalid --month "${opts.month}" (expected YYYY-MM)`);
          process.exit(2);
        }
        const client = await makeClient(program);
        const data = await client.getDashboard(opts.month);
        if (program.opts().json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        const s = data.summary;
        const availableToSpend =
          s.recurringIncomeTotal - s.recurringExpenseTotal - s.budgetItemsTotal;
        const budgetLeft = availableToSpend - s.monthlySpendingExcludingTracked;
        const monthKey = opts.month ?? today().slice(0, 7);

        const line = (label: string, minor: number, note = "") =>
          console.log(
            `${label.padEnd(20)}${formatMinor(minor).padStart(14)}${note ? `     ${note}` : ""}`,
          );

        console.log(
          `Cashy — ${monthLabel(monthKey)} (as of ${today()}, last snapshot ${s.lastSnapshotDate ?? "never"})`,
        );
        console.log();
        line("Current balance", s.currentBalance);
        line("Monthly spending", s.monthlySpendingTotal);
        line("Everyday spending", s.monthlySpendingExcludingTracked, "(excluding tracked)");
        line("Tracked income", s.recurringIncomeTotal);
        line("Tracked expenses", s.recurringExpenseTotal);
        line(
          "Budget left",
          budgetLeft,
          `(of ${formatMinor(availableToSpend)} available)${budgetLeft < 0 ? "  ⚠ over budget" : ""}`,
        );
      } catch (err) {
        fail(err);
      }
    });
}
