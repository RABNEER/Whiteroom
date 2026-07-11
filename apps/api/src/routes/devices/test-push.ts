import type { Context } from "hono";
import type { JWTPayload } from "@whiteroom/shared";
import { sendPushToUser } from "../../lib/fcm.js";

export async function testPushHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  const body = await c.req.json<{
    title?: string;
    body?: string;
  }>();

  await sendPushToUser(user.tenantId, user.userId, {
    title: body.title ?? "Test Notification",
    body: body.body ?? "This is a test push from the API",
    type: "announcement",
  });

  return c.json({ message: "Push sent" }, 200);
}