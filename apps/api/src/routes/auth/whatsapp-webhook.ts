import type { Context } from "hono";
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
    const configSecret = env.WHATSAPP_WEBHOOK_SECRET || "whiteroom-whatsapp-bot-internal-secret";
    const defaultSecret = "whiteroom-whatsapp-bot-internal-secret";
    // Allow loopback/internal requests without secret check
    const clientIp = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "";
    const isLoopback = clientIp === "" || clientIp === "127.0.0.1" || clientIp === "::1" || clientIp.startsWith("::ffff:127.");

    if (!isLoopback && secret && secret !== configSecret && secret !== defaultSecret) {
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

    const queryConditions = [
      or(eq(whatsappSessions.token, tokenHash), eq(whatsappSessions.id, code)),
      eq(whatsappSessions.verified, false),
      gte(whatsappSessions.expiresAt, now),
    ];

    const isRawLid = isLid || from.length > 13 || !from.startsWith("91");
    const phoneToMatch = parsed.data.phone || (isRawLid ? undefined : normalizePhone(from));

    if (phoneToMatch) {
      if (!isValidIndianPhone(phoneToMatch)) {
        return c.json({
          success: false,
          error: "Invalid phone number format. Only Indian numbers (+91) are supported.",
        }, 400);
      }

      queryConditions.push(eq(whatsappSessions.phone, phoneToMatch));
    } else {
      console.log(`[WHATSAPP WEBHOOK] Verifying session ${code} via LID match (${from}) based on valid session code.`);
    }

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
        error: "Verification session not found. Please request a new code.",
      }, 400);
    }

    const sessionPhone = session.phone || undefined;

    if (session.verified) {
      console.warn(`[WHATSAPP WEBHOOK] Session code ${code} is already verified.`);
      return c.json({
        success: false,
        error: "Session already verified. You can proceed to log in.",
        data: { phone: sessionPhone },
      }, 400);
    }

    if (now > session.expiresAt) {
      console.warn(`[WHATSAPP WEBHOOK] Session code ${code} is expired.`);
      return c.json({
        success: false,
        error: "Verification session expired. Please request a new code.",
        data: { phone: sessionPhone },
      }, 400);
    }

    if (session.phone) {
      const normalizedSessionPhone = normalizePhone(session.phone);
      const rawSenderPhone = parsed.data.phone || (from && from.startsWith("91") ? from : undefined);
      const senderPhone = rawSenderPhone ? normalizePhone(rawSenderPhone) : null;

      if (senderPhone && senderPhone !== normalizedSessionPhone) {
        console.warn(`[WHATSAPP WEBHOOK] Phone mismatch for session ${code}. Entered in App: ${session.phone}, Sent from WhatsApp: ${senderPhone}`);
        return c.json({
          success: false,
          error: `Phone number mismatch. You entered ${session.phone} in the app, but sent the verification from ${senderPhone}. Please use the matching WhatsApp account.`,
          data: { phone: sessionPhone },
        }, 400);
      }
    }

    // Update session to verified
    await db
      .update(whatsappSessions)
      .set({
        verified: true,
      })
      .where(eq(whatsappSessions.id, session.id));

    console.log(`[WHATSAPP WEBHOOK] Session ${code} successfully verified.`);

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
