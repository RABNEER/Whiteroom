import type { Context } from "hono";
import { db } from "../../lib/db.js";
import { whatsappSessions, eq } from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import type { ApiResponse } from "@whiteroom/shared";

type WhatsappSessionStatusResponse = {
  verified: boolean;
  isExpired: boolean;
};

export async function whatsappSessionGetHandler(c: Context) {
  const id = c.req.param("id");
  if (!id) {
    throw Errors.notFound("Verification session");
  }

  const [session] = await db
    .select({
      verified: whatsappSessions.verified,
      expiresAt: whatsappSessions.expiresAt,
    })
    .from(whatsappSessions)
    .where(eq(whatsappSessions.id, id))
    .limit(1);

  if (!session) {
    throw Errors.notFound("Verification session");
  }

  const response: ApiResponse<WhatsappSessionStatusResponse> = {
    success: true,
    data: {
      verified: session.verified,
      isExpired: session.expiresAt <= new Date(),
    },
  };

  return c.json(response, 200);
}
