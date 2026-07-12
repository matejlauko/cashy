export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export type ApiAccount = { id: string; name: string; type: string };

export type BulkInput = {
  effectiveDate: string;
  snapshots: { financialAccountId: string; amountMinorRaw: number }[];
};

export type SessionInfo = {
  user: { id: string; name: string; email: string };
  workspaces: { id: string; name: string }[];
  activeWorkspaceId: string;
};

export type DashboardSummary = {
  currentBalance: number;
  monthlyIncomeTotal: number;
  monthlyExpenseTotal: number;
  monthlySpendingTotal: number;
  monthlySpendingExcludingTracked: number;
  lastSnapshotDate: string | null;
  recurringIncomeTotal: number;
  recurringExpenseTotal: number;
  budgetItemsTotal: number;
};

export type DashboardResponse = {
  summary: DashboardSummary;
  isCurrentMonth: boolean;
};

export class CashyClient {
  constructor(
    private apiUrl: string,
    private token?: string,
  ) {}

  private async request<T>(
    method: string,
    apiPath: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.token) {
      throw new ApiError(
        "UNAUTHORIZED",
        "No token configured. Run: bun run cashy auth login",
        401,
      );
    }
    let res: Response;
    try {
      res = await fetch(new URL(apiPath, this.apiUrl), {
        method,
        headers: {
          "x-api-key": this.token,
          ...(body !== undefined
            ? { "content-type": "application/json" }
            : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiError(
        "NETWORK",
        `Cannot reach ${this.apiUrl} — is the server running? (${String(err)})`,
        0,
      );
    }
    if (!res.ok) {
      let code = "INTERNAL";
      let message = `HTTP ${res.status}`;
      let details: unknown;
      try {
        const parsed = (await res.json()) as {
          error?: { code?: string; message?: string; details?: unknown };
          message?: string;
        };
        code = parsed.error?.code ?? code;
        message = parsed.error?.message ?? parsed.message ?? message;
        details = parsed.error?.details;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(code, message, res.status, details);
    }
    return (await res.json()) as T;
  }

  getSession(): Promise<SessionInfo> {
    return this.request("GET", "/api/session");
  }

  async listAccounts(): Promise<ApiAccount[]> {
    const data = await this.request<{ accounts: ApiAccount[] }>(
      "GET",
      "/api/accounts",
    );
    return data.accounts;
  }

  bulkSnapshots(input: BulkInput): Promise<unknown> {
    return this.request("POST", "/api/balance-snapshots/bulk", input);
  }

  getDashboard(month?: string): Promise<DashboardResponse> {
    const q = month ? `?month=${encodeURIComponent(month)}` : "";
    return this.request("GET", `/api/dashboard${q}`);
  }
}

export function exitCodeForError(err: unknown): number {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) return 3;
    if (err.status === 404) return 4;
    if (err.status === 400 || err.code === "VALIDATION_ERROR") return 2;
  }
  return 1;
}
