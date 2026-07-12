import { useEffect, useState } from "react";
import { authClient } from "@/client/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type State =
  | { step: "loading" }
  | { step: "signed-out" }
  | { step: "ready" }
  | { step: "working" }
  | { step: "done" }
  | { step: "manual"; key: string }
  | { step: "error"; message: string };

export function CliAuthApp() {
  const [state, setState] = useState<State>({ step: "loading" });

  const params = new URLSearchParams(window.location.search);
  const port = params.get("port");
  const host = params.get("name") ?? "unknown-host";

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      setState(data ? { step: "ready" } : { step: "signed-out" });
    });
  }, []);

  const authorize = async () => {
    setState({ step: "working" });
    const name = `cli-${host}-${new Date().toISOString().slice(0, 10)}`;
    const { data, error } = await authClient.apiKey.create({ name });
    if (error || !data) {
      setState({
        step: "error",
        message: error?.message ?? "Failed to create API key",
      });
      return;
    }
    if (!port) {
      setState({ step: "manual", key: data.key });
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: data.key,
      });
      if (!res.ok) throw new Error(`loopback responded ${res.status}`);
      setState({ step: "done" });
    } catch {
      // CLI not reachable (headless/SSH) — show the key once.
      setState({ step: "manual", key: data.key });
    }
  };

  return (
    <div className="grid min-h-screen place-items-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Authorize Cashy CLI</CardTitle>
          <CardDescription>
            Grants the CLI on <strong>{host}</strong> full access to your
            cashy account via an API key.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.step === "loading" && <p>Checking session…</p>}
          {state.step === "signed-out" && (
            <>
              <p className="text-sm">
                You are not signed in. Sign in first, then return to this tab.
              </p>
              <Button asChild>
                <a href="/login" target="_blank" rel="noreferrer">
                  Go to sign in
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                I signed in — retry
              </Button>
            </>
          )}
          {(state.step === "ready" || state.step === "working") && (
            <Button onClick={authorize} disabled={state.step === "working"}>
              {state.step === "working" ? "Authorizing…" : "Authorize"}
            </Button>
          )}
          {state.step === "done" && (
            <p className="text-sm">
              Logged in — you can close this tab and return to the terminal.
            </p>
          )}
          {state.step === "manual" && (
            <>
              <p className="text-sm">
                Could not reach the CLI automatically. Copy this token (shown
                once) and run{" "}
                <code>bun run cashy auth login --manual</code>:
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {state.key}
              </pre>
            </>
          )}
          {state.step === "error" && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
