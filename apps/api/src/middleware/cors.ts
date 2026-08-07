import { cors as honoCors } from "hono/cors";
import { env } from "../lib/env.js";

const LOCAL_LAN_REGEX = /^http:\/\/(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):\d+$/;

export function corsMiddleware() {
  const allowedExact = new Set([
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8081",
    "https://whiteroom.co.in",
    "https://apps.whiteroom.co.in",
    "https://mobile.whiteroom.co.in",
    "https://admin.whiteroom.co.in",
    env.MOBILE_WEB_URL,
    env.ADMIN_URL,
  ]);

  return honoCors({
    origin: (origin) => {
      if (!origin) return "*";
      if (allowedExact.has(origin)) return origin;
      if (LOCAL_LAN_REGEX.test(origin)) return origin;
      if (env.NODE_ENV !== "production") return origin;
      return null;
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Device-Token"],
    maxAge: 86400,
  });
}
