import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/client/rpc";

export type Transaction = {
  id: string;
  name: string;
  type: "income" | "expense";
  amountMinor: number;
  signedAmount: number;
  transactionDate: string;
  financialAccountId: string;
  accountName: string;
  createdAt: string;
  updatedAt: string;
};

export function useTransactions(workspaceId: string, month: string) {
  return useQuery({
    queryKey: ["transactions", workspaceId, month],
    queryFn: async () => {
      const res = await rpc.api.transactions.$get({ query: { month } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ??
          "Failed to load transactions";
        throw new Error(message);
      }
      const data = (await res.json()) as { transactions: Transaction[] };
      return data.transactions;
    },
  });
}
