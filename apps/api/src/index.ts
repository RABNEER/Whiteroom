import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error.js";
import { env } from "./lib/env.js";

// ─── Route Imports ───
import { authRoutes } from "./routes/auth/index.js";
import { tenantRoutes } from "./routes/tenant/index.js";
import { inviteRoutes } from "./routes/invite/index.js";

const app = new Hono();

// ─── Global Middleware ───
app.use("*", logger());
app.use("*", corsMiddleware());

// ─── Health Check ───
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// ─── API v1 Routes ───
app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/tenants", tenantRoutes);
app.route("/api/v1/invite", inviteRoutes);

// ─── Global Error Handler ───
app.onError(errorHandler);

// ─── 404 Fallback ───
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404
  );
});

// ─── Start Server ───
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`
  ╦ ╦┬ ┬┬┌┬┐┌─┐┬─┐┌─┐┌─┐┌┬┐
  ║║║├─┤│ │ ├┤ ├┬┘│ ││ ││││
  ╚╩╝┴ ┴┴ ┴ └─┘┴└─└─┘└─┘┴ ┴
  API running on port ${info.port}
  Environment: ${env.NODE_ENV}
  Routes: /api/v1/auth, /api/v1/tenants, /api/v1/invite
`);
});
