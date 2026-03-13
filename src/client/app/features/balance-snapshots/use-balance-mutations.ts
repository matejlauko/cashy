import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { rpc } from "@/client/rpc";
import type { BulkBalanceUpdateInput } from "@/schemas/balance-snapshots";

type ApiError = { error: { code: string; message: string } };

async function parseApiError(res: Response): Promise<ApiError["error"]> {
  try {
    const body = (await res.json()) as ApiError;
    if (body.error?.message) return body.error;
  } catch {
    // ignore
  }
  return { code: "UNKNOWN", message: "An unexpected error occurred" };
}

export function useBulkBalanceUpdate(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: BulkBalanceUpdateInput) => {
      const res = await rpc.api["balance-snapshots"].bulk.$post({
        json: data,
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
      toast.success("Balances updated");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
