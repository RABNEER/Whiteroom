import { Context } from "hono";
import { AppError, Errors } from "@whiteroom/shared";

/**
 * Global error handler — catches AppErrors and unknown errors,
 * returns consistent JSON shape.
 */
export async function errorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json(err.toJSON(), err.statusCode as any);
  }

  // Unknown error — log and return generic 500
  console.error("Unhandled error:", err);
  const internal = Errors.internal();
  return c.json(internal.toJSON(), 500);
}
