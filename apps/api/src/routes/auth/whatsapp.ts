import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "../../lib/db.js";
import { env } from "../../lib/env.js";
import {
  whatsappSessions,
  users,
  tenants,
  userTenants,
  parentProfiles,
  consentLogs,
  registrationTokens,
  eq,
  and,
  gte,
} from "@whiteroom/db";
import {
  normalizePhone,
  isValidIndianPhone,
  hashSHA256,
} from "../../lib/otp.js";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import {
  Errors,
  AppError,
  ErrorCode,
  UserRole,
  PlanTier,
} from "@whiteroom/shared";
import type { ApiResponse } from "@whiteroom/shared";

const whatsappRoutes = new Hono();

// Helper to generate a unique random 4-character code (WH-XXXX)
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing letters/digits
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `WH-${code}`;
}

const sessionLimiter = rateLimitMiddleware({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 session creations per hour per IP to prevent spam
});

const sessionSchema = z.object({
  phone: z.string().min(10).max(15),
});

// 1. POST /api/v1/auth/whatsapp/session
whatsappRoutes.post("/session", sessionLimiter, async (c: Context) => {
  const body = await c.req.json();
  const parsed = sessionSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!isValidIndianPhone(phone)) {
    throw Errors.validation("Invalid phone number format. Only Indian numbers (+91) are supported.");
  }

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Valid for 5 minutes
  const token = crypto.randomUUID();
  let id = "";
  let inserted = false;
  let attempts = 0;

  while (!inserted && attempts < 5) {
    id = generateCode();
    try {
      await db.insert(whatsappSessions).values({
        id,
        token,
        phone,
        expiresAt,
        verified: false,
      });
      inserted = true;
    } catch {
      attempts++;
    }
  }

  if (!inserted) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      "Failed to generate a unique session code. Please try again.",
      500
    );
  }

  const response: ApiResponse<{ id: string; token: string; expiresIn: number }> = {
    success: true,
    data: {
      id,
      token,
      expiresIn: 300, // 5 minutes in seconds
    },
  };

  return c.json(response, 201);
});

// 2. GET /api/v1/auth/whatsapp/session/:id
whatsappRoutes.get("/session/:id", async (c: Context) => {
  const id = (c.req.param("id") || "").toUpperCase();

  const [session] = await db
    .select()
    .from(whatsappSessions)
    .where(eq(whatsappSessions.id, id))
    .limit(1);

  if (!session) {
    throw Errors.notFound("Verification session");
  }

  const now = new Date();
  const isExpired = session.expiresAt < now;

  const response: ApiResponse<{ verified: boolean; isExpired: boolean }> = {
    success: true,
    data: {
      verified: (session.verified || env.ENABLE_DEV_BYPASS === "true") && !isExpired,
      isExpired,
    },
  };

  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  return c.json(response, 200);
});

// Internal endpoint for WhatsApp bot to retrieve the registered phone of a pending session
whatsappRoutes.get("/session/:id/phone", async (c: Context) => {
  const secret = c.req.header("x-webhook-secret");
  const configSecret = env.WHATSAPP_WEBHOOK_SECRET;

  if (!configSecret) {
    console.error("❌ [WHATSAPP] WHATSAPP_WEBHOOK_SECRET is not configured in .env");
    throw Errors.unauthorized("Webhook secret not configured on server");
  }

  if (secret !== configSecret) {
    throw Errors.unauthorized("Invalid webhook secret");
  }

  const id = (c.req.param("id") || "").toUpperCase();
  const now = new Date();

  const [session] = await db
    .select()
    .from(whatsappSessions)
    .where(
      and(
        eq(whatsappSessions.id, id),
        eq(whatsappSessions.verified, false),
        gte(whatsappSessions.expiresAt, now)
      )
    )
    .limit(1);

  if (!session) {
    throw Errors.notFound("Active verification session");
  }

  const response: ApiResponse<{ phone: string }> = {
    success: true,
    data: {
      phone: session.phone ?? "",
    },
  };

  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  return c.json(response, 200);
});


