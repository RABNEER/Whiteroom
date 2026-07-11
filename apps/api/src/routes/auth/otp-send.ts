import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { env } from "../../lib/env.js";
import { otpAttempts } from "@whiteroom/db";
import { normalizePhone, isValidIndianPhone, hashSHA256, generateOTP } from "../../lib/otp.js";
import { sendOTP } from "../../lib/msg91.js";
import { Errors, Limits } from "@whiteroom/shared";
import type { ApiResponse, OTPSendResponse } from "@whiteroom/shared";
import { gte, eq, and, count } from "@whiteroom/db";

const sendSchema = z.object({
  phone: z.string().min(10).max(15),
});

function maskPhone(phone: string): string {
  return phone.slice(-4).padStart(phone.length, "*");
}

/**
 * POST /api/v1/auth/otp/send
 *
 * 1. Validate & normalize phone
 * 2. Check rate limit (3/hr per phone)
 * 3. Generate OTP, store hashed in DB
 * 4. Send via MSG91
 */
export async function otpSendHandler(c: Context) {
  const body = await c.req.json();
  const parsed = sendSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const phone = normalizePhone(parsed.data.phone);

  if (!isValidIndianPhone(phone)) {
    throw Errors.validation("Invalid phone number. Expected format: +91 followed by 10 digits.");
  }

  const phoneHash = hashSHA256(phone);

  // â”€â”€â”€ Rate Limit Check & Store OTP in Transaction (Bug 14) â”€â”€â”€
  const otp = generateOTP();
  const otpHash = hashSHA256(otp);
  const expiresAt = new Date(Date.now() + Limits.OTP_EXPIRY_SECONDS * 1000);

  await db.transaction(async (tx) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [result] = await tx
      .select({ total: count() })
      .from(otpAttempts)
      .where(
        and(
          eq(otpAttempts.phoneHash, phoneHash),
          gte(otpAttempts.createdAt, oneHourAgo)
        )
      );

    if (result && result.total >= Limits.OTP_RATE_LIMIT_PER_HOUR) {
      throw Errors.rateLimited(
        `OTP limit reached. Try again after ${Math.ceil((60 * 60 * 1000 - (Date.now() - oneHourAgo.getTime())) / 1000 / 60)} minutes.`
      );
    }

    await tx.insert(otpAttempts).values({
      phoneHash,
      otp: otpHash,
      expiresAt,
    });
  });

  // ——— Send SMS (Bug 7) ———
  let smsSent = true;
  if (!env.TERMUX_SMS_GATEWAY_URL && !env.SMSGATEWAY24_TOKEN && !env.MSG91_API_KEY) {
    console.log(`[AUTH] SMS Send bypassed. OTP for ${maskPhone(phone)}`);
  } else {
    try {
      await sendOTP(phone, otp);
    } catch (err) {
      console.error(`[AUTH] SMS delivery failed for ${maskPhone(phone)}:`, err);
      smsSent = false;
    }
  }

  if (!smsSent) {
    throw Errors.internal("Failed to deliver verification SMS. Please try again later.");
  }

  const response: ApiResponse<OTPSendResponse> = {
    success: true,
    data: {
      sent: true,
      expiresIn: Limits.OTP_EXPIRY_SECONDS,
    },
  };

  return c.json(response, 200);
}
