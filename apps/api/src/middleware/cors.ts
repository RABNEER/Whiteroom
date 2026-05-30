import { cors as honoCors } from "hono/cors";

export function corsMiddleware() {
  // FIX: CORS wildcard allows requests from any website
  return honoCors({
    origin: (origin) => {
      const allowed = [
        "http://localhost:3001",
        "exp://localhost:8081",
        "exp://192.168.1.*:8081",
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

