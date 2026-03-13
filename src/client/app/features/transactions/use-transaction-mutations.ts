import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { rpc } from "@/client/rpc";
import { parseApiError, type AppError } from "@/client/app/lib/api-error";
import { currentMonthStart } from "@/lib/date";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
} from "@/schemas/transactions";

export function useCreateTransaction(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateTransactionInput) => {
      const res = await rpc.api.transactions.$post({ json: data });
      if (!res.ok) {
        const err = await parseApiError(res);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return res.json();
    },
    onSuccess: () => {
      const monthStart = currentMonthStart();
      queryClient.invalidateQueries({
        queryKey: ["transactions", workspaceId, monthStart],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      toast.success("Transaction created");
    },
    onError: (err: AppError) => {
      // ACCOUNT_NOT_FOUND handled inline by the form
      if (err.code === "ACCOUNT_NOT_FOUND") {
        return;
      }
      toast.error(err.message);
    },
  });
}

export function useUpdateTransaction(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateTransactionInput;
    }) => {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await parseApiError(res);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return res.json();
    },
    onSuccess: () => {
      const monthStart = currentMonthStart();
      queryClient.invalidateQueries({
        queryKey: ["transactions", workspaceId, monthStart],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      toast.success("Transaction updated");
    },
    onError: (err: AppError) => {
      if (err.code === "ACCOUNT_NOT_FOUND") {
        return;
      }
      toast.error(err.message);
    },
  });
}

export function useSoftDeleteTransaction(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await rpc.api.transactions[":id"].delete.$post({
        param: { id },
      });
      if (!res.ok) {
        const err = await parseApiError(res);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return res.json();
    },
    onSuccess: () => {
      const monthStart = currentMonthStart();
      queryClient.invalidateQueries({
        queryKey: ["transactions", workspaceId, monthStart],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      toast.success("Transaction deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
