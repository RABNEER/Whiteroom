import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { UserRole } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import type { JWTPayload, ApiResponse } from "@whiteroom/shared";
import { db } from "../../lib/db.js";
import { tenants, subscriptions, eq } from "@whiteroom/db";
import {
  calculateSubscriptionFee,
  createBillingOrder,
} from "../../services/billing.js";

const billingRoutes = new Hono<{ Variables: { user: JWTPayload } }>();

const subscribeSchema = z.object({
  planType: z.enum(["tuition", "school"], {
    message: "planType must be 'tuition' or 'school'",
  }),
  waltAiEnabled: z.boolean().optional().default(false),
});

// Webhook consolidated into /api/v1/payments/webhook — removed duplicate here

// GET /api/v1/billing/dashboard
billingRoutes.get("/dashboard", authMiddleware, requireRole(UserRole.SCHOOL_ADMIN), async (c) => {
  const user = c.get("user") as JWTPayload;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, user.tenantId))
    .limit(1);

  if (!tenant) {
    throw Errors.notFound("Tenant");
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, user.tenantId))
    .limit(1);

  const planType = sub?.planType || (user.role === UserRole.SCHOOL_ADMIN ? "school" : "tuition");
  const waltAiEnabled = sub?.waltAiEnabled || false;

  const { totalAmount, breakdown } = await calculateSubscriptionFee(
    user.tenantId,
    planType as "tuition" | "school",
    waltAiEnabled
  );

  const trialActive = tenant.trialEndsAt ? tenant.trialEndsAt > new Date() : false;

  const response: ApiResponse = {
    success: true,
    data: {
      tenantName: tenant.name,
      plan: sub?.plan || "free",
      planType,
      waltAiEnabled,
      totalMonthlyPaise: totalAmount,
      trialActive,
      trialEndsAt: tenant.trialEndsAt,
      breakdown,
      subscriptionActive: sub ? sub.plan === "pro" : false,
      startDate: sub?.startDate,
      endDate: sub?.endDate,
    },
  };

  return c.json(response, 200);
});

// 3. POST /api/v1/billing/subscribe
billingRoutes.post("/subscribe", authMiddleware, requireRole(UserRole.SCHOOL_ADMIN), async (c) => {
  const user = c.get("user") as JWTPayload;
  const parsed = subscribeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw Errors.validation("Invalid request", parsed.error.flatten().fieldErrors);
  }

  const order = await createBillingOrder(
    user.tenantId,
    parsed.data.planType,
    parsed.data.waltAiEnabled
  );

  const response: ApiResponse = {
    success: true,
    data: order,
  };

  return c.json(response, 201);
});

export { billingRoutes };
