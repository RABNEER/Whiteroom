import { Hono } from "hono";
import { z } from "zod";
import { captureException, sendTestAlert, getDiscordWebhookUrl } from "../lib/discord-tracker.js";

const telemetryRouter = new Hono();

const reportErrorSchema = z.object({
  errorName: z.string().default("ClientError"),
  message: z.string().min(1),
  stack: z.string().optional(),
  screen: z.string().optional(),
  appVersion: z.string().optional(),
  deviceInfo: z
    .object({
      os: z.string().optional(),
      version: z.string().optional(),
      model: z.string().optional(),
      appVersion: z.string().optional(),
    })
    .optional(),
  breadcrumbs: z
    .array(
      z.object({
        timestamp: z.string().optional(),
        category: z.string().optional(),
        message: z.string(),
      })
    )
    .optional(),
  level: z.enum(["critical", "warning", "info"]).optional(),
});

/**
 * Ingestion endpoint for mobile and frontend client crash reports
 */
telemetryRouter.post("/report-error", async (c) => {
  let rawJson: unknown;
  try {
    rawJson = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const parseResult = reportErrorSchema.safeParse(rawJson);
  if (!parseResult.success) {
    return c.json({ success: false, error: "Invalid crash report schema", details: parseResult.error.flatten() }, 400);
  }

  const data = parseResult.data;
  const user = c.get("user" as any) as { userId?: string; role?: string; tenantId?: string } | undefined;

  const clientErr = new Error(data.message);
  clientErr.name = data.errorName;
  if (data.stack) {
    clientErr.stack = data.stack;
  }

  const dispatched = await captureException(clientErr, {
    service: "mobile-app",
    environment: process.env.NODE_ENV || "development",
    route: data.screen || "Unknown Screen",
    userId: user?.userId,
    role: user?.role,
    tenantId: user?.tenantId,
    deviceInfo: data.deviceInfo,
    breadcrumbs: data.breadcrumbs,
    level: data.level || "critical",
    correlationId: crypto.randomUUID(),
  });

  return c.json({
    success: true,
    dispatched,
    message: dispatched
      ? "Crash report logged and dispatched to Discord."
      : "Crash report logged locally (webhook disabled or debounced).",
  });
});

/**
 * Diagnostic endpoint to test the Discord Webhook alert formatting
 */
telemetryRouter.post("/test-alert", async (c) => {
  const webhookUrl = getDiscordWebhookUrl();
  if (!webhookUrl) {
    return c.json(
      {
        success: false,
        error: "DISCORD_ERROR_WEBHOOK_URL is not configured in environment variables.",
      },
      400
    );
  }

  let serviceName = "Whiteroom Diagnostics";
  try {
    const body = (await c.req.json().catch(() => ({}))) as { serviceName?: string };
    if (body?.serviceName) {
      serviceName = String(body.serviceName);
    }
  } catch {
    // Body is optional
  }

  const success = await sendTestAlert(serviceName);

  if (success) {
    return c.json({
      success: true,
      message: `✅ Test alert successfully dispatched to Discord webhook for service: ${serviceName}`,
    });
  } else {
    return c.json(
      {
        success: false,
        error: "Failed to dispatch test alert to Discord. Check server logs.",
      },
      500
    );
  }
});

export { telemetryRouter };
