import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@whiteroom/db";
import { env } from "./env.js";

// Connection pool — max 10 for managed Supabase free tier
const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
