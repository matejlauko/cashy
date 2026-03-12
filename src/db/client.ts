import { SQL } from "bun";
import { env } from "@/env";
import { logger } from "@/logger";

export const sql = new SQL(env.DATABASE_URL, { bigint: true });

logger.info("Database client initialized");
