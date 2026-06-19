import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error.js";
import { env } from "./lib/env.js";

// ─── Route Imports ───
import { authRoutes } from "./routes/auth/index.js";
import { tenantRoutes } from "./routes/tenant/index.js";
import { inviteRoutes } from "./routes/invite/index.js";
import { classRoutes } from "./routes/classes/index.js";
import { studentRoutes } from "./routes/students/index.js";
import { scheduleRoutes } from "./routes/schedules/index.js";
import { deviceRoutes } from "./routes/devices/index.js";
import { parentRoutes } from "./routes/parent/index.js";
import { attendanceRoutes } from "./routes/attendance/index.js";
import { announcementRoutes } from "./routes/announcements/index.js";
import { paymentRoutes } from "./routes/payments/index.js";
import { reportRoutes } from "./routes/reports/index.js";
import { adminRoutes } from "./routes/admin/index.js";
import { chatRoutes } from "./routes/chat/index.js";
import { archiveRoutes } from "./routes/archive/index.js";
import { publicRoutes } from "./routes/public/index.js";
import { billingRoutes } from "./routes/billing/index.js";
import { userRoutes } from "./routes/users/index.js";
import { bulletinsRoutes } from "./routes/bulletins/index.js";
import {
  waltQuizHandler,
  waltFlashcardHandler,
  waltInsightsHandler,
  waltDraftNoticeHandler,
} from "./routes/walt/index.js";
import { secureHeaders } from "hono/secure-headers";
import { startJobs } from "./jobs/index.js";
import { authMiddleware, requireRole } from "./middleware/auth.js";
import { UserRole } from "@whiteroom/shared";

const app = new Hono();

// FIX: No request body size limit
app.use("*", (c, next) => {
  if (c.req.path.startsWith("/api/upload/")) {
    return next();
  }
  return bodyLimit({
    maxSize: 1 * 1024 * 1024, // 1MB for all routes
    onError: (c) => {
      return c.json({ 
        error: "Payload too large",
        maxSize: "1MB" 
      }, 413);
    }
  })(c, next);
});

app.use(
  "/api/upload/*",
  bodyLimit({
    maxSize: 10 * 1024 * 1024 // 10MB for uploads only
  })
);

// ─── Global Middleware ───
app.use("*", secureHeaders());
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
app.route("/api/v1/classes", classRoutes);
app.route("/api/v1/students", studentRoutes);
app.route("/api/v1/schedules", scheduleRoutes);
app.route("/api/v1/devices", deviceRoutes);
app.route("/api/v1/parent", parentRoutes);
app.route("/api/v1/attendance", attendanceRoutes);
app.route("/api/v1/announcements", announcementRoutes);
app.route("/api/v1/payments", paymentRoutes);
app.route("/api/v1/reports", reportRoutes);
app.route("/api/v1/admin", adminRoutes);
app.route("/api/v1/chat", chatRoutes);
app.route("/api/v1/classes/:classId/archive", archiveRoutes);
app.route("/api/v1/billing", billingRoutes);
app.route("/api/v1/users", userRoutes);
app.route("/api/v1/bulletins", bulletinsRoutes);
app.route("/", publicRoutes);

// ─── Walt AI Routes ───
app.post(
  "/api/v1/classes/:id/walt/quiz",
  authMiddleware,
  requireRole(UserRole.SCHOOL_ADMIN, UserRole.TEACHER),
  waltQuizHandler
);
app.post(
  "/api/v1/classes/:id/walt/flashcards",
  authMiddleware,
  waltFlashcardHandler
);
app.get(
  "/api/v1/reports/insights",
  authMiddleware,
  requireRole(UserRole.SCHOOL_ADMIN, UserRole.TEACHER),
  waltInsightsHandler
);
app.post(
  "/api/v1/walt/draft-notice",
  authMiddleware,
  requireRole(UserRole.SCHOOL_ADMIN, UserRole.TEACHER),
  waltDraftNoticeHandler
);

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
  Routes: /api/v1/auth, /api/v1/tenants, /api/v1/invite, /api/v1/classes, /api/v1/students, /api/v1/schedules, /api/v1/devices, /api/v1/parent, /api/v1/attendance, /api/v1/announcements, /api/v1/payments, /api/v1/reports, /api/v1/admin, /api/v1/chat
`);
});

startJobs().catch((err) => {
  console.error("[jobs] Failed to start background workers:", err);
});
