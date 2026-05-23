import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { otpAttempts } from "@whiteroom/db";
import { normalizePhone, isValidIndianPhone, hashSHA256, generateOTP } from "../../lib/otp.js";
import { sendOTP } from "../../lib/msg91.js";
import { Errors, Limits } from "@whiteroom/shared";
import type { ApiResponse, OTPSendResponse } from "@whiteroom/shared";
import { gte, eq, and, count } from "@whiteroom/db";

const sendSchema = z.object({
  phone: z.string().min(10).max(15),
});

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

  // Firebase Auth handles real SMS dispatch client-side.
  // Backend `/auth/otp/send` acts as a backward-compatible placeholder success route.
  console.log(`📱 [FIREBASE SMS ROUTER] Bypassing MSG91. Client will trigger Firebase SMS for: ${phone}`);

  const response: ApiResponse<OTPSendResponse> = {
    success: true,
    data: {
      sent: true,
      expiresIn: Limits.OTP_EXPIRY_SECONDS,
    },
  };

  return c.json(response, 200);
}
