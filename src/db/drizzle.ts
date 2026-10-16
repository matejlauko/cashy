import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

// Used by Better Auth only; app queries go through `sql` in ./client.
export const drizzleDb = drizzle(env.DB);
