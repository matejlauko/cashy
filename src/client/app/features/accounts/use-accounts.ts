import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/client/rpc";

export type Account = {
  id: string;
  name: string;
  institutionName: string | null;
  type: "cash" | "checking" | "savings" | "credit_card";
  currentBalance: number;
  createdAt: string;
  updatedAt: string;
};

export function useAccounts(workspaceId: string) {
  return useQuery({
    queryKey: ["accounts", workspaceId],
    queryFn: async () => {
      const res = await rpc.api.accounts.$get();
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ??
          "Failed to load accounts";
        throw new Error(message);
      }
      const data = (await res.json()) as { accounts: Account[] };
      return data.accounts;
    },
  });
}
