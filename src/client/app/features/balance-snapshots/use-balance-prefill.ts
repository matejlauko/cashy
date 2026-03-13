import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/client/rpc";

export type PrefillAccount = {
  financialAccountId: string;
  accountName: string;
  accountType: "cash" | "checking" | "savings" | "credit_card";
  amountMinorRaw: number;
};

export function useBalancePrefill(workspaceId: string, date: string) {
  return useQuery({
    queryKey: ["balance-prefill", workspaceId, date],
    queryFn: async () => {
      const res = await rpc.api["balance-snapshots"].prefill.$get({
        query: { date },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ??
          "Failed to load prefill data";
        throw new Error(message);
      }
      const data = (await res.json()) as { prefill: PrefillAccount[] };
      return data.prefill;
    },
    enabled: !!date,
  });
}
