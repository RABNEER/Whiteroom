import type { Context } from "hono";

/**
 * Safely extracts the client IP address from the request.
 * It mitigates IP spoofing by checking `x-real-ip` first, and if checking `x-forwarded-for`,
 * it only takes the first IP (the original client) assuming the proxy setup is trusted.
 * Ideally, only rely on trusted headers set by your proxy/WAF.
 */
export function getClientIp(c: Context): string {
  // x-real-ip is typically set by Nginx/Cloudflare and is harder to spoof if the proxy clears it on incoming requests
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp.trim();

  // x-forwarded-for can be a comma-separated list: "client, proxy1, proxy2"
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",");
    const client = ips[0]?.trim();
    if (client) return client;
  }

  return "unknown";
}
