import { Context } from "hono";
import { AppError, Errors } from "@whiteroom/shared";

/**
 * Global error handler — catches AppErrors and unknown errors,
 * returns consistent JSON shape.
 */
export async function errorHandler(err: Error, c: Context) {
  if (err instanceof SyntaxError) {
    const validationError = Errors.validation("Invalid or empty JSON request body");
    return c.json(validationError.toJSON(), 400);
  }

  if (err instanceof AppError) {
    return c.json(err.toJSON(), err.statusCode as any);
  }

  // Unknown error — log and return generic 500
  console.error("Unhandled error:", err);
  return c.json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: err.message || "Internal server error occurred",
      stack: err.stack,
    }
  }, 500);
}
