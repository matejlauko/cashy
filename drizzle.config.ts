import { defineConfig } from "drizzle-kit";

// Generates SQL migrations only. They are applied with
// `wrangler d1 migrations apply cashy --local|--remote`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/*.ts",
  out: "./migrations",
});
