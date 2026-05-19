import { db } from "../lib/db.js";
import { deviceTokens } from "@whiteroom/db";

export async function registerFcmToken(
  tenantId: string,
  userId: string,
  input: { fcmToken: string; platform?: string }
) {
  const [token] = await db
    .insert(deviceTokens)
    .values({
      tenantId,
      userId,
      fcmToken: input.fcmToken,
      platform: input.platform ?? null,
    })
    .onConflictDoUpdate({
      target: deviceTokens.fcmToken,
      set: {
        tenantId,
        userId,
        platform: input.platform ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return token!;
}
