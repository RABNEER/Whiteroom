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
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const [session] = await db
    .select()
    .from(whatsappSessions)
    .where(eq(whatsappSessions.id, parsed.data.id))
    .limit(1);

  if (!session) {
    throw Errors.notFound("Verification session");
  }

  if (session.expiresAt <= new Date()) {
    throw new AppError(
      ErrorCode.OTP_EXPIRED,
      "Verification session has expired. Please try again.",
      401
    );
  }

  if (session.token !== hashSHA256(parsed.data.token)) {
    throw new AppError(
      ErrorCode.INVALID_OTP,
      "Invalid verification token.",
      401
    );
  }

  if (!session.verified) {
    throw new AppError(
      ErrorCode.INVALID_OTP,
      "Verification is still pending.",
      409
    );
  }

  if (!session.phone) {
    throw Errors.validation("Verification session is missing phone context.");
  }

  return completeVerifiedPhoneAuth(c, {
    phoneHash: session.phone,
    firebaseUid: "whatsapp-session",
    inviteCode: parsed.data.inviteCode,
  });
}
