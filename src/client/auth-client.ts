import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [apiKeyClient()],
});
