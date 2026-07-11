import { Context } from "hono";
import { AppError, Errors } from "@whiteroom/shared";

/**
 * Global error handler — catches AppErrors and unknown errors,
 * returns consistent JSON shape.
 */
export async function errorHandler(err: Error, c: Context) {
  const correlationId = crypto.randomUUID();

  if (err instanceof SyntaxError) {
    const validationError = Errors.validation("Invalid or empty JSON request body");
    return c.json({ ...validationError.toJSON(), correlationId }, 400);
  }

  if (err instanceof AppError) {
    return c.json({ ...err.toJSON(), correlationId }, err.statusCode as any);
  }

  console.error("Unhandled error:", err);
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
