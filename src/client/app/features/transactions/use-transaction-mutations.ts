import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { rpc } from "@/client/rpc";
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
} from "@/schemas/transactions";

type ApiError = { error: { code: string; message: string } };
type AppError = Error & { code?: string };

async function parseApiError(res: Response): Promise<ApiError["error"]> {
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string };
      message?: string;
    };
    if (body.error?.message) {
      return {
        code: body.error.code ?? `HTTP_${res.status}`,
        message: body.error.message,
      };
    }
    if (typeof body.message === "string" && body.message.trim().length > 0) {
      return { code: `HTTP_${res.status}`, message: body.message };
    }
  } catch {
    // ignore
  }
  return { code: "UNKNOWN", message: "An unexpected error occurred" };
}

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
      queryClient.invalidateQueries({
        queryKey: ["transactions", workspaceId],
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
      queryClient.invalidateQueries({
        queryKey: ["transactions", workspaceId],
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
      queryClient.invalidateQueries({
        queryKey: ["transactions", workspaceId],
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
