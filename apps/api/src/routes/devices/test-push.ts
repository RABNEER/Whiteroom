import { Context } from "hono";
import { Errors } from "@whiteroom/shared";
import { sendPushToUser } from "../../lib/fcm.js";

export async function testPushHandler(c: Context) {
  const user = c.get("user");
  const tenantId = c.get("tenantId");

  if (!user?.id || !tenantId) {
    throw Errors.unauthorized();
  }

  const body = await c.req.json<{ title?: string; body?: string }>();

  await sendPushToUser(tenantId, user.id, {
    title: body.title ?? "Test Notification",
    body: body.body ?? "This is a test push from the API 👋",
    type: "announcement",
  });

  return c.json({ message: "Push notification sent (fire-and-forget)" }, 200);
}