import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { rpc } from "@/client/rpc";
import type { CreateAccountInput, UpdateAccountInput } from "@/schemas/accounts";

type ApiError = { error: { code: string; message: string } };
type AppError = Error & { code?: string };

async function parseApiError(res: Response): Promise<ApiError["error"]> {
  try {
    const body = (await res.json()) as ApiError;
    if (body.error?.message) return body.error;
  } catch {
    // ignore
  }
  return { code: "UNKNOWN", message: "An unexpected error occurred" };
}

export function useCreateAccount(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAccountInput) => {
      const res = await rpc.api.accounts.$post({ json: data });
      if (!res.ok) {
        const err = await parseApiError(res);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["balance-prefill", workspaceId],
      });
      toast.success("Account created");
    },
    onError: (err: AppError) => {
      // Handled inline by the form as a field-level validation error.
      if (err.code === "ACCOUNT_NAME_TAKEN") {
        return;
      }
      toast.error(err.message);
    },
  });
}

export function useUpdateAccount(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateAccountInput;
    }) => {
      const res = await fetch(`/api/accounts/${id}`, {
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
      queryClient.invalidateQueries({ queryKey: ["accounts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["balance-prefill", workspaceId],
      });
      toast.success("Account updated");
    },
    onError: (err: AppError) => {
      // Handled inline by the form as a field-level validation error.
      if (err.code === "ACCOUNT_NAME_TAKEN") {
        return;
      }
      toast.error(err.message);
    },
  });
}

export function useArchiveAccount(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await rpc.api.accounts[":id"].archive.$post({
        param: { id },
      });
      if (!res.ok) {
        const err = await parseApiError(res);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["balance-prefill", workspaceId],
      });
      toast.success("Account archived");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
