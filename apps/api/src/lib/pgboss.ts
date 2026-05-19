import PgBoss from "pg-boss";
import { env } from "./env.js";

let boss: PgBoss | null = null;
let errorListenerAttached = false;

export function getBoss() {
  boss ??= new PgBoss({
    connectionString: env.DATABASE_URL,
  });

  if (!errorListenerAttached) {
    boss.on("error", (err) => {
      console.error("[pg-boss] Background worker error:", err);
    });
    errorListenerAttached = true;
  }

  return boss;
}
