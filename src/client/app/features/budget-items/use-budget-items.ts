import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/client/rpc";

export type BudgetItem = {
  id: string;
  name: string;
  amountMinor: number;
  createdAt: string;
  updatedAt: string;
};

export function useBudgetItems(workspaceId: string) {
  return useQuery({
    queryKey: ["budget-items", workspaceId],
    queryFn: async () => {
      const res = await rpc.api["budget-items"].$get();
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ??
          "Failed to load budget items";
        throw new Error(message);
      }
      const data = (await res.json()) as {
        budgetItems: BudgetItem[];
      };
      return data.budgetItems;
    },
  });
}
