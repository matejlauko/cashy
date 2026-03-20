import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { rpc } from "@/client/rpc";
import { parseApiError, type AppError } from "@/client/app/lib/api-error";
import type {
  CreateBudgetItemInput,
  UpdateBudgetItemInput,
} from "@/schemas/budget-items";

export function useCreateBudgetItem(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateBudgetItemInput) => {
      const res = await rpc.api["budget-items"].$post({
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
        queryKey: ["budget-items", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      toast.success("Budget item created");
    },
    onError: (err: AppError) => {
      toast.error(err.message);
    },
  });
}

export function useUpdateBudgetItem(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateBudgetItemInput;
    }) => {
      const res = await rpc.api["budget-items"][":id"].$patch({
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
        queryKey: ["budget-items", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      toast.success("Budget item updated");
    },
    onError: (err: AppError) => {
      toast.error(err.message);
    },
  });
}

export function useDeleteBudgetItem(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await rpc.api["budget-items"][":id"].$delete({
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
        queryKey: ["budget-items", workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", workspaceId],
      });
      toast.success("Budget item deleted");
    },
    onError: (err: AppError) => {
      toast.error(err.message);
    },
  });
}
