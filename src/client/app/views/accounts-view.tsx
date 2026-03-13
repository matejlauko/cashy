import { useState } from "react";
import {
  useAccounts,
  type Account,
} from "@/client/app/features/accounts/use-accounts";
import {
  useCreateAccount,
  useUpdateAccount,
  useArchiveAccount,
} from "@/client/app/features/accounts/use-account-mutations";
import { AccountFormDialog } from "@/client/app/features/accounts/account-form";
import { ArchiveConfirmDialog } from "@/client/app/features/accounts/archive-confirm";
import type {
  CreateAccountInput,
  UpdateAccountInput,
} from "@/schemas/accounts";
import { ACCOUNT_TYPE_LABELS } from "@/schemas/accounts";
import { formatMoneyMinor } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Archive, Wallet } from "lucide-react";

interface AccountsViewProps {
  workspaceId: string;
}

export function AccountsView({ workspaceId }: AccountsViewProps) {
  const { data: accounts, isLoading, isError, error } = useAccounts(workspaceId);

  const createMutation = useCreateAccount(workspaceId);
  const updateMutation = useUpdateAccount(workspaceId);
  const archiveMutation = useArchiveAccount(workspaceId);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivingAccount, setArchivingAccount] = useState<Account | null>(
    null,
  );

  const handleCreate = () => {
    setEditingAccount(null);
    setFormOpen(true);
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormOpen(true);
  };

  const handleArchiveIntent = (account: Account) => {
    setArchivingAccount(account);
    setArchiveOpen(true);
  };

  const handleFormSubmit = async (
    data: CreateAccountInput | UpdateAccountInput,
  ) => {
    if (editingAccount) {
      await updateMutation.mutateAsync({
        id: editingAccount.id,
        data: data as UpdateAccountInput,
      });
    } else {
      await createMutation.mutateAsync(data as CreateAccountInput);
    }
    setFormOpen(false);
  };

  const handleArchiveConfirm = () => {
    if (!archivingAccount) return;
    archiveMutation.mutate(archivingAccount.id, {
      onSuccess: () => {
        setArchiveOpen(false);
        setArchivingAccount(null);
      },
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Loading accounts...
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load accounts"}
        </div>
      </div>
    );
  }

  const hasAccounts = accounts && accounts.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Accounts</h1>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="size-4" />
          Create Account
        </Button>
      </div>

      {!hasAccounts ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <Wallet className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No accounts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first account to start tracking.
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="size-4" />
            Create Account
          </Button>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{account.name}</span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {ACCOUNT_TYPE_LABELS[account.type]}
                  </span>
                </div>
                {account.institutionName && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {account.institutionName}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span
                  className={cn(
                    "mr-1 text-sm font-medium tabular-nums",
                    account.currentBalance < 0 && "text-destructive",
                  )}
                >
                  {formatMoneyMinor(account.currentBalance)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleEdit(account)}
                  aria-label={`Edit ${account.name}`}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleArchiveIntent(account)}
                  aria-label={`Archive ${account.name}`}
                >
                  <Archive className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editingAccount}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />
      <ArchiveConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        account={archivingAccount}
        onConfirm={handleArchiveConfirm}
        isPending={archiveMutation.isPending}
      />
    </div>
  );
}
