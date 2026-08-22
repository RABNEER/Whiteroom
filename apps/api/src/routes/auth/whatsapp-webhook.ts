import type { Context } from "hono";
import { getClientIp } from "../../lib/network.js";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { env } from "../../lib/env.js";
import { whatsappSessions, eq, and, gte, or } from "@whiteroom/db";
import { normalizePhone, isValidIndianPhone, hashSHA256 } from "../../lib/otp.js";
import { Errors } from "@whiteroom/shared";
import type { ApiResponse } from "@whiteroom/shared";

const webhookSchema = z.object({
  from: z.string().min(10),
  text: z.string().min(1),
  isLid: z.boolean().optional(),
  phone: z.string().optional(),
  code: z.string().optional(),
});

export async function whatsappWebhookHandler(c: Context) {
  try {
    const secret = c.req.header("x-webhook-secret");
    const configSecret = env.WHATSAPP_WEBHOOK_SECRET;
    
    // Allow loopback/internal requests without secret check
    const clientIp = getClientIp(c);
    const isLoopback = clientIp === "" || clientIp === "unknown" || clientIp === "127.0.0.1" || clientIp === "::1" || clientIp.startsWith("::ffff:127.");

    if (!isLoopback && secret !== configSecret) {
      console.error("❌ [WHATSAPP WEBHOOK] Webhook secret mismatch. IP:", clientIp);
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
    const code = parsed.data.code || text.match(/Verify\s+([A-Za-z0-9_-]+)/i)?.[1];

    if (!code) {
      return c.json({
        success: false,
        error: "No valid session code found in message",
      }, 400);
    }

    const tokenHash = hashSHA256(code);
    const now = new Date();

    // 1. Find session by code or token
    const [session] = await db
      .select()
      .from(whatsappSessions)
      .where(or(eq(whatsappSessions.token, tokenHash), eq(whatsappSessions.id, code)))
      .limit(1);

    if (!session) {
      console.warn(`[WHATSAPP WEBHOOK] Session code ${code} not found in database.`);
      return c.json({
        success: false,
        error: "Verification session not found. Please request a new code from the Whiteroom app.",
      }, 400);
    }

    const sessionPhone = session.phone || undefined;

    if (session.verified) {
      console.warn(`[WHATSAPP WEBHOOK] Session code ${code} is already verified.`);
      return c.json({
        success: false,
        error: "Session already verified. You can proceed to log in on the Whiteroom app.",
        data: { phone: sessionPhone },
      }, 400);
    }

    if (now > session.expiresAt) {
      console.warn(`[WHATSAPP WEBHOOK] Session code ${code} is expired.`);
      return c.json({
        success: false,
        error: "Verification session expired. Please request a new code from the Whiteroom app.",
        data: { phone: sessionPhone },
      }, 400);
    }

    // 🔒 STRICT SECURITY: Enforce that WhatsApp sender phone matches the session phone number
    const rawSenderPhone = parsed.data.phone || from;
    const normalizedSenderPhone = rawSenderPhone ? normalizePhone(rawSenderPhone) : "";
    const isValidSender = isValidIndianPhone(normalizedSenderPhone);

    if (session.phone) {
      const normalizedSessionPhone = normalizePhone(session.phone);

      if (!isValidSender) {
        console.warn(`❌ [WHATSAPP WEBHOOK] Could not extract a valid phone from sender (raw: ${rawSenderPhone}, isLid: ${isLid}).`);
        return c.json({
          success: false,
          error: "Could not verify your phone number from WhatsApp. Please send the message directly from the primary WhatsApp phone associated with your account.",
          data: { phone: sessionPhone },
        }, 400);
      }

      if (normalizedSenderPhone !== normalizedSessionPhone) {
        console.warn(`❌ [WHATSAPP WEBHOOK] Phone mismatch! App entered: ${normalizedSessionPhone}, WhatsApp sender: ${normalizedSenderPhone}`);
        return c.json({
          success: false,
          error: `Phone number mismatch. You entered ${session.phone} in the app, but sent the verification from ${normalizedSenderPhone}. Please send the code from the WhatsApp account for ${session.phone}.`,
          data: { phone: sessionPhone },
        }, 400);
      }
    } else if (isValidSender) {
      // If session had no pre-bound phone, bind to verified sender phone
      session.phone = normalizedSenderPhone;
    } else {
      return c.json({
        success: false,
        error: "Unable to verify sender phone number.",
      }, 400);
    }

    // Update session to verified with verified phone
    await db
      .update(whatsappSessions)
      .set({
        verified: true,
        phone: normalizedSenderPhone || session.phone,
      })
      .where(eq(whatsappSessions.id, session.id));

    console.log(`[WHATSAPP WEBHOOK] Session ${code} successfully verified for phone ${normalizedSenderPhone || session.phone}.`);

    const response: ApiResponse<{ verified: boolean; phone?: string }> = {
      success: true,
      data: {
        verified: true,
        phone: session.phone || undefined,
      },
    };

    return c.json(response, 200);
  } catch (error) {
    console.error("[WHATSAPP WEBHOOK] Error:", error);
    throw error;
  }
}
