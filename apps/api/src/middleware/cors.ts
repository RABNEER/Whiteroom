import { cors as honoCors } from "hono/cors";

export function corsMiddleware() {
  // FIX: CORS wildcard allows requests from any website
  return honoCors({
    origin: (origin) => {
      if (!origin) return "";

      if (process.env.NODE_ENV === "development") {
        return origin;
      }

      const allowed = [
        "http://localhost:3001",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://192.168.*:8081",
        "https://*.netlify.app",
        process.env.MOBILE_WEB_URL,
        process.env.ADMIN_URL,
      ].filter(Boolean) as string[];

      if (!origin) return origin || ""; // Allow server-to-server or return empty

      const isAllowed = allowed.some((pattern) => {
        if (pattern.includes("*")) {
          const escaped = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
          const regex = new RegExp("^" + escaped + "$");
          return regex.test(origin);
        }
        return pattern === origin;
      });

      return isAllowed ? origin : "";
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Device-Token"],
    maxAge: 86400,
  });
}

