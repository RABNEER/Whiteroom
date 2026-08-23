import { cors as honoCors } from "hono/cors";
import { env } from "../lib/env.js";

const LOCAL_LAN_REGEX = /^http:\/\/(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):\d+$/;
const LOCALHOST_REGEX = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::(?:3000|3001|5173|5174|5175|8081|4173))?$/;

export function corsMiddleware() {
  const allowedExact = new Set([
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:8081",
    "http://localhost:4173",
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
      if (LOCALHOST_REGEX.test(origin)) return origin;
      if (LOCAL_LAN_REGEX.test(origin)) return origin;
      if (env.NODE_ENV !== "production") return origin;
      return ""; // Block unauthorized origins in production
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowHeaders: [
      "Content-Type", 
      "Authorization", 
      "X-Device-Token", 
      "X-Tenant-ID", 
      "Accept", 
      "X-Requested-With",
      "sentry-trace",
      "baggage"
    ],
    maxAge: 86400,
  });
}
