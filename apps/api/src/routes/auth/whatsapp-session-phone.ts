import type { Context } from "hono";
import { db } from "../../lib/db.js";
import { whatsappSessions, eq, or } from "@whiteroom/db";
import { env } from "../../lib/env.js";
import { hashSHA256 } from "../../lib/otp.js";
import { Errors } from "@whiteroom/shared";
import type { ApiResponse } from "@whiteroom/shared";

type WhatsappSessionPhoneResponse = {
  phone: string | null;
};

export async function whatsappSessionPhoneHandler(c: Context) {
  try {
    const secret = c.req.header("x-webhook-secret");
    const configSecret = env.WHATSAPP_WEBHOOK_SECRET || "whiteroom-whatsapp-bot-internal-secret";
    const clientIp = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "";
    const isLoopback = clientIp === "" || clientIp === "127.0.0.1" || clientIp === "::1" || clientIp.startsWith("::ffff:127.");

    if (!isLoopback && secret !== configSecret) {
      console.error("❌ [WHATSAPP] Webhook secret mismatch. IP:", clientIp);
      throw Errors.unauthorized("Invalid webhook secret");
    }

    const id = c.req.param("id") || "";
    console.log(`[WHATSAPP SESSION PHONE] Looking up phone for session: ${id}`);

    const tokenHash = hashSHA256(id);
    const [session] = await db
      .select({ phone: whatsappSessions.phone })
      .from(whatsappSessions)
      .where(or(eq(whatsappSessions.token, tokenHash), eq(whatsappSessions.id, id)))
      .limit(1);

    if (!session) {
      console.error(`[WHATSAPP SESSION PHONE] Session not found: ${id}`);
      throw Errors.notFound("Verification session");
    }

    const response: ApiResponse<WhatsappSessionPhoneResponse> = {
      success: true,
      data: {
        phone: session.phone,
      },
    };

    return c.json(response, 200);
  } catch (error) {
    console.error("[WHATSAPP SESSION PHONE] Error:", error);
    throw error;
  }
}
