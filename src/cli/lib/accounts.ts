import type { ApiAccount } from "../client";

/** Resolve an account reference (exact id, else case-insensitive name). */
export function resolveAccountRef(
  ref: string,
  accounts: ApiAccount[],
): ApiAccount | undefined {
  const byId = accounts.find((a) => a.id === ref);
  if (byId) return byId;
  const needle = ref.trim().toLowerCase();
  return accounts.find((a) => a.name.trim().toLowerCase() === needle);
}

export function accountListHint(accounts: ApiAccount[]): string {
  return `Valid accounts: ${accounts.map((a) => a.name).join(", ")}`;
}
