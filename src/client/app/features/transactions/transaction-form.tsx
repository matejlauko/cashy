import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Transaction } from "./use-transactions";
import { useAccounts } from "@/client/app/features/accounts/use-accounts";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
} from "@/schemas/transactions";
import {
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  transactionTypeSchema,
} from "@/schemas/transactions";
import { parseMoneyInput } from "@/lib/money";
import { isDateString, today } from "@/lib/date";
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
  financialAccountId: z.string().min(1, "Account is required"),
  amount: z.string().min(1, "Amount is required"),
  transactionDate: z
    .string()
    .min(1, "Date is required")
    .refine(isDateString, "Enter a valid date")
    .refine((value) => value <= today(), "Future dates are not allowed"),
  type: transactionTypeSchema,
});

type FormValues = z.infer<typeof formSchema>;

export interface TransactionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  onSubmit: (
    data: CreateTransactionInput | UpdateTransactionInput,
  ) => Promise<void>;
  isPending: boolean;
  workspaceId: string;
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  onSubmit,
  isPending,
  workspaceId,
}: TransactionFormDialogProps) {
  const isEdit = transaction !== null;
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
      transactionDate: today(),
      type: "expense",
    },
  });

  useEffect(() => {
    if (open) {
      if (transaction) {
        reset({
          name: transaction.name,
          financialAccountId: transaction.financialAccountId,
          amount: (transaction.amountMinor / 100).toFixed(2),
          transactionDate: transaction.transactionDate,
          type: transaction.type,
        });
      } else {
        reset({
          name: "",
          financialAccountId: "",
          amount: "",
          transactionDate: today(),
          type: "expense",
        });
      }
    }
  }, [open, transaction, reset]);

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

    try {
      await onSubmit({
        name: values.name,
        financialAccountId: values.financialAccountId,
        amountMinor,
        transactionDate: values.transactionDate,
        type: values.type,
      });
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error?.code === "ACCOUNT_NOT_FOUND") {
        setError("financialAccountId", {
          message:
            error.message ?? "Account not found or no longer available",
        });
        return;
      }
      if (error?.code === "INVALID_DATE_RANGE") {
        setError("transactionDate", {
          message: error.message ?? "Future dates are not allowed",
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
            {isEdit ? "Edit Transaction" : "Add Transaction"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update transaction details."
              : "Record a notable income or expense."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onFormSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="tx-name">Name</Label>
            <Input
              id="tx-name"
              placeholder="e.g. March Rent"
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
            <Label>Account</Label>
            <Select
              value={currentAccountId}
              onValueChange={(val) =>
                setValue("financialAccountId", val, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.financialAccountId && (
              <p className="text-xs text-destructive">
                {errors.financialAccountId.message}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tx-amount">Amount</Label>
            <div className="relative">
              <Input
                id="tx-amount"
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
            <Label htmlFor="tx-date">Date</Label>
            <Input
              id="tx-date"
              type="date"
              max={today()}
              {...register("transactionDate")}
              aria-invalid={!!errors.transactionDate}
            />
            {errors.transactionDate && (
              <p className="text-xs text-destructive">
                {errors.transactionDate.message}
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
                  : "Add Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
