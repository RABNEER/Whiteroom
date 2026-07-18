import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { env } from "../../lib/env.js";
import { whatsappSessions, eq, and, gte } from "@whiteroom/db";
import { normalizePhone, isValidIndianPhone } from "../../lib/otp.js";
import { Errors } from "@whiteroom/shared";
import type { ApiResponse } from "@whiteroom/shared";

const webhookSchema = z.object({
  from: z.string().min(10),
  text: z.string().min(1),
  isLid: z.boolean().optional(),
});

export async function whatsappWebhookHandler(c: Context) {
  try {
    const secret = c.req.header("x-webhook-secret");
    const configSecret = env.WHATSAPP_WEBHOOK_SECRET;

    if (!configSecret) {
      console.error("❌ [WHATSAPP WEBHOOK] WHATSAPP_WEBHOOK_SECRET is not configured in .env");
      throw Errors.unauthorized("Webhook secret not configured on server");
    }

    if (secret !== configSecret) {
      console.error("❌ [WHATSAPP WEBHOOK] Webhook secret mismatch.");
      throw Errors.unauthorized("Invalid webhook secret");
    }

    const body = await c.req.json();
    const parsed = webhookSchema.safeParse(body);

    if (!parsed.success) {
      console.error("[WHATSAPP WEBHOOK] Invalid payload:", parsed.error.flatten().fieldErrors);
      throw Errors.validation("Invalid webhook payload", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const { from, text, isLid } = parsed.data;
    const match = text.match(/Verify\s+([A-Za-z0-9_-]+)/i);

    if (!match) {
      return c.json({
        success: false,
        error: "No valid session code found in message",
      }, 400);
    }

    const code = match[1];
    const now = new Date();

    const queryConditions = [
      eq(whatsappSessions.id, code),
      eq(whatsappSessions.verified, false),
      gte(whatsappSessions.expiresAt, now),
    ];

    if (isLid) {
      console.log(`[WHATSAPP WEBHOOK] Verifying session ${code} for LID sender (bypassing phone hash check).`);
    } else {
      const phone = normalizePhone(from);
      if (!isValidIndianPhone(phone)) {
        return c.json({
          success: false,
          error: "Invalid phone number format. Only Indian numbers (+91) are supported.",
        }, 400);
      }

      queryConditions.push(eq(whatsappSessions.phone, phone));
    }

    // Find active, unverified session
    const [session] = await db
      .select()
      .from(whatsappSessions)
      .where(and(...queryConditions))
      .limit(1);

    if (!session) {
      console.warn(`[WHATSAPP WEBHOOK] Session code ${code} not active, already verified, expired, or phone mismatch.`);
      return c.json({
        success: false,
        error: "Verification session not active, already verified, or expired",
      }, 400);
    }

    // Update session to verified
    await db
      .update(whatsappSessions)
      .set({
        verified: true,
      })
      .where(eq(whatsappSessions.id, code));

    console.log(`[WHATSAPP WEBHOOK] Session ${code} successfully verified.`);

    const response: ApiResponse<{ verified: boolean }> = {
      success: true,
      data: {
        verified: true,
      },
    };

    return c.json(response, 200);
  } catch (error) {
    console.error("[WHATSAPP WEBHOOK] Error:", error);
    throw error;
  }
}
