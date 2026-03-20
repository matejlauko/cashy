import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { RecurringTransaction } from "./use-recurring-transactions";
import type {
  CreateRecurringTransactionInput,
  UpdateRecurringTransactionInput,
} from "@/schemas/recurring-transactions";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  transactionTypeSchema,
} from "@/schemas/transactions";
import { parseMoneyInput } from "@/lib/money";
import { useAccounts } from "@/client/app/features/accounts/use-accounts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  financialAccountId: z.string().optional(),
  amount: z.string().min(1, "Amount is required"),
  dayOfMonth: z.string().min(1, "Day is required"),
  type: transactionTypeSchema,
});

type FormValues = z.infer<typeof formSchema>;

export interface RecurringTransactionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurringTransaction: RecurringTransaction | null;
  onSubmit: (
    data: CreateRecurringTransactionInput | UpdateRecurringTransactionInput,
  ) => Promise<void>;
  isPending: boolean;
  workspaceId: string;
}

export function RecurringTransactionFormDialog({
  open,
  onOpenChange,
  recurringTransaction,
  onSubmit,
  isPending,
  workspaceId,
}: RecurringTransactionFormDialogProps) {
  const isEdit = recurringTransaction !== null;
  const { data: accounts } = useAccounts(workspaceId);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      financialAccountId: "",
      amount: "",
      dayOfMonth: "",
      type: "expense",
    },
  });

  useEffect(() => {
    if (open) {
      if (recurringTransaction) {
        reset({
          name: recurringTransaction.name,
          financialAccountId: recurringTransaction.financialAccountId ?? "",
          amount: (recurringTransaction.amountMinor / 100).toFixed(2),
          dayOfMonth: String(recurringTransaction.dayOfMonth),
          type: recurringTransaction.type,
        });
      } else {
        reset({
          name: "",
          financialAccountId: "",
          amount: "",
          dayOfMonth: "",
          type: "expense",
        });
      }
    }
  }, [open, recurringTransaction, reset]);

  const currentType = watch("type");
  const currentAccountId = watch("financialAccountId");

  const onFormSubmit = handleSubmit(async (values) => {
    let amountMinor: number;
    try {
      amountMinor = parseMoneyInput(values.amount);
    } catch {
      setError("amount", {
        message: "Enter a valid amount (e.g. 1234.56)",
      });
      return;
    }
    if (amountMinor <= 0) {
      setError("amount", {
        message: "Amount must be positive",
      });
      return;
    }

    const dayOfMonth = parseInt(values.dayOfMonth, 10);
    if (isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      setError("dayOfMonth", {
        message: "Day must be between 1 and 31",
      });
      return;
    }

    try {
      await onSubmit({
        name: values.name,
        financialAccountId: values.financialAccountId || undefined,
        amountMinor,
        dayOfMonth,
        type: values.type,
      });
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error?.code === "RECURRING_ARCHIVED") {
        setError("name", {
          message: error.message ?? "This recurring transaction is archived",
        });
        return;
      }
      throw err;
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Recurring Transaction" : "Add Recurring Transaction"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update recurring transaction details."
              : "Add a regular monthly income or expense."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onFormSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="rt-name">Name</Label>
            <Input
              id="rt-name"
              placeholder="e.g. Rent, Phone bill"
              autoFocus
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-xs text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Account (optional)</Label>
            <Select
              value={currentAccountId || ""}
              onValueChange={(val) =>
                setValue("financialAccountId", val === "__none__" ? "" : val, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No account</SelectItem>
                {accounts?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rt-amount">Amount</Label>
            <div className="relative">
              <Input
                id="rt-amount"
                inputMode="decimal"
                placeholder="0.00"
                className="pr-12"
                {...register("amount")}
                aria-invalid={!!errors.amount}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none">
                CZK
              </span>
            </div>
            {errors.amount && (
              <p className="text-xs text-destructive">
                {errors.amount.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Always enter a positive number. The sign is determined by the
              type.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="rt-day">Day of month</Label>
            <Input
              id="rt-day"
              type="number"
              min={1}
              max={31}
              placeholder="1"
              {...register("dayOfMonth")}
              aria-invalid={!!errors.dayOfMonth}
            />
            {errors.dayOfMonth && (
              <p className="text-xs text-destructive">
                {errors.dayOfMonth.message}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select
              value={currentType}
              onValueChange={(val) =>
                setValue("type", val as FormValues["type"], {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TRANSACTION_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
              {isPending
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Add Recurring"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
