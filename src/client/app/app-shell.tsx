import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "@/client/rpc";
import { authClient } from "@/client/auth-client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  LogOut,
  LayoutDashboard,
  Wallet,
  History,
  ArrowLeftRight,
  Repeat,
  PiggyBank,
} from "lucide-react";
import { DashboardView } from "./views/dashboard-view";
import { AccountsView } from "./views/accounts-view";
import { TransactionsView } from "./views/transactions-view";
import { RecurringView } from "./views/recurring-view";
import { BudgetView } from "./views/budget-view";
import { BalanceHistoryView } from "./views/balance-history-view";

type Section = "dashboard" | "accounts" | "balance-history" | "transactions" | "recurring" | "budget";
type SessionBootstrap = {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  workspaces: Array<{ id: string; name: string }>;
  activeWorkspaceId: string;
};
type ApiErrorPayload = { error?: { message?: string } };

const sections: { id: Section; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "accounts", label: "Accounts" },
  { id: "balance-history", label: "Balance history" },
  { id: "transactions", label: "Transactions" },
  { id: "recurring", label: "Recurring" },
  { id: "budget", label: "Budget" },
];

const navIcons = {
  dashboard: LayoutDashboard,
  accounts: Wallet,
  "balance-history": History,
  transactions: ArrowLeftRight,
  recurring: Repeat,
  budget: PiggyBank,
} as const;

class SessionBootstrapError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SessionBootstrapError";
    this.status = status;
  }
}

async function getErrorMessage(
  res: { json(): Promise<unknown> },
  fallback: string,
) {
  try {
    const body = (await res.json()) as ApiErrorPayload;
    const message = body.error?.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  } catch {
    // Ignore invalid JSON and use fallback message.
  }
  return fallback;
}

