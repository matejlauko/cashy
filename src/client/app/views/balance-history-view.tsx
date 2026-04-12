import { useState } from "react";
import { currentMonthKey } from "@/lib/date";
import { MonthNavigator } from "@/client/app/features/shared/month-navigator";
import { useBalanceHistory } from "@/client/app/features/balance-history/use-balance-history";
import { BalanceHistoryTable } from "@/client/app/features/balance-history/balance-history-table";
import { BalanceUpdateFormDialog } from "@/client/app/features/balance-snapshots/balance-update-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

type BalanceHistoryViewProps = {
  workspaceId: string;
  onNavigate?: (section: "accounts") => void;
};

export function BalanceHistoryView({
  workspaceId,
  onNavigate,
}: BalanceHistoryViewProps) {
  const [month, setMonth] = useState(currentMonthKey());
  const [editDate, setEditDate] = useState<string | null>(null);
  const [newDateOpen, setNewDateOpen] = useState(false);

  const query = useBalanceHistory(workspaceId, month);

  const handleEditRow = (date: string) => setEditDate(date);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Balance history</h1>
          <p className="text-sm text-muted-foreground">
            Month-by-month ledger of balance snapshots. Click a row to edit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthNavigator month={month} onChange={setMonth} />
          <Button size="sm" onClick={() => setNewDateOpen(true)}>
            <Plus className="size-4" />
            Update balances
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      ) : query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load balance history</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {query.error instanceof Error
                ? query.error.message
                : "Unknown error"}
            </p>
          </CardContent>
        </Card>
      ) : query.data && query.data.rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No balance updates this month</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setNewDateOpen(true)}>
              <Plus className="size-4" />
              Update balances
            </Button>
          </CardContent>
        </Card>
      ) : query.data ? (
        <BalanceHistoryTable data={query.data} onEditRow={handleEditRow} />
      ) : null}

      {/* Edit-mode dialog (locked to a specific date) */}
      <BalanceUpdateFormDialog
        open={editDate !== null}
        onOpenChange={(open) => {
          if (!open) setEditDate(null);
        }}
        workspaceId={workspaceId}
        initialDate={editDate ?? undefined}
        onCreateAccount={() => onNavigate?.("accounts")}
      />

      {/* Create-new-date dialog (today by default) */}
      <BalanceUpdateFormDialog
        open={newDateOpen}
        onOpenChange={setNewDateOpen}
        workspaceId={workspaceId}
        onCreateAccount={() => onNavigate?.("accounts")}
      />
    </div>
  );
}
