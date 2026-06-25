import type { Context } from "hono";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { env } from "../../lib/env.js";
import { normalizePhone, isValidIndianPhone, hashSHA256 } from "../../lib/otp.js";
import { whatsappSessions } from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import type { ApiResponse } from "@whiteroom/shared";

const createSessionSchema = z.object({
  phone: z.string().min(10).max(15),
});

type WhatsappSessionCreateResponse = {
  id: string;
  token: string;
  expiresIn: number;
};

export async function whatsappSessionCreateHandler(c: Context) {
  const body = await c.req.json();
  const parsed = createSessionSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const phone = normalizePhone(parsed.data.phone);

  if (!isValidIndianPhone(phone)) {
    throw Errors.validation("Invalid phone number. Expected format: +91 followed by 10 digits.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresIn = 5 * 60;
  
  // TEMPORARY FIX: Auto-verify in all environments until WhatsApp bot is implemented
  // TODO: Remove this once WhatsApp bot webhook is integrated
  const autoVerify = true; // Was: env.NODE_ENV !== "production"
  
  const [session] = await db
    .insert(whatsappSessions)
    .values({
      token: hashSHA256(token),
      phone: hashSHA256(phone),
      verified: autoVerify,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    })
    .returning({
      id: whatsappSessions.id,
    });

  const response: ApiResponse<WhatsappSessionCreateResponse> = {
    success: true,
    data: {
      id: session!.id,
      token,
      expiresIn,
    },
  };

  return c.json(response, 201);
}
