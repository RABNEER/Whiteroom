import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, DeviceTokenResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { registerFcmToken } from "../../services/devices.js";

const registerFcmSchema = z.object({
  fcmToken: z.string().trim().min(20),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

export async function registerFcmHandler(c: Context) {
  const parsed = registerFcmSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const token = await registerFcmToken(user.tenantId, user.userId, parsed.data);

  const response: ApiResponse<DeviceTokenResponse> = {
    success: true,
    data: token,
  };

  return c.json(response, 200);
}
