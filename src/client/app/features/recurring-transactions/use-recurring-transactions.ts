import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/client/rpc";

export type RecurringTransaction = {
  id: string;
  name: string;
  financialAccountId: string | null;
  type: "income" | "expense";
  amountMinor: number;
  signedAmount: number;
  dayOfMonth: number;
  createdAt: string;
  updatedAt: string;
};

export function useRecurringTransactions(workspaceId: string) {
  return useQuery({
    queryKey: ["recurring-transactions", workspaceId],
    queryFn: async () => {
      const res = await rpc.api["recurring-transactions"].$get();
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ??
          "Failed to load recurring transactions";
        throw new Error(message);
      }
      const data = (await res.json()) as {
        recurringTransactions: RecurringTransaction[];
      };
      return data.recurringTransactions;
    },
  });
}
