import type { Context } from "hono";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../../lib/db.js";
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
  try {
    const body = await c.req.json();
    console.log("[WHATSAPP SESSION CREATE] Request received:", { phone: body.phone?.substring(0, 6) + "..." });
    
    const parsed = createSessionSchema.safeParse(body);

    if (!parsed.success) {
      console.error("[WHATSAPP SESSION CREATE] Validation failed:", parsed.error.flatten().fieldErrors);
      throw Errors.validation("Invalid request body", {
        issues: parsed.error.flatten().fieldErrors,
      });
    }

    const phone = normalizePhone(parsed.data.phone);
    console.log("[WHATSAPP SESSION CREATE] Normalized phone:", phone.substring(0, 6) + "...");

    if (!isValidIndianPhone(phone)) {
      console.error("[WHATSAPP SESSION CREATE] Invalid phone format:", phone);
      throw Errors.validation("Invalid phone number. Expected format: +91 followed by 10 digits.");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresIn = 5 * 60;
    
    // Real bot verification is required across all environments for security audit compliance
    const autoVerify = false;
    
    console.log("[WHATSAPP SESSION CREATE] Creating session with auto-verify:", autoVerify);
    
    const [session] = await db
      .insert(whatsappSessions)
      .values({
        token: hashSHA256(token),
        phone: phone, // Store plaintext phone temporarily for auth flow retrieval
        verified: autoVerify,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      })
      .returning({
        id: whatsappSessions.id,
      });

    console.log("[WHATSAPP SESSION CREATE] Session created successfully:", session!.id);

    const response: ApiResponse<WhatsappSessionCreateResponse> = {
      success: true,
      data: {
        id: session!.id,
        token,
        expiresIn,
      },
    };

    return c.json(response, 201);
  } catch (error) {
    console.error("[WHATSAPP SESSION CREATE] Error:", error);
    throw error;
  }
}
