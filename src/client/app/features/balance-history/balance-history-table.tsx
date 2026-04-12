import { cn } from "@/lib/utils";
import { formatMoneyMinor } from "@/lib/money";
import type { BalanceHistoryResponse } from "@/schemas/balance-history";
import { DeltaChip } from "./delta-chip";

type BalanceHistoryTableProps = {
  data: BalanceHistoryResponse;
  onEditRow: (date: string) => void;
};

/**
 * For each row (ordered newest-first), compute the "previous" balance per
 * account by walking older rows. Missing cells carry forward the last known
 * signed balance; accounts with no prior known value at all are excluded
 * from the net-worth sum for that row.
 */
function buildRowViews(data: BalanceHistoryResponse) {
  const accountIds = data.accounts.map((a) => a.id);
  const reversed = [...data.rows].reverse(); // oldest first

  // Carry-forward state seeded with the baseline.
  const lastKnown: Record<string, number | null> = {};
  for (const id of accountIds) {
    lastKnown[id] = data.baseline.balances[id] ?? null;
  }

  const views = reversed.map((row) => {
    const cells: Record<
      string,
      { curr: number | null; prev: number | null }
    > = {};
    for (const id of accountIds) {
      const prev = lastKnown[id];
      const curr = row.balances[id];
      cells[id] = {
        curr: curr !== undefined ? curr : null,
        prev: prev ?? null,
      };
    }

    let rowNet = 0;
    let rowHasAny = false;
    for (const id of accountIds) {
      const curr = row.balances[id];
      const effective = curr !== undefined ? curr : lastKnown[id];
      if (effective !== null && effective !== undefined) {
        rowNet += effective;
        rowHasAny = true;
      }
    }

    for (const id of accountIds) {
      const curr = row.balances[id];
      if (curr !== undefined) lastKnown[id] = curr;
    }

    return {
      date: row.date,
      cells,
      rowNet: rowHasAny ? rowNet : null,
    };
  });

  let baselineNet = 0;
  let baselineHasAny = false;
  for (const id of accountIds) {
    const v = data.baseline.balances[id];
    if (v !== undefined) {
      baselineNet += v;
      baselineHasAny = true;
    }
  }

  const netPrev: (number | null)[] = [];
  for (let i = 0; i < views.length; i++) {
    if (i === 0) {
      netPrev.push(baselineHasAny ? baselineNet : null);
    } else {
      netPrev.push(views[i - 1]!.rowNet);
    }
  }

  const displayRows = views
    .map((v, i) => ({
      date: v.date,
      cells: v.cells,
      rowNet: v.rowNet,
      rowNetPrev: netPrev[i] ?? null,
    }))
    .reverse();

  const newest = views[views.length - 1];
  const monthChange =
    newest && newest.rowNet !== null && baselineHasAny
      ? newest.rowNet - baselineNet
      : null;

  return { displayRows, baselineNet: baselineHasAny ? baselineNet : null, monthChange };
}

export function BalanceHistoryTable({ data, onEditRow }: BalanceHistoryTableProps) {
  const { displayRows, monthChange } = buildRowViews(data);

  if (displayRows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium">
              Date
            </th>
            {data.accounts.map((account) => (
              <th
                key={account.id}
                className={cn(
                  "px-3 py-2 text-right font-medium",
                  account.archivedAt && "text-muted-foreground",
                )}
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>{account.name}</span>
                  {account.archivedAt && (
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      archived
                    </span>
                  )}
                </div>
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Net worth</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, rowIdx) => (
            <tr
              key={row.date}
              onClick={() => onEditRow(row.date)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEditRow(row.date);
                }
              }}
              tabIndex={0}
              role="button"
              className={cn(
                "cursor-pointer border-t outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/60",
                rowIdx % 2 === 1 && "bg-muted/20",
              )}
            >
              <td className="sticky left-0 z-10 bg-inherit px-3 py-2 font-mono text-xs">
                {row.date}
              </td>
              {data.accounts.map((account) => {
                const cell = row.cells[account.id]!;
                return (
                  <td
                    key={account.id}
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      account.archivedAt && "text-muted-foreground",
                    )}
                  >
                    {cell.curr === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <span>{formatMoneyMinor(cell.curr)}</span>
                        <DeltaChip
                          prev={cell.prev}
                          curr={cell.curr}
                          accountType={account.type}
                        />
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2 text-right tabular-nums font-medium">
                {row.rowNet === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-col items-end gap-0.5">
                    <span>{formatMoneyMinor(row.rowNet)}</span>
                    <DeltaChip
                      prev={row.rowNetPrev}
                      curr={row.rowNet}
                      accountType="checking"
                    />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        {monthChange !== null && (
          <tfoot>
            <tr className="border-t bg-muted/40">
              <td
                className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground"
                colSpan={data.accounts.length + 1}
              >
                Change this month
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <span
                  className={cn(
                    "font-medium",
                    monthChange > 0 && "text-emerald-600 dark:text-emerald-400",
                    monthChange < 0 && "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {monthChange > 0 ? "+" : ""}
                  {formatMoneyMinor(monthChange)}
                </span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
