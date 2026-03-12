import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "@/api/context";
import { logger } from "@/logger";

const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  500: "INTERNAL_SERVER_ERROR",
};

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  let requestId: string | undefined;
  try {
    requestId = c.get("requestId");
  } catch {
    // Variables not initialized yet
  }

  if (err instanceof HTTPException) {
    const status = err.status;
    const code = STATUS_CODES[status] ?? `HTTP_${status}`;
    const message = err.message || "Request failed";

    if (status >= 500) {
      logger.error("Server error", { requestId, error: err, status });
    }

    return c.json({ error: { code, message } }, { status });
  }

  logger.error("Unhandled error", { requestId, error: err });

  return c.json(
    { error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" } },
    { status: 500 },
  );
};
