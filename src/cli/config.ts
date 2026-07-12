import { homedir } from "node:os";
import { mkdir, unlink, chmod } from "node:fs/promises";
import path from "node:path";

export type CliConfig = { apiUrl: string; token: string };

export const DEFAULT_API_URL = "http://localhost:3050";

export const CONFIG_PATH = path.join(
  homedir(),
  ".config",
  "cashy",
  "config.json",
);

export function resolveConfig(
  flags: { apiUrl?: string; token?: string },
  env: Record<string, string | undefined>,
  fileConfig: Partial<CliConfig>,
): { apiUrl: string; token?: string } {
  return {
    apiUrl:
      flags.apiUrl ?? env.CASHY_API_URL ?? fileConfig.apiUrl ?? DEFAULT_API_URL,
    token: flags.token ?? env.CASHY_TOKEN ?? fileConfig.token,
  };
}

export async function readConfigFile(): Promise<Partial<CliConfig>> {
  const file = Bun.file(CONFIG_PATH);
  if (!(await file.exists())) return {};
  try {
    return (await file.json()) as Partial<CliConfig>;
  } catch {
    return {};
  }
}

export async function writeConfigFile(config: CliConfig): Promise<void> {
  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  await chmod(CONFIG_PATH, 0o600);
}

export async function deleteConfigFile(): Promise<void> {
  try {
    await unlink(CONFIG_PATH);
  } catch {
    // already gone
  }
}
