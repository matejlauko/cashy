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
import { LogOut } from "lucide-react";

type Section = "dashboard";
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
];

class SessionBootstrapError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SessionBootstrapError";
    this.status = status;
  }
}

async function getErrorMessage(res: Response, fallback: string) {
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

      await queryClient.refetchQueries({ queryKey: ["session"] });
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">Money TS</span>
            <span className="text-muted-foreground">·</span>
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
              <span className="text-sm font-medium">
                {activeWorkspace.name}
              </span>
            )}
            <span className="text-muted-foreground text-xs">
              {activeWorkspace.id}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">{userLabel}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
        <nav className="container mx-auto flex gap-1 px-4 pb-2">
          {sections.map((s) => (
            <Button
              key={s.id}
              variant={activeSection === s.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </Button>
          ))}
        </nav>
      </header>

      <main className="container mx-auto flex-1 p-4">
        {workspaceSwitchError ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {workspaceSwitchError}
          </div>
        ) : null}
        {/* {activeSection === "dashboard" && <DashboardView />} */}
      </main>
    </div>
  );
}
