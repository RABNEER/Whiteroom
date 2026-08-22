import { Context } from "hono";
import { AppError, Errors } from "@whiteroom/shared";
import { captureException } from "../lib/discord-tracker.js";

/**
 * Global error handler — catches AppErrors and unknown errors,
 * returns consistent JSON shape and reports to Discord Tracker.
 */
export async function errorHandler(err: Error, c: Context) {
  const correlationId = crypto.randomUUID();
  const user = c.get("user") as
    | { userId?: string; role?: string; tenantId?: string }
    | undefined;

  if (err instanceof SyntaxError) {
    const validationError = Errors.validation("Invalid or empty JSON request body");
    return c.json({ ...validationError.toJSON(), correlationId }, 400);
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      captureException(err, {
        service: "apps/api",
        route: `${c.req.method} ${c.req.path}`,
        statusCode: err.statusCode,
        userId: user?.userId,
        role: user?.role,
        tenantId: user?.tenantId,
        correlationId,
      }).catch(() => {});
    }
    return c.json({ ...err.toJSON(), correlationId }, err.statusCode as any);
  }

  console.error("Unhandled error:", err);
  captureException(err, {
    service: "apps/api",
    route: `${c.req.method} ${c.req.path}`,
    statusCode: 500,
    userId: user?.userId,
    role: user?.role,
    tenantId: user?.tenantId,
    correlationId,
  }).catch(() => {});

  const isProd = process.env.NODE_ENV === "production";
  return c.json({
    success: false,
    correlationId,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: isProd ? "Internal server error occurred" : (err.message || "Internal server error occurred"),
      ...(isProd ? {} : { stack: err.stack }),
    }
  }, 500);
}
