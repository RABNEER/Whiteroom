import { Context } from "hono";
import { AppError, Errors } from "@whiteroom/shared";
import * as Sentry from "@sentry/node";

/**
 * Global error handler — catches AppErrors and unknown errors,
 * returns consistent JSON shape and reports to Sentry.
 */
export async function errorHandler(err: Error, c: Context) {
  const correlationId = crypto.randomUUID();

  if (err instanceof SyntaxError) {
    const validationError = Errors.validation("Invalid or empty JSON request body");
    return c.json({ success: false, ...validationError.toJSON(), correlationId }, 400);
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      Sentry.captureException(err, {
        extra: { correlationId, path: c.req.path, method: c.req.method, statusCode: err.statusCode },
      });
    }
    return c.json({ success: false, ...err.toJSON(), correlationId }, err.statusCode as any);
  }

  console.error("Unhandled error:", err);
  Sentry.captureException(err, {
    extra: { correlationId, path: c.req.path, method: c.req.method },
  });

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
