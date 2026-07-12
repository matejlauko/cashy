import path from "node:path";
import type { Command } from "commander";
import { makeClient, fail } from "../index";
import { ApiError } from "../client";
import { parseImportFile, buildDatePlans } from "../lib/import-matrix";
import { formatMinor } from "../lib/amounts";
import { today } from "@/lib/date";

export function registerImportCommand(program: Command): void {
  program
    .command("import")
    .description("Bulk import balances from a CSV or JSON matrix file")
    .argument("<file>", "path to .csv or .json file")
    .action(async (file: string) => {
      try {
        const bunFile = Bun.file(file);
        if (!(await bunFile.exists())) {
          console.error(`File not found: ${file}`);
          process.exit(2);
        }
        const content = await bunFile.text();

        const { rows, issues: parseIssues } = parseImportFile(
          path.basename(file),
          content,
        );
        const client = await makeClient(program);
        const accounts = await client.listAccounts();
        const { plans, issues: planIssues } = buildDatePlans(
          rows,
          accounts,
          today(),
        );
        const issues = [...parseIssues, ...planIssues];
        if (issues.length > 0) {
          console.error(`${issues.length} issue(s) — nothing was written:`);
          for (const issue of issues) console.error(`  ${issue}`);
          process.exit(2);
        }
        if (plans.length === 0) {
          console.log("Nothing to import.");
          return;
        }

        const applied: string[] = [];
        for (const plan of plans) {
          try {
            await client.bulkSnapshots({
              effectiveDate: plan.date,
              snapshots: plan.snapshots.map(
                ({ financialAccountId, amountMinorRaw }) => ({
                  financialAccountId,
                  amountMinorRaw,
                }),
              ),
            });
          } catch (err) {
            console.error(
              `\nFailed at ${plan.date}: ${err instanceof ApiError ? `${err.code}: ${err.message}` : String(err)}`,
            );
            if (applied.length > 0) {
              console.error(`Applied: ${applied.join(", ")}`);
            }
            const remaining = plans
              .slice(plans.indexOf(plan))
              .map((p) => p.date);
            console.error(`Not applied: ${remaining.join(", ")}`);
            console.error("Re-running the same file is safe (writes upsert).");
            process.exit(1);
          }
          applied.push(plan.date);
          console.log(
            `${plan.date}: ${plan.snapshots
              .map((s) => `${s.accountName} ${formatMinor(s.amountMinorRaw)}`)
              .join(", ")}`,
          );
        }
        console.log(`\nImported ${applied.length} date(s).`);
      } catch (err) {
        fail(err);
      }
    });
}
