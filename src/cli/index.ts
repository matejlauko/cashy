import { Command } from "commander";
import { readConfigFile, resolveConfig } from "./config";
import { ApiError, CashyClient, exitCodeForError } from "./client";

export type GlobalOpts = { apiUrl?: string; token?: string; json?: boolean };

export async function makeClient(program: Command): Promise<CashyClient> {
  const opts = program.opts<GlobalOpts>();
  const fileConfig = await readConfigFile();
  const { apiUrl, token } = resolveConfig(opts, process.env, fileConfig);
  return new CashyClient(apiUrl, token);
}

export function fail(err: unknown): never {
  if (err instanceof ApiError) {
    console.error(`Error (${err.code}): ${err.message}`);
    if (err.details) console.error(JSON.stringify(err.details, null, 2));
    if (err.status === 401) {
      console.error("Hint: run `bun run cashy auth login`");
    }
  } else {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(exitCodeForError(err));
}

const program = new Command();

program
  .name("cashy")
  .description("Thin CLI over the cashy API")
  .option("--api-url <url>", "API base URL")
  .option("--token <token>", "API token")
  .option("--json", "print raw API responses as JSON");

import { registerStatusCommand } from "./commands/status";
import { registerBalanceCommands } from "./commands/balance";
import { registerImportCommand } from "./commands/import";
import { registerAuthCommands } from "./commands/auth";

registerAuthCommands(program);
registerStatusCommand(program);
registerBalanceCommands(program);
registerImportCommand(program);

program.parseAsync().catch(fail);
