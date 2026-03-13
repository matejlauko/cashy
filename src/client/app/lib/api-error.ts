type ApiErrorPayload = {
  error?: { code?: string; message?: string };
  message?: string;
};

export type AppError = Error & { code?: string };

export async function parseApiError(
  res: Response,
): Promise<{ code: string; message: string }> {
  try {
    const body = (await res.json()) as ApiErrorPayload;
    if (body.error?.message) {
      return {
        code: body.error.code ?? `HTTP_${res.status}`,
        message: body.error.message,
      };
    }
    if (typeof body.message === "string" && body.message.trim().length > 0) {
      return { code: `HTTP_${res.status}`, message: body.message };
    }
  } catch {
    // ignore
  }
  return {
    code: `HTTP_${res.status}`,
    message:
      res.statusText.trim().length > 0
        ? `Request failed: ${res.statusText}`
        : "An unexpected error occurred",
  };
}

export function throwApiError(parsed: {
  code: string;
  message: string;
}): never {
  throw Object.assign(new Error(parsed.message), { code: parsed.code });
}