export function AppShell() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [focusTransactionId, setFocusTransactionId] = useState<string | null>(
    null,
  );
  const [workspaceSwitchError, setWorkspaceSwitchError] = useState<
    string | null
  >(null);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: session,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<SessionBootstrap, SessionBootstrapError>({
    queryKey: ["session"],
    queryFn: async () => {
      const res = await rpc.api.session.$get();
      if (!res.ok) {
        const fallback =
          res.status === 401
            ? "Not authenticated."
            : res.status === 403
              ? "No workspace access was found for this account."
              : "Failed to load session bootstrap.";
        const message = await getErrorMessage(res, fallback);
        throw new SessionBootstrapError(res.status, message);
      }
      return (await res.json()) as SessionBootstrap;
    },
    retry: false,
  });

  const shouldRedirectToLogin =
    isError && error instanceof SessionBootstrapError && error.status === 401;

  useEffect(() => {
    if (shouldRedirectToLogin) {
      window.location.replace("/login");
    }
  }, [shouldRedirectToLogin]);

  if (isLoading || shouldRedirectToLogin) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="text-muted-foreground animate-pulse">
          {shouldRedirectToLogin ? "Redirecting to login..." : "Loading..."}
        </div>
      </div>
    );
  }

  if (isError || !session) {
    const isWorkspaceBootstrapError =
      error instanceof SessionBootstrapError && error.status === 403;
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-lg border p-6 text-center">
          <h1 className="text-lg font-semibold">
            {isWorkspaceBootstrapError
              ? "Workspace setup required"
              : "App bootstrap failed"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {error instanceof Error
              ? error.message
              : "The shell could not load your session context."}
          </p>
          <div className="flex gap-2">
            <Button onClick={() => refetch()}>Retry</Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await authClient.signOut();
                } finally {
                  window.location.replace("/login");
                }
              }}
            >
              Go to login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const activeWorkspace = session.workspaces.find(
    (w) => w.id === session.activeWorkspaceId,
  );
  const userLabel = session.user.name ?? session.user.email ?? session.user.id;

  if (session.workspaces.length === 0 || !activeWorkspace) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-lg border p-6 text-center">
          <h1 className="text-lg font-semibold">Workspace unavailable</h1>
          <p className="text-muted-foreground text-sm">
            A valid active workspace could not be resolved for your account.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => refetch()}>Reload</Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await authClient.signOut();
                } finally {
                  window.location.replace("/login");
                }
              }}
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await authClient.signOut();
    } finally {
      window.location.replace("/login");
    }
  };

  const handleWorkspaceChange = async (workspaceId: string) => {
    if (workspaceId === session.activeWorkspaceId) {
      return;
    }

    setWorkspaceSwitchError(null);
    setIsSwitchingWorkspace(true);

    try {
      const res = await rpc.api.workspaces["set-active"].$post({
        json: { workspaceId },
      });

      if (!res.ok) {
        const fallback =
          res.status === 401
            ? "Your session has expired."
            : "Failed to switch workspace.";
        const message = await getErrorMessage(res, fallback);
        throw new SessionBootstrapError(res.status, message);
      }

      // Clear all workspace-scoped queries for the old workspace.
      // Convention: workspace-scoped keys use [resourceName, workspaceId, ...rest].
      const oldWorkspaceId = session.activeWorkspaceId;
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) && key.length >= 2 && key[1] === oldWorkspaceId
          );
        },
      });

      await queryClient.refetchQueries({ queryKey: ["session"] });
      setFocusTransactionId(null);
    } catch (switchError) {
      if (
        switchError instanceof SessionBootstrapError &&
        switchError.status === 401
      ) {
        window.location.replace("/login");
        return;
      }

      const message =
        switchError instanceof Error
          ? switchError.message
          : "Failed to switch workspace.";
      setWorkspaceSwitchError(message);
    } finally {
      setIsSwitchingWorkspace(false);
    }
  };

  const handleSectionChange = (section: Section) => {
    setActiveSection(section);
    if (section !== "transactions") {
      setFocusTransactionId(null);
    }
  };

  const handleDashboardEditTransaction = (transactionId: string) => {
    setFocusTransactionId(transactionId);
    setActiveSection("transactions");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold tracking-tight">
              Cashy
            </span>
            <span className="text-muted-foreground/40">·</span>
            {session.workspaces.length > 1 ? (
              <Select
                value={session.activeWorkspaceId}
                onValueChange={handleWorkspaceChange}
                disabled={isSwitchingWorkspace}
              >
                <SelectTrigger className="h-8 w-auto gap-1 border-none bg-transparent px-2 text-sm font-medium shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {session.workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">
                {activeWorkspace.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
              title={userLabel}
            >
              {userLabel
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleLogout}
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </div>
        <nav className="container mx-auto flex gap-1 px-4 pb-2">
          {sections.map((s) => {
            const Icon = navIcons[s.id];
            return (
              <Button
                key={s.id}
                variant={activeSection === s.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleSectionChange(s.id)}
                className={cn(
                  "flex-1 sm:flex-initial",
                  activeSection === s.id && "ring-1 ring-primary/20",
                )}
              >
                <Icon className="size-4" />
                {s.label}
              </Button>
            );
          })}
        </nav>
      </header>

      <main className="container mx-auto flex-1 px-4 py-6">
        {workspaceSwitchError ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {workspaceSwitchError}
          </div>
        ) : null}
        {activeSection === "dashboard" && (
          <DashboardView
            workspaceId={session.activeWorkspaceId}
            onNavigate={handleSectionChange}
            onEditTransaction={handleDashboardEditTransaction}
          />
        )}
        {activeSection === "accounts" && (
          <AccountsView workspaceId={session.activeWorkspaceId} />
        )}
        {activeSection === "balance-history" && (
          <BalanceHistoryView
            workspaceId={session.activeWorkspaceId}
            onNavigate={handleSectionChange}
          />
        )}
        {activeSection === "transactions" && (
          <TransactionsView
            workspaceId={session.activeWorkspaceId}
            focusTransactionId={focusTransactionId}
            onFocusTransactionHandled={() => setFocusTransactionId(null)}
          />
        )}
        {activeSection === "recurring" && (
          <RecurringView workspaceId={session.activeWorkspaceId} />
        )}
        {activeSection === "budget" && (
          <BudgetView workspaceId={session.activeWorkspaceId} />
        )}
      </main>
    </div>
  );
}
