import { describe, expect, mock, test } from "bun:test";

// Cloudflare evaluates the Worker's module scope once to validate an upload.
// If bindings are not populated there, loading must still succeed; requests
// are refused at runtime instead (src/worker.ts).
describe("module scope without bindings", () => {
  test("env loads and reports what is missing", async () => {
    mock.module("cloudflare:workers", () => ({ env: {} }));
    const { env, envError, isSecureOrigin } = await import("./env");

    expect(envError).toContain("BETTER_AUTH_SECRET");
    expect(envError).toContain("APP_URL");
    expect(env.LOG_LEVEL).toBe("info");
    expect(isSecureOrigin).toBe(false);
  });

  test("the auth module (including its warm-up) loads", async () => {
    mock.module("cloudflare:workers", () => ({ env: {} }));
    const { auth } = await import("./auth/auth");

    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  });
});
