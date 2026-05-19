import { Context, Next } from "hono";
import { cors as honoCors } from "hono/cors";

export function corsMiddleware() {
  return honoCors({
    origin: ["http://localhost:8081", "http://localhost:19006"], // Expo dev
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  });
}
