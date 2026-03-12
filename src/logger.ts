import { env, type LogLevel } from "./env";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

type LogContext = {
  requestId?: string | null;
  route?: string | null;
  method?: string | null;
  status?: number | null;
  userId?: string;
  workspaceId?: string;
  durationMs?: number;
  [key: string]: unknown;
};

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[env.LOG_LEVEL];
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const { requestId, route, method, status, ...rest } = context ?? {};

  const entry: Record<string, unknown> = {
    level,
    message,
    requestId: requestId ?? null,
    route: route ?? null,
    method: method ?? null,
    status: status ?? null,
    ...rest,
    timestamp: new Date().toISOString(),
  };

  const line = JSON.stringify(entry, (_key, value) =>
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value,
  );

  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) =>
    write("debug", message, context),
  info: (message: string, context?: LogContext) =>
    write("info", message, context),
  warn: (message: string, context?: LogContext) =>
    write("warn", message, context),
  error: (message: string, context?: LogContext) =>
    write("error", message, context),
};
