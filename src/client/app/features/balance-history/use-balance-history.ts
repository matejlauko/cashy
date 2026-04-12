import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/client/rpc";
import type { BalanceHistoryResponse } from "@/schemas/balance-history";

export function useBalanceHistory(workspaceId: string, month: string) {
  return useQuery({
    queryKey: ["balance-history", workspaceId, month],
    queryFn: async (): Promise<BalanceHistoryResponse> => {
      const res = await rpc.api["balance-history"].$get({
        query: { month },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ??
          "Failed to load balance history";
        throw new Error(message);
      }
      return (await res.json()) as BalanceHistoryResponse;
    },
    enabled: !!month,
  });
}
