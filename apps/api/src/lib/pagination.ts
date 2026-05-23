import type { Context } from "hono";

/**
 * Safely parses page and limit parameters from request query strings.
 * Prevents NaN pagination bypass DoS vulnerabilities.
 */
export function parsePagination(c: Context, defaultLimit = 20) {
  const pageStr = c.req.query("page");
  const limitStr = c.req.query("limit");

  const parsedPage = pageStr ? parseInt(pageStr, 10) : 1;
  const page = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;

  const parsedLimit = limitStr ? parseInt(limitStr, 10) : defaultLimit;
  const limit = isNaN(parsedLimit) || parsedLimit < 1 ? defaultLimit : Math.min(100, parsedLimit);

  return { page, limit };
}
