import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Account } from "./use-accounts";
import type { CreateAccountInput, UpdateAccountInput } from "@/schemas/accounts";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  accountTypeSchema,
} from "@/schemas/accounts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TriangleAlert } from "lucide-react";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  institutionName: z.string().trim().max(100).optional(),
  type: accountTypeSchema,
  initialBalance: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode, Account = edit mode */
  account: Account | null;
  onSubmit: (data: CreateAccountInput | UpdateAccountInput) => Promise<void>;
  isPending: boolean;
}

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  onSubmit,
  isPending,
}: AccountFormDialogProps) {
  const isEdit = account !== null;

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
      institutionName: "",
      type: "checking",
      initialBalance: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (account) {
        reset({
          name: account.name,
          institutionName: account.institutionName ?? "",
          type: account.type,
        });
      } else {
        reset({
          name: "",
          institutionName: "",
          type: "checking",
          initialBalance: "",
        });
      }
    }
  }, [open, account, reset]);

  const currentType = watch("type");
  const typeChanged = isEdit && account !== null && currentType !== account.type;

  const onFormSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await onSubmit({
          name: values.name,
          institutionName: values.institutionName?.trim() || undefined,
          type: values.type,
        } as UpdateAccountInput);
      } else {
        const balanceStr = values.initialBalance ?? "";
        if (!balanceStr.trim()) {
          setError("initialBalance", {
            message: "Initial balance is required",
          });
          return;
        }
        let initialBalance: number;
        try {
          initialBalance = parseMoneyInput(balanceStr);
        } catch {
          setError("initialBalance", {
            message: "Enter a valid amount (e.g. 1234.56)",
          });
          return;
        }
        await onSubmit({
          name: values.name,
          institutionName: values.institutionName?.trim() || undefined,
          type: values.type,
          initialBalance,
        } as CreateAccountInput);
      }
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error?.code === "ACCOUNT_NAME_TAKEN") {
        setError("name", {
          message: error.message ?? "An account with this name already exists",
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
            {isEdit ? "Edit Account" : "Create Account"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update account details. Balance changes happen through the balance update flow."
              : "Add a new account to start tracking its balance."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onFormSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              placeholder="e.g. Main Checking"
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
            <Label htmlFor="account-institution">
              Bank / Institution{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="account-institution"
              placeholder="e.g. CSOB"
              {...register("institutionName")}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Account Type</Label>
            <Select
              value={currentType}
              onValueChange={(val) =>
                setValue("type", val as FormValues["type"])
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {typeChanged && (
              <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                <span>
                  Changing the account type affects how the balance is
                  displayed. Credit card balances are shown as negative.
                </span>
              </div>
            )}
          </div>

          {!isEdit && (
            <div className="grid gap-1.5">
              <Label htmlFor="account-balance">Initial Balance</Label>
              <div className="relative">
                <Input
                  id="account-balance"
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pr-12"
                  {...register("initialBalance")}
                  aria-invalid={!!errors.initialBalance}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none">
                  CZK
                </span>
              </div>
              {errors.initialBalance && (
                <p className="text-xs text-destructive">
                  {errors.initialBalance.message}
                </p>
              )}
              {currentType === "credit_card" && (
                <p className="text-xs text-muted-foreground">
                  Enter the amount owed as a positive number.
                </p>
              )}
            </div>
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
              {isPending
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
