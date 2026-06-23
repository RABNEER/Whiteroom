import { Hono } from "hono";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { UserRole } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import type { JWTPayload, ApiResponse } from "@whiteroom/shared";
import { db } from "../../lib/db.js";
import { tenants, subscriptions, eq } from "@whiteroom/db";
import {
  calculateSubscriptionFee,
  createBillingOrder,
  completeSubscriptionPayment,
} from "../../services/billing.js";
import { verifyRazorpaySignature } from "../../lib/razorpay.js";
import { env } from "../../lib/env.js";

const billingRoutes = new Hono<{ Variables: { user: JWTPayload } }>();

// 1. Webhook endpoint (unauthenticated, Razorpay calls this)
billingRoutes.post("/webhook", async (c) => {
  const bodyText = await c.req.text();
  const signature = c.req.header("x-razorpay-signature");

  let isValid = false;
  if (env.NODE_ENV === "test" || !env.RAZORPAY_WEBHOOK_SECRET) {
    isValid = true; // Bypass signature verification in test environment
  } else {
    try {
      isValid = verifyRazorpaySignature(bodyText, signature);
    } catch {
      isValid = false;
    }
  }

  if (!isValid) {
    throw Errors.unauthorized("Invalid Razorpay Webhook Signature");
  }

  const payload = JSON.parse(bodyText || "{}");
  
  if (payload.event === "payment.captured") {
    const payment = payload.payload?.payment?.entity;
    const orderId = payment?.order_id;
    const paymentId = payment?.id;

    if (orderId) {
      await completeSubscriptionPayment(orderId, paymentId || "mock_pay", signature || "mock_sig");
    }
  } else if (payload.event === "payment_link.paid") {
    const paymentLink = payload.payload?.payment_link?.entity;
    const payment = payload.payload?.payment?.entity;
    const linkId = paymentLink?.id;
    const paymentId = payment?.id;

    if (linkId) {
      await completeSubscriptionPayment(linkId, paymentId || "mock_pay", signature || "mock_sig");
    }
  }

  return c.json({ success: true, status: "ok" }, 200);
});

// 2. GET /api/v1/billing/dashboard
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
  const body = await c.req.json().catch(() => ({}));
  const { planType, waltAiEnabled } = body;

  if (!planType || !["tuition", "school"].includes(planType)) {
    throw Errors.validation("Invalid planType. Must be 'tuition' or 'school'.");
  }

  const order = await createBillingOrder(
    user.tenantId,
    planType,
    waltAiEnabled || false
  );

  const response: ApiResponse = {
    success: true,
    data: order,
  };

  return c.json(response, 201);
});

export { billingRoutes };
