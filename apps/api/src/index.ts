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
import { pilotDashboardHtmlHandler } from "./routes/admin/pilot-dashboard-html.js";
import { pilotStatsHandler } from "./routes/admin/pilot-stats.js";
import { chatRoutes } from "./routes/chat/index.js";
import { archiveRoutes } from "./routes/archive/index.js";
import { publicRoutes } from "./routes/public/index.js";
import { billingRoutes } from "./routes/billing/index.js";
import { chunkedRoutes } from "./routes/upload/chunked.js";
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
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./lib/db.js";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 1.0,
  });
  console.log("🛡️ [SENTRY] Backend error & performance monitoring initialized.");
}

const app = new Hono();

// FIX: No request body size limit
app.use("*", (c, next) => {
  const path = c.req.path;
  if (path.includes("/archive/upload") || path.startsWith("/api/v1/upload/")) {
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
  "*/archive/upload",
  bodyLimit({
    maxSize: 100 * 1024 * 1024, // 100MB for archive uploads
    onError: (c) => {
      return c.json({
        error: "Payload too large",
        maxSize: "100MB"
      }, 413);
    }
  })
);

app.use(
  "/api/v1/upload/*",
  bodyLimit({
    maxSize: 5 * 1024 * 1024, // 5MB for chunk uploads (1MB chunks)
    onError: (c) => {
      return c.json({
        error: "Payload too large",
        maxSize: "5MB"
      }, 413);
    }
  })
);

// ─── Global Middleware ───
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*"],
      connectSrc: ["'self'", "https://*"],
    },
  })
);
app.use("*", logger());
app.use("*", corsMiddleware());

// ─── Health Check ───
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "2.0-NUCLEAR-FIX",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// ─── Pilot Live Telemetry Web Dashboard ───
app.get("/pilot-dashboard", pilotDashboardHtmlHandler);
app.get("/api/v1/pilot-stats", pilotStatsHandler);

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
app.route("/api/v1/upload", chunkedRoutes);
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

// ─── Local Storage Static File Serving (for G:\My Drive\Whiteroom) ───
app.get("/api/v1/storage/files/*", async (c) => {
  const localStoragePath = env.LOCAL_STORAGE_PATH || process.env.LOCAL_STORAGE_PATH || "G:\\My Drive\\Whiteroom";
  const rawPath = c.req.path.replace(/^\/api\/v1\/storage\/files\//, "");
  const relPath = decodeURIComponent(rawPath);
  const normalizedRoot = path.normalize(localStoragePath);
  const fullPath = path.normalize(path.join(normalizedRoot, relPath));

  // Security check against path traversal (e.g., ../../Windows)
  if (!fullPath.startsWith(normalizedRoot)) {
    return c.json({ error: "Access denied" }, 403);
  }

  try {
    const fileBuf = await fsPromises.readFile(fullPath);
    return new Response(fileBuf, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
      },
    });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

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

// ─── Programmatic DB Migrations ───
// Trigger deployment to apply teacher_id migration SQL file and WhatsApp bot update
async function runDbMigrations() {
  console.log("⚙️ [DB] Running automatic migrations...");
  try {
    const possiblePaths = [
      path.resolve(process.cwd(), "packages/db/drizzle"),
      path.resolve(process.cwd(), "../../packages/db/drizzle"),
      path.resolve(process.cwd(), "../db/drizzle"),
    ];
    
    let migrationsFolder = "";
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        migrationsFolder = p;
        break;
      }
    }
    
    if (!migrationsFolder) {
      throw new Error(`Could not find Drizzle migrations folder in any of the searched paths: ${JSON.stringify(possiblePaths)}`);
    }
    
    console.log(`⚙️ [DB] Applying migrations from folder: ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log("✅ [DB] Migrations applied successfully programmatically.");
  } catch (err) {
    console.error("❌ [DB] Migrations failed:", err);
  }
}

// ─── Global Error Handlers (prevent Baileys uncaught errors from killing the process) ───
process.on("unhandledRejection", (reason, promise) => {
  console.error("🛑 [PROCESS] Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("🛑 [PROCESS] Uncaught Exception:", error);
});

// ─── Start Server Immediately to prevent Railway 502 Bad Gateway during cold starts ───
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

runDbMigrations().catch((err) => {
  console.error("❌ [DB] Migrations failed:", err);
});

// ─── Start WhatsApp Bot (lazy init — optional in-process daemon) ───
if (process.env.DISABLE_WHATSAPP_BOT !== "true") {
  import("./services/whatsapp-bot.js")
    .then(({ initWhatsAppBot }) => {
      console.log("🤖 [WHATSAPP BOT] Starting WhatsApp bot daemon...");
      return initWhatsAppBot();
    })
    .catch((err) => {
      console.error("💥 [WHATSAPP BOT] Failed to start WhatsApp bot daemon:", err);
    });
} else {
  console.log("ℹ️ [WHATSAPP BOT] In-process bot disabled via DISABLE_WHATSAPP_BOT=true (running via dedicated service).");
}