// 3. POST /api/v1/auth/whatsapp/webhook
const webhookSchema = z.object({
  from: z.string().min(1),
  text: z.string().min(1),
});

whatsappRoutes.post("/webhook", async (c: Context) => {
  const secret = c.req.header("x-webhook-secret");
  const configSecret = env.WHATSAPP_WEBHOOK_SECRET;

  if (!configSecret) {
    console.error("❌ [WHATSAPP WEBHOOK] WHATSAPP_WEBHOOK_SECRET is not configured in .env");
    throw Errors.unauthorized("Webhook secret not configured on server");
  }

  if (secret !== configSecret) {
    throw Errors.unauthorized("Invalid webhook secret");
  }

  const body = await c.req.json();
  const parsed = webhookSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Invalid webhook payload", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const { from, text } = parsed.data;
  const match = text.match(/WH-[A-Z0-9]{4}/i);

  if (!match) {
    return c.json(
      {
        success: false,
        error: "No valid session code found in message",
      },
      400
    );
  }

  const code = match[0].toUpperCase();
  const now = new Date();

  const phone = normalizePhone(from);
  if (!isValidIndianPhone(phone)) {
    return c.json(
      {
        success: false,
        error: "Invalid phone number format. Only Indian numbers (+91) are supported.",
      },
      400
    );
  }

  // Find active, unverified session with matching phone number to prevent session fixation
  const [session] = await db
    .select()
    .from(whatsappSessions)
    .where(
      and(
        eq(whatsappSessions.id, code),
        eq(whatsappSessions.phone, phone),
        eq(whatsappSessions.verified, false),
        gte(whatsappSessions.expiresAt, now)
      )
    )
    .limit(1);

  if (!session) {
    console.warn(`⚠️ [WHATSAPP WEBHOOK] Session code ${code} not active, already verified, expired, or phone mismatch for sender: ${phone}.`);
    return c.json(
      {
        success: false,
        error: "Verification session not active, already verified, or expired",
      },
      400
    );
  }

  // Update session
  await db
    .update(whatsappSessions)
    .set({
      verified: true,
    })
    .where(eq(whatsappSessions.id, code));

  console.log(`✅ [WHATSAPP WEBHOOK] Session ${code} verified for phone: ${phone}`);

  return c.json({ success: true }, 200);
});

// 4. POST /api/v1/auth/whatsapp/verify
const verifySchema = z.object({
  id: z.string().min(1),
  token: z.string().min(1),
  inviteCode: z.string().length(6).optional(),
});

