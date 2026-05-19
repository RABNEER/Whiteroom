import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error.js";
import { env } from "./lib/env.js";

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

// ─── API v1 Routes (Phase 2+) ───
// app.route("/api/v1/auth", authRoutes);
// app.route("/api/v1/tenants", tenantRoutes);
// ...

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
`);
});

