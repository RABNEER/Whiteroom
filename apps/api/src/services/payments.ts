import { db } from "../lib/db.js";
import { getRazorpayClient, verifyRazorpaySignature } from "../lib/razorpay.js";
import { subscriptions, idempotencyKeys, eq, lt, and, or } from "@whiteroom/db";
import { Errors, PlanTier } from "@whiteroom/shared";
import { env } from "../lib/env.js";
import { logAuditEvent } from "./audit.js";

export const SubscriptionPlanKey = {
  PRO_YEARLY: "pro_yearly",
} as const;

export type SubscriptionPlanKey =
  (typeof SubscriptionPlanKey)[keyof typeof SubscriptionPlanKey];

const subscriptionCatalog: Record<
  SubscriptionPlanKey,
  { amount: number; currency: "INR"; plan: string; durationDays: number }
> = {
  [SubscriptionPlanKey.PRO_YEARLY]: {
    amount: 1_500_000, // Razorpay amount in paise: INR 15,000/year
    currency: "INR",
    plan: PlanTier.PRO,
    durationDays: 365,
  },
};

export async function createSubscriptionOrder(
  tenantId: string,
  userId: string,
  input: { plan: SubscriptionPlanKey }
) {
  const catalogEntry = subscriptionCatalog[input.plan];
  if (!catalogEntry) {
    throw Errors.validation("Unsupported subscription plan.");
  }

  // Gracefully fallback to simulated mock order if credentials are not set
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    if (env.NODE_ENV === "production") {
      throw Errors.internal("Razorpay credentials are not configured in production");
    }
    console.log(`💳 [PAYMENTS MOCK FALLBACK] Razorpay not configured. Simulating order for Tenant: ${tenantId}`);
    return {
      id: `mock_order_${Math.random().toString(36).substring(2, 9)}`,
      amount: catalogEntry.amount,
      currency: catalogEntry.currency,
      receipt: `tenant_${tenantId}_${Date.now()}`,
      status: "created",
      notes: {
        tenantId,
        userId,
        plan: input.plan,
      },
    };
  }

  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount: catalogEntry.amount,
    currency: catalogEntry.currency,
    receipt: `tenant_${tenantId}_${Date.now()}`,
    notes: {
      tenantId,
      userId,
      plan: input.plan,
    },
  });

  return order;
}

export async function handleRazorpayWebhook(body: string, signature?: string) {
  if (!verifyRazorpaySignature(body, signature)) {
    throw Errors.validation(
      "Invalid Razorpay webhook signature"
    );
  }

  const event = JSON.parse(body) as {
    id?: string;
    event?: string;
    payload?: {
      payment?: {
        entity?: {
          id?: string;
          order_id?: string;
          notes?: { tenantId?: string; plan?: string };
        };
      };
      order?: {
        entity?: {
          id?: string;
          notes?: { tenantId?: string; plan?: string };
        };
      };
      payment_link?: {
        entity?: {
          id?: string;
        };
      };
    };
  };

  const eventId = event.id;
  const payment = event.payload?.payment?.entity;
  const order = event.payload?.order?.entity;
  const paymentLink = event.payload?.payment_link?.entity;
  const tenantId = payment?.notes?.tenantId ?? order?.notes?.tenantId;
  const planKey = payment?.notes?.plan ?? order?.notes?.plan;

  if (!["payment.captured", "order.paid", "payment_link.paid"].includes(event.event ?? "")) {
    return { processed: false };
  }

  if (event.event === "payment_link.paid") {
    // payment_link.paid: find subscription by payment link ID, then update with actual order
    if (paymentLink?.id) {
      const existingSub = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.razorpayOrderId, paymentLink.id))
        .limit(1);

      if (existingSub.length > 0) {
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 365);

        await db
          .update(subscriptions)
          .set({
            plan: PlanTier.PRO,
            razorpayOrderId: payment?.order_id ?? paymentLink.id,
            razorpayPaymentId: payment?.id ?? null,
            startDate,
            endDate,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.tenantId, existingSub[0].tenantId));

        await logAuditEvent({
          tenantId: existingSub[0].tenantId,
          action: "subscription.activated.webhook",
          resource: "subscription",
          resourceId: existingSub[0].id,
          details: { source: "payment_link.paid", paymentLinkId: paymentLink.id, paymentId: payment?.id },
        });

        return { processed: true, subscription: existingSub[0] };
      }
    }
    return { processed: false };
  }

  if (!tenantId || planKey !== SubscriptionPlanKey.PRO_YEARLY) {
    return { processed: false };
  }

  const paymentId = payment?.id ?? null;
  const orderId = payment?.order_id ?? order?.id ?? null;

  // 1. Webhook Event ID replay check — single atomic INSERT with ON CONFLICT
  if (eventId) {
    const inserted = await db
      .insert(idempotencyKeys)
      .values({
        tenantId,
        key: eventId,
        scope: "webhook.razorpay",
        resourceId: orderId ?? "unknown",
        response: { processed: true },
      })
      .onConflictDoNothing()
      .returning();

    if (inserted.length === 0) {
      console.log(`💳 [PAYMENTS IDEMPOTENCY] Webhook event ${eventId} already processed (unique constraint).`);
      return { processed: true, alreadyProcessed: true };
    }
  }

  // 2. Razorpay Order/Payment ID duplicate check
  if (paymentId || orderId) {
    const conditions: any[] = [];
    if (paymentId) conditions.push(eq(subscriptions.razorpayPaymentId, paymentId));
    if (orderId) conditions.push(eq(subscriptions.razorpayOrderId, orderId));

    if (conditions.length > 0) {
      const existing = await db
        .select()
        .from(subscriptions)
        .where(conditions.length === 1 ? conditions[0] : or(...conditions))
        .limit(1);

      if (existing.length > 0) {
        console.log(`💳 [PAYMENTS IDEMPOTENCY] Order/Payment already processed for order: ${orderId}, payment: ${paymentId}`);
        return { processed: true, alreadyProcessed: true, subscription: existing[0] };
      }
    }
  }

  const catalogEntry = subscriptionCatalog[planKey];

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + catalogEntry.durationDays);

  const [subscription] = await db
    .insert(subscriptions)
    .values({
      tenantId,
      plan: catalogEntry.plan,
      razorpayOrderId: payment?.order_id ?? order?.id ?? null,
      razorpayPaymentId: payment?.id ?? null,
      startDate,
      endDate,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.tenantId,
      set: {
        plan: catalogEntry.plan,
        razorpayOrderId: payment?.order_id ?? order?.id ?? null,
        razorpayPaymentId: payment?.id ?? null,
        startDate,
        endDate,
        updatedAt: new Date(),
      },
    })
    .returning();

  await logAuditEvent({
    tenantId,
    action: "subscription.activated.webhook",
    resource: "subscription",
    resourceId: subscription.id,
    details: { event: event.event, paymentId, orderId, plan: catalogEntry.plan },
  });

  return { processed: true, subscription };
}

export async function downgradeExpiredSubscriptions() {
  const now = new Date();
  // Enforce optimized single batched query to avoid N+1 queries (Finding 5 in plan 4)
  const result = await db
    .update(subscriptions)
    .set({
      plan: PlanTier.FREE,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(subscriptions.plan, PlanTier.PRO),
        lt(subscriptions.endDate, now)
      )
    )
    .returning();

  for (const sub of result) {
    await logAuditEvent({
      tenantId: sub.tenantId,
      action: "subscription.downgraded",
      resource: "subscription",
      resourceId: sub.id,
      details: { reason: "expired", previousEndDate: sub.endDate },
    });
  }

  return { downgraded: result.length };
}
