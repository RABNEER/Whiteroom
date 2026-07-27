import { cors as honoCors } from "hono/cors";
import { env } from "../lib/env.js";

export function corsMiddleware() {
  return honoCors({
    origin: (origin) => {
      if (!origin) return "*";
      return origin;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Device-Token"],
    maxAge: 86400,
  });
}