whatsappRoutes.post("/verify", async (c: Context) => {
  const body = await c.req.json();
  const parsed = verifySchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const { id, token, inviteCode } = parsed.data;
  const now = new Date();

  // Fetch session
  const [session] = await db
    .select()
    .from(whatsappSessions)
    .where(
      and(
        eq(whatsappSessions.id, id.toUpperCase()),
        eq(whatsappSessions.token, token)
      )
    )
    .limit(1);

  if (!session) {
    throw new AppError(
      ErrorCode.INVALID_OTP,
      "Invalid verification session or token.",
      401
    );
  }

  if (session.expiresAt < now) {
    throw new AppError(
      ErrorCode.OTP_EXPIRED,
      "Verification session has expired. Please try again.",
      401
    );
  }

  const isDevBypass = env.ENABLE_DEV_BYPASS === "true";
  if (!isDevBypass && (!session.verified || !session.phone)) {
    throw new AppError(
      ErrorCode.INVALID_OTP,
      "Verification session is not yet verified. Please send the WhatsApp message first.",
      401
    );
  }

  if (!session.phone) {
    throw new AppError(
      ErrorCode.INVALID_OTP,
      "Verification session phone number missing.",
      400
    );
  }

  const phone = session.phone as string;

  // ─── Find or Create User (similar to otp-verify.ts) ───
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (!existingUser) {
    // New user path: return registration token
    const registrationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(registrationTokens).values({
      id: registrationToken,
      phone,
      firebaseUid: "whatsapp-bot",
      expiresAt,
    });

    const response: ApiResponse<any> = {
      success: true,
      data: {
        type: "new_user",
        registrationToken,
      },
    };

    return c.json(response, 200);
  }

  // Returning user path
  const userId = existingUser.id;
  let tenantId = "";
  let role = "";
  const isNewUser = false;

  if (inviteCode) {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.inviteCode, inviteCode))
      .limit(1);

    if (!tenant) {
      throw Errors.notFound("Invite code");
    }

    // Link user to new tenant if not mapped
    const [existingMapping] = await db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenant.id)))
      .limit(1);

    if (!existingMapping) {
      await db.transaction(async (tx) => {
        // Deactivate active status on other tenant mappings
        await tx
          .update(userTenants)
          .set({ activeTenant: false })
          .where(eq(userTenants.userId, userId));

        // Insert new active tenant mapping
        await tx.insert(userTenants).values({
          userId,
          tenantId: tenant.id,
          role: UserRole.PARENT,
          status: "active",
          activeTenant: true,
        });

        // Insert profile
        await tx.insert(parentProfiles).values({
          userId,
          tenantId: tenant.id,
        });

        // Consent log
        await tx.insert(consentLogs).values({
          userId,
          tenantId: tenant.id,
          consentType: "data_processing",
          ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
          userAgent: c.req.header("user-agent") ?? null,
        });
      });
    } else {
      // Set as active
      await db.transaction(async (tx) => {
        await tx
          .update(userTenants)
          .set({ activeTenant: false })
          .where(eq(userTenants.userId, userId));
        await tx
          .update(userTenants)
          .set({ activeTenant: true })
          .where(eq(userTenants.id, existingMapping.id));
      });
    }

    tenantId = tenant.id;
    role = UserRole.PARENT;
  } else {
    // Standard login resolve
    const userMappings = await db
      .select()
      .from(userTenants)
      .where(eq(userTenants.userId, userId));

    if (userMappings.length === 0) {
      const tId = existingUser.tenantId ?? "";
      const r = existingUser.role;
      if (tId) {
        await db
          .insert(userTenants)
          .values({
            userId,
            tenantId: tId,
            role: r,
            status: "active",
            activeTenant: true,
          });
        tenantId = tId;
        role = r;
      } else {
        tenantId = "";
        role = r;
      }
    } else {
      const activeMapping = userMappings.find((m) => m.activeTenant) ?? userMappings[0];
      tenantId = activeMapping.tenantId;
      role = activeMapping.role;
    }
  }

  // Resolve all mappings for JWT payload
  const userTenantRecords = await db
    .select({
      tenantId: userTenants.tenantId,
      role: userTenants.role,
      status: userTenants.status,
      tenantName: tenants.name,
    })
    .from(userTenants)
    .innerJoin(tenants, eq(userTenants.tenantId, tenants.id))
    .where(eq(userTenants.userId, userId));

  const tenantsPayload = userTenantRecords.map((r) => ({
    tenantId: r.tenantId,
    role: r.role,
    status: r.status,
  }));

  const jwtPayload = {
    userId,
    tenantId,
    role,
    plan: PlanTier.FREE,
    activeTenantId: tenantId,
    tenants: tenantsPayload,
  };

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(jwtPayload),
    signRefreshToken(jwtPayload),
  ]);

  // Update refresh token hash
  await db
    .update(users)
    .set({
      refreshToken: hashSHA256(refreshToken),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  const response: ApiResponse<any> = {
    success: true,
    data: {
      type: "existing_user",
      accessToken,
      refreshToken,
      user: {
        id: userId,
        role,
        tenantId,
        tenants: userTenantRecords.map((r) => ({
          tenantId: r.tenantId,
          role: r.role,
          status: r.status,
          tenantName: r.tenantName,
        })),
      },
      isNewUser,
    },
  };

  return c.json(response, 200);
});

export { whatsappRoutes };
