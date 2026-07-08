import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { hashSHA256 } from "../../lib/otp.js";
import { completeVerifiedPhoneAuth } from "../../lib/phone-auth.js";
import { whatsappSessions, eq } from "@whiteroom/db";
import { AppError, ErrorCode, Errors } from "@whiteroom/shared";

const verifySchema = z.object({
  id: z.string().min(1),
  token: z.string().min(1),
  inviteCode: z.string().length(6).optional(),
});

export async function whatsappVerifyHandler(c: Context) {
  const body = await c.req.json();
  const parsed = verifySchema.safeParse(body);

  if (!parsed.success) {
    console.error("[WHATSAPP VERIFY] Validation failed:", parsed.error.flatten().fieldErrors);
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  console.log("[WHATSAPP VERIFY] Looking up session:", parsed.data.id);

  const [session] = await db
    .select()
    .from(whatsappSessions)
    .where(eq(whatsappSessions.id, parsed.data.id))
    .limit(1);

  if (!session) {
    console.error("[WHATSAPP VERIFY] Session not found:", parsed.data.id);
    throw Errors.notFound("Verification session");
  }

  console.log("[WHATSAPP VERIFY] Session found:", {
    id: session.id,
    verified: session.verified,
    expired: session.expiresAt <= new Date(),
    hasPhone: !!session.phone,
  });

  if (session.expiresAt <= new Date()) {
    console.error("[WHATSAPP VERIFY] Session expired:", session.id);
    throw new AppError(
      ErrorCode.OTP_EXPIRED,
      "Verification session has expired. Please try again.",
      401
    );
  }

  const tokenHash = hashSHA256(parsed.data.token);
  if (session.token !== tokenHash) {
    console.error("[WHATSAPP VERIFY] Token mismatch:", {
      sessionId: session.id,
      providedHash: tokenHash.substring(0, 10) + "...",
      storedHash: session.token.substring(0, 10) + "...",
    });
    throw new AppError(
      ErrorCode.INVALID_OTP,
      "Invalid verification token.",
      401
    );
  }

  if (!session.verified) {
    console.error("[WHATSAPP VERIFY] Session not verified yet:", session.id);
    throw new AppError(
      ErrorCode.INVALID_OTP,
      "Verification is still pending. Please wait for WhatsApp confirmation.",
      409
    );
  }

  if (!session.phone) {
    console.error("[WHATSAPP VERIFY] Session missing phone:", session.id);
    throw Errors.validation("Verification session is missing phone context.");
  }

  console.log("[WHATSAPP VERIFY] Success! Completing auth for session:", session.id);
  
  const phone = session.phone!;
  const phoneHash = hashSHA256(phone);

  return completeVerifiedPhoneAuth(c, {
    phone,
    phoneHash,
    firebaseUid: `whatsapp-${session.id}`,
    inviteCode: parsed.data.inviteCode,
  });
}
