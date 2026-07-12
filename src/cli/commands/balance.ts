import type { Command } from "commander";
import { makeClient, fail } from "../index";
import { parseMajorAmount, formatMinor } from "../lib/amounts";
import { resolveAccountRef, accountListHint } from "../lib/accounts";
import { mergeWithPrefill } from "../lib/prefill";
import { today, isDateString } from "@/lib/date";

export function registerBalanceCommands(program: Command): void {
  const balance = program
    .command("balance")
    .description("Balance snapshot operations");

  balance
    .command("set")
    .description("Set balances: cashy balance set Checking=1234.56 [...]")
    .argument("<pairs...>", "Account=amount pairs (account name or id)")
    .option("--date <YYYY-MM-DD>", "effective date (default: today)")
    .action(async (pairs: string[], opts: { date?: string }) => {
      try {
        const effectiveDate = opts.date ?? today();
        if (!isDateString(effectiveDate) || effectiveDate > today()) {
          console.error(
            `Invalid --date "${effectiveDate}" (expected YYYY-MM-DD, not in the future)`,
          );
          process.exit(2);
        }

        const client = await makeClient(program);
        const accounts = await client.listAccounts();

        const issues: string[] = [];
        const snapshots: {
          financialAccountId: string;
          accountName: string;
          amountMinorRaw: number;
        }[] = [];
        const seen = new Set<string>();

        for (const pair of pairs) {
          const eq = pair.lastIndexOf("=");
          if (eq === -1) {
            issues.push(`"${pair}": expected Account=amount`);
            continue;
          }
          const ref = pair.slice(0, eq);
          const rawAmount = pair.slice(eq + 1);
          const account = resolveAccountRef(ref, accounts);
          if (!account) {
            issues.push(`"${ref}": unknown account (${accountListHint(accounts)})`);
            continue;
          }
          if (seen.has(account.id)) {
            issues.push(`"${ref}": account appears more than once`);
            continue;
          }
          seen.add(account.id);
          try {
            snapshots.push({
              financialAccountId: account.id,
              accountName: account.name,
              amountMinorRaw: parseMajorAmount(rawAmount),
            });
          } catch (err) {
            issues.push(
              `"${ref}": ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        if (issues.length > 0) {
          for (const issue of issues) console.error(issue);
          process.exit(2);
        }

        const prefill = await client.getPrefill(effectiveDate);
        const merged = mergeWithPrefill(snapshots, prefill);

        const result = await client.bulkSnapshots({
          effectiveDate,
          snapshots: merged.snapshots.map(
            ({ financialAccountId, amountMinorRaw }) => ({
              financialAccountId,
              amountMinorRaw,
            }),
          ),
        });

        if (program.opts().json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        for (const snap of snapshots) {
          console.log(
            `${snap.accountName}: ${formatMinor(snap.amountMinorRaw)} @ ${effectiveDate}`,
          );
        }
        if (merged.carriedForward.length > 0) {
          console.log(
            `(${merged.carriedForward.length} account(s) carried forward at existing balances)`,
          );
        }
      } catch (err) {
        fail(err);
      }
    });
}
