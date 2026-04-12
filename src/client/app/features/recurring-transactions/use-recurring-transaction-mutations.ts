import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { rpc } from "@/client/rpc";
import { parseApiError, type AppError } from "@/client/app/lib/api-error";
import { currentMonthStart } from "@/lib/date";
import { formatMoneyMinor } from "@/lib/money";
import type {
  CreateRecurringTransactionInput,
  UpdateRecurringTransactionInput,
} from "@/schemas/recurring-transactions";

export function useCreateRecurringTransaction(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRecurringTransactionInput) => {
      const res = await rpc.api["recurring-transactions"].$post({
        json: data,
      });
      if (!res.ok) {
        const err = await parseApiError(res);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["recurring-transactions", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      toast.success("Recurring transaction created");
    },
    onError: (err: AppError) => {
      toast.error(err.message);
    },
  });
}

export function useUpdateRecurringTransaction(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateRecurringTransactionInput;
    }) => {
      const res = await rpc.api["recurring-transactions"][":id"].$patch({
        param: { id },
        // @ts-expect-error - Hono RPC partial type mismatch
        json: data,
      });
      if (!res.ok) {
        const err = await parseApiError(res);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["recurring-transactions", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      toast.success("Recurring transaction updated");
    },
    onError: (err: AppError) => {
      toast.error(err.message);
    },
  });
}

export function useArchiveRecurringTransaction(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await rpc.api["recurring-transactions"][":id"].archive.$post({
        param: { id },
      });
      if (!res.ok) {
        const err = await parseApiError(res);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["recurring-transactions", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      toast.success("Recurring transaction archived");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useAddRecurringToTransactions(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recurringId: string) => {
      const res = await rpc.api.transactions["from-recurring"][":id"].$post({
        param: { id: recurringId },
      });
      if (!res.ok) {
        const err = await parseApiError(res);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return res.json();
    },
    onSuccess: (data) => {
      const monthStart = currentMonthStart();
      queryClient.invalidateQueries({
        queryKey: ["transactions", workspaceId, monthStart],
      });
      queryClient.invalidateQueries({
        queryKey: ["recurring-transactions", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      const t = (data as { transaction: { name: string; amountMinor: number } }).transaction;
      toast.success(`Added ${t.name} — ${formatMoneyMinor(t.amountMinor)}`);
    },
    onError: (err: AppError) => {
      if (err.code === "ALREADY_ADDED") {
        queryClient.invalidateQueries({
          queryKey: ["recurring-transactions", workspaceId],
        });
        toast.message("Already added this month");
        return;
      }
      toast.error(err.message);
    },
  });
}
