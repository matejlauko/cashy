import { drizzle } from "drizzle-orm/bun-sql";
import { sql } from "@/db/client";

export const drizzleDb = drizzle({ client: sql });
