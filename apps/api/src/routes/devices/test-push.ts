import { Context } from "hono";
import { sendPushToUser } from "../../lib/fcm.js";

export async function testPushHandler(c: Context) {
  const body = await c.req.json<{
    userId: string;
    tenantId: string;
    title?: string;
    body?: string;
  }>();

  if (!body.userId || !body.tenantId) {
    return c.json({ error: "Provide userId and tenantId" }, 400);
  }

  await sendPushToUser(body.tenantId, body.userId, {
    title: body.title ?? "Test Notification",
    body: body.body ?? "This is a test push from the API 👋",
    type: "announcement",
  });

  return c.json({ message: "Push sent" }, 200);
}