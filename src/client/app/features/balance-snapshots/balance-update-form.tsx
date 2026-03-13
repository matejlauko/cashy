import { useState, useEffect } from "react";
import { today } from "@/lib/date";
import { parseMoneyInput } from "@/lib/money";
import { useBalancePrefill } from "./use-balance-prefill";
import { useBulkBalanceUpdate } from "./use-balance-mutations";
import type { BulkBalanceUpdateInput } from "@/schemas/balance-snapshots";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Wallet } from "lucide-react";

interface BalanceUpdateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onCreateAccount?: () => void;
}

export function BalanceUpdateFormDialog({
  open,
  onOpenChange,
  workspaceId,
  onCreateAccount,
}: BalanceUpdateFormDialogProps) {
  const [date, setDate] = useState(today());
  const prefillQuery = useBalancePrefill(workspaceId, date);
  const bulkMutation = useBulkBalanceUpdate(workspaceId);

  // Form values keyed by account id
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Sync prefill data into form values when it loads
  useEffect(() => {
    if (prefillQuery.data) {
      const initial: Record<string, string> = {};
      for (const account of prefillQuery.data) {
        initial[account.financialAccountId] = (
          account.amountMinorRaw / 100
        ).toFixed(2);
      }
      setValues(initial);
    }
  }, [prefillQuery.data]);

  // Reset form state when dialog opens
  useEffect(() => {
    if (open) {
      setDate(today());
      setFormError(null);
    }
  }, [open]);

  const handleValueChange = (accountId: string, value: string) => {
    setValues((prev) => ({ ...prev, [accountId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!prefillQuery.data?.length) return;

    // Parse all inputs
    const snapshots: BulkBalanceUpdateInput["snapshots"] = [];
    for (const account of prefillQuery.data) {
      const raw = values[account.financialAccountId] ?? "";
      let amountMinorRaw: number;
      try {
        amountMinorRaw = parseMoneyInput(raw || "0");
      } catch {
        setFormError(
          `Invalid amount for ${account.accountName}. Use a number like 1234.56`,
        );
        return;
      }
      snapshots.push({
        financialAccountId: account.financialAccountId,
        amountMinorRaw,
      });
    }

    const payload: BulkBalanceUpdateInput = {
      effectiveDate: date,
      snapshots,
    };

    try {
      await bulkMutation.mutateAsync(payload);
      onOpenChange(false);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error?.code === "INVALID_DATE_RANGE") {
        setFormError(error.message ?? "Invalid date. Future dates are not allowed.");
      } else if (error?.code === "SNAPSHOT_ACCOUNT_MISMATCH") {
        setFormError(
          error.message ??
            "Account mismatch. Please close and reopen the form.",
        );
      }
      // Other errors are handled by the mutation hook's onError (toast)
    }
  };

  const accounts = prefillQuery.data;
  const hasAccounts = accounts && accounts.length > 0;
  const isPending = bulkMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Balances</DialogTitle>
          <DialogDescription>
            Enter current balances for all active accounts.
          </DialogDescription>
        </DialogHeader>

        {prefillQuery.isPending ? (
          <div className="space-y-4 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-9 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : !hasAccounts ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="rounded-full bg-muted p-3">
              <Wallet className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No active accounts</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create an account first to start tracking balances.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onCreateAccount?.();
              }}
            >
              Create Account
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="balance-date">Date</Label>
              <Input
                id="balance-date"
                type="date"
                max={today()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
            <div className="grid gap-3">
              {accounts.map((account) => {
                const isCreditCard = account.accountType === "credit_card";
                return (
                  <div key={account.financialAccountId} className="grid gap-1.5">
                    <Label htmlFor={`bal-${account.financialAccountId}`}>
                      <span className="flex items-center gap-1.5">
                        {isCreditCard && (
                          <CreditCard className="size-3.5 text-muted-foreground" />
                        )}
                        {account.accountName}
                      </span>
                    </Label>
                    <div className="relative">
                      <Input
                        id={`bal-${account.financialAccountId}`}
                        inputMode="decimal"
                        placeholder="0.00"
                        className="pr-12"
                        value={values[account.financialAccountId] ?? ""}
                        onChange={(e) =>
                          handleValueChange(
                            account.financialAccountId,
                            e.target.value,
                          )
                        }
                        disabled={isPending}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none">
                        CZK
                      </span>
                    </div>
                    {isCreditCard && (
                      <p className="text-xs text-muted-foreground">
                        Enter the amount owed as a positive number.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            </div>

            {formError && (
              <p className="text-xs text-destructive">{formError}</p>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Balances"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
