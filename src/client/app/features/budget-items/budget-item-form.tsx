import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { BudgetItem } from "./use-budget-items";
import type {
  CreateBudgetItemInput,
  UpdateBudgetItemInput,
} from "@/schemas/budget-items";
import { parseMoneyInput } from "@/lib/money";
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

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  amount: z.string().min(1, "Amount is required"),
});

type FormValues = z.infer<typeof formSchema>;

export interface BudgetItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetItem: BudgetItem | null;
  onSubmit: (
    data: CreateBudgetItemInput | UpdateBudgetItemInput,
  ) => Promise<void>;
  isPending: boolean;
}

export function BudgetItemFormDialog({
  open,
  onOpenChange,
  budgetItem,
  onSubmit,
  isPending,
}: BudgetItemFormDialogProps) {
  const isEdit = budgetItem !== null;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      amount: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (budgetItem) {
        reset({
          name: budgetItem.name,
          amount: (budgetItem.amountMinor / 100).toFixed(2),
        });
      } else {
        reset({
          name: "",
          amount: "",
        });
      }
    }
  }, [open, budgetItem, reset]);

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

    await onSubmit({
      name: values.name,
      amountMinor,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Budget Item" : "Add Budget Item"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this budget allocation."
              : "Set aside a monthly amount for a specific purpose."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onFormSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="bi-name">Name</Label>
            <Input
              id="bi-name"
              placeholder="e.g. Investing, Taxes, Emergency fund"
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
            <Label htmlFor="bi-amount">Amount</Label>
            <div className="relative">
              <Input
                id="bi-amount"
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
                  : "Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
