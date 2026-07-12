import { hostname } from "node:os";
import type { Command } from "commander";
import { makeClient, fail } from "../index";
import { CashyClient } from "../client";
import {
  CONFIG_PATH,
  DEFAULT_API_URL,
  deleteConfigFile,
  readConfigFile,
  writeConfigFile,
} from "../config";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-allow-private-network": "true",
};

function receiveToken(timeoutMs = 5 * 60 * 1000): {
  port: number;
  token: Promise<string>;
  stop: () => void;
} {
  let resolve!: (token: string) => void;
  let reject!: (err: Error) => void;
  const token = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (req.method === "POST") {
        const body = (await req.text()).trim();
        if (body.length > 0) {
          resolve(body);
          return new Response("ok", { headers: CORS_HEADERS });
        }
        return new Response("empty token", {
          status: 400,
          headers: CORS_HEADERS,
        });
      }
      return new Response("not found", { status: 404, headers: CORS_HEADERS });
    },
  });

  const timer = setTimeout(() => {
    reject(new Error("Timed out waiting for the browser (5 minutes)"));
    server.stop(true);
  }, timeoutMs);

  return {
    port: server.port!,
    token: token.finally(() => {
      clearTimeout(timer);
      // Let the in-flight response flush before stopping.
      setTimeout(() => server.stop(true), 100);
    }),
    stop: () => {
      clearTimeout(timer);
      server.stop(true);
    },
  };
}

async function promptLine(question: string): Promise<string> {
  process.stdout.write(question);
  for await (const line of console) {
    return line.trim();
  }
  return "";
}

async function verifyAndSave(apiUrl: string, token: string): Promise<void> {
  const client = new CashyClient(apiUrl, token);
  const session = await client.getSession();
  await writeConfigFile({ apiUrl, token });
  console.log(
    `Logged in as ${session.user.email} (workspace: ${
      session.workspaces.find((w) => w.id === session.activeWorkspaceId)?.name ??
      session.activeWorkspaceId
    })`,
  );
  console.log(`Config written to ${CONFIG_PATH}`);
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Authentication");

  auth
    .command("login")
    .description("Log in via the browser (token saved to config)")
    .option("--no-open", "print the URL instead of opening the browser")
    .option("--manual", "prompt for API URL and token instead")
    .action(async (opts: { open: boolean; manual?: boolean }) => {
      try {
        const globals = program.opts<{ apiUrl?: string }>();
        const fileConfig = await readConfigFile();
        const apiUrl =
          globals.apiUrl ??
          process.env.CASHY_API_URL ??
          fileConfig.apiUrl ??
          DEFAULT_API_URL;

        if (opts.manual) {
          const enteredUrl =
            (await promptLine(`API URL [${apiUrl}]: `)) || apiUrl;
          const token = await promptLine("Token: ");
          if (!token) {
            console.error("No token entered.");
            process.exit(2);
          }
          await verifyAndSave(enteredUrl, token);
          return;
        }

        const receiver = receiveToken();
        const url = new URL("/cli/auth", apiUrl);
        url.searchParams.set("port", String(receiver.port));
        url.searchParams.set("name", hostname());

        if (opts.open) {
          console.log(`Opening ${url.href} …`);
          Bun.spawn(["open", url.href]).unref();
        } else {
          console.log(`Open this URL in your browser:\n\n  ${url.href}\n`);
        }
        console.log("Waiting for authorization (Ctrl-C to abort)…");

        const token = await receiver.token;
        await verifyAndSave(apiUrl, token);
      } catch (err) {
        fail(err);
      }
    });

  auth
    .command("whoami")
    .description("Show the logged-in user and workspaces")
    .action(async () => {
      try {
        const client = await makeClient(program);
        const session = await client.getSession();
        if (program.opts().json) {
          console.log(JSON.stringify(session, null, 2));
          return;
        }
        console.log(`${session.user.name} <${session.user.email}>`);
        for (const ws of session.workspaces) {
          const active = ws.id === session.activeWorkspaceId ? " (active)" : "";
          console.log(`  workspace: ${ws.name}${active}`);
        }
      } catch (err) {
        fail(err);
      }
    });

  auth
    .command("logout")
    .description("Delete the stored token")
    .action(async () => {
      await deleteConfigFile();
      console.log(`Removed ${CONFIG_PATH}`);
    });
}
