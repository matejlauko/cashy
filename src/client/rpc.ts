import { hc } from "hono/client";
import type { AppType } from "@/api/app";

export const rpc = hc<AppType>("/");
