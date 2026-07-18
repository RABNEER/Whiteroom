import { db } from "../lib/db.js";
import { getRazorpayClient, verifyRazorpaySignature } from "../lib/razorpay.js";
import { subscriptions, idempotencyKeys, billingTransactions, tenants, students, eq, lt, and, or, sql, desc, count, isNull } from "@whiteroom/db";
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

export async function ensureTenantSubscription(tenantId: string) {
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  if (existingSub) {
    return existingSub;
  }

  const startDate = new Date();
  const [newSub] = await db
    .insert(subscriptions)
    .values({
      tenantId,
      plan: PlanTier.FREE,
      creditsBalance: 100, // 100 free initial credits upon setup
      startDate,
      billingCycleStartDate: startDate,
    })
    .onConflictDoNothing()
    .returning();

  if (newSub) {
    await db.insert(billingTransactions).values({
      tenantId,
      type: "trial_grant",
      creditsChange: 100,
      amountPaise: 0,
      description: "Initial 100 free student credits",
    });
    return newSub;
  }

  const [retrySub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);
  return retrySub;
}

export async function getTenantWalletStatus(tenantId: string) {
  const sub = await ensureTenantSubscription(tenantId);
  const transactions = await db
    .select()
    .from(billingTransactions)
    .where(eq(billingTransactions.tenantId, tenantId))
    .orderBy(desc(billingTransactions.createdAt))
    .limit(50);

  const isActive = !sub?.endDate || sub.endDate >= new Date();

  return {
    ...(sub || {}),
    status: isActive ? "ACTIVE" : "EXPIRED",
    subscription: sub,
    transactions,
  };
}

export async function createRechargeOrder(
  tenantId: string,
  userId: string,
  input: { credits: number }
) {
  if (!input.credits || input.credits < 1 || input.credits > 100000) {
    throw Errors.validation("Credits to recharge must be between 1 and 100,000.");
  }

  // ₹5 per student/credit in paise = 500 paise
  const amountPaise = input.credits * 500;

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    if (env.NODE_ENV === "production") {
      throw Errors.internal("Razorpay credentials are not configured in production");
    }
    console.log(`💳 [PAYMENTS MOCK FALLBACK] Razorpay not configured. Simulating recharge order for Tenant: ${tenantId}`);
    const safeReceipt = (`rc_${tenantId.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}`).slice(0, 40);
    return {
      id: `mock_recharge_${Math.random().toString(36).substring(2, 9)}`,
      amount: amountPaise,
      amountPaise,
      credits: input.credits,
      currency: "INR",
      receipt: safeReceipt,
      paymentUrl: "https://example.com/mock-checkout",
      status: "created",
      notes: {
        tenantId,
        userId,
        credits: String(input.credits),
        type: "recharge",
      },
    };
  }

  const razorpay = getRazorpayClient();
  const safeReceipt = (`rc_${tenantId.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}`).slice(0, 40);
  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: safeReceipt,
    notes: {
      tenantId,
      userId,
      credits: String(input.credits),
      type: "recharge",
    },
  });

  const baseUrl = env.APP_URL || "https://whiteroomapi-production-7011.up.railway.app";
  const checkoutUrl = `${baseUrl}/api/v1/payments/checkout?order_id=${order.id}&amount=${amountPaise}&credits=${input.credits}&key_id=${env.RAZORPAY_KEY_ID || ""}`;

  return {
    ...order,
    credits: input.credits,
    amountPaise,
    paymentUrl: checkoutUrl,
  };
}

export async function completeRechargePayment(
  tenantId: string,
  orderId: string,
  paymentId: string,
  credits: number,
  amountPaise: number
) {
  const sub = await ensureTenantSubscription(tenantId);

  const inserted = await db
    .insert(idempotencyKeys)
    .values({
      tenantId,
      key: `recharge_${orderId}_${paymentId}`,
      scope: "payment.recharge",
      resourceId: orderId,
      response: { processed: true, credits },
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    console.log(`💳 [PAYMENTS IDEMPOTENCY] Recharge ${orderId}/${paymentId} already completed.`);
    return { processed: true, alreadyProcessed: true, subscription: sub };
  }

  const [updatedSub] = await db
    .update(subscriptions)
    .set({
      creditsBalance: sql`${subscriptions.creditsBalance} + ${credits}`,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub?.id ?? ""))
    .returning();

  await db.insert(billingTransactions).values({
    tenantId,
    type: "recharge",
    amountPaise,
    creditsChange: credits,
    description: `Recharged ${credits} credits via Razorpay (${paymentId})`,
  });

  await logAuditEvent({
    tenantId,
    action: "wallet.recharge.completed",
    resource: "subscription",
    resourceId: sub?.id ?? "unknown",
    details: { credits, amountPaise, orderId, paymentId },
  });

  return { processed: true, creditsBalance: updatedSub?.creditsBalance, subscription: updatedSub };
}

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
    const safeReceipt = (`sub_${tenantId.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}`).slice(0, 40);
    return {
      id: `mock_order_${Math.random().toString(36).substring(2, 9)}`,
      amount: catalogEntry.amount,
      currency: catalogEntry.currency,
      receipt: safeReceipt,
      status: "created",
      notes: {
        tenantId,
        userId,
        plan: input.plan,
      },
    };
  }

  const razorpay = getRazorpayClient();
  const safeReceipt = (`sub_${tenantId.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}`).slice(0, 40);
  const order = await razorpay.orders.create({
    amount: catalogEntry.amount,
    currency: catalogEntry.currency,
    receipt: safeReceipt,
    notes: {
      tenantId,
      userId,
      plan: input.plan,
    },
  });

  return order;
}

export async function handleRazorpayWebhook(body: string, signature?: string) {
  if (env.NODE_ENV !== "development" && !verifyRazorpaySignature(body, signature)) {
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
          amount?: number;
          notes?: { tenantId?: string; plan?: string; type?: string; credits?: string };
        };
      };
      order?: {
        entity?: {
          id?: string;
          amount?: number;
          notes?: { tenantId?: string; plan?: string; type?: string; credits?: string };
        };
      };
      payment_link?: {
        entity?: {
          id?: string;
        };
      };
      subscription?: {
        entity?: {
          id?: string;
          status?: string;
          notes?: Record<string, string>;
        };
      };
    };
  };

  const eventId = event.id;
  const payment = event.payload?.payment?.entity;
  const order = event.payload?.order?.entity;
  const paymentLink = event.payload?.payment_link?.entity;
  const subEntity = event.payload?.subscription?.entity;
  const tenantId = payment?.notes?.tenantId ?? order?.notes?.tenantId ?? subEntity?.notes?.tenantId;
  const planKey = payment?.notes?.plan ?? order?.notes?.plan;

  const supportedEvents = [
    "payment.captured",
    "order.paid",
    "payment_link.paid",
    "subscription.authenticated",
    "subscription.activated",
    "subscription.charged",
  ] as const;

  if (!supportedEvents.includes(event.event as any)) {
    return { processed: false };
  }

  // ── Subscription events (autopay) ──────────────────────────────
  if (event.event === "subscription.authenticated" || event.event === "subscription.activated") {
    if (!subEntity?.id || !tenantId) return { processed: false };

    const existingSub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.razorpaySubscriptionId, subEntity.id))
      .limit(1);

    if (existingSub.length === 0) return { processed: false };

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    await db
      .update(subscriptions)
      .set({
        plan: PlanTier.PRO,
        razorpayPaymentId: payment?.id ?? existingSub[0].razorpayPaymentId,
        startDate,
        endDate,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existingSub[0].id));

    await logAuditEvent({
      tenantId,
      action: "subscription.activated.webhook",
      resource: "subscription",
      resourceId: existingSub[0].id,
      details: { event: event.event, subscriptionId: subEntity.id },
    });

    return { processed: true, subscription: existingSub[0] };
  }

  if (event.event === "subscription.charged") {
    if (!subEntity?.id || !tenantId) return { processed: false };

    const existingSub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.razorpaySubscriptionId, subEntity.id))
      .limit(1);

    if (existingSub.length === 0) return { processed: false };

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    await db
      .update(subscriptions)
      .set({
        plan: PlanTier.PRO,
        razorpayPaymentId: payment?.id ?? existingSub[0].razorpayPaymentId,
        startDate,
        endDate,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existingSub[0].id));

    await logAuditEvent({
      tenantId,
      action: "subscription.charged.webhook",
      resource: "subscription",
      resourceId: existingSub[0].id,
      details: { event: event.event, subscriptionId: subEntity.id, paymentId: payment?.id },
    });

    return { processed: true, subscription: existingSub[0] };
  }

  // ── Legacy payment_link.paid ───────────────────────────────────
  if (event.event === "payment_link.paid") {
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

  // ── Recharge order events ──────────────────────────────────────
  const notesType = payment?.notes?.type ?? order?.notes?.type;
  const hasCreditsNote = Boolean(payment?.notes?.credits || order?.notes?.credits);
  if (notesType === "recharge" || hasCreditsNote) {
    if (!tenantId) return { processed: false };
    const creditsStr = payment?.notes?.credits ?? order?.notes?.credits ?? "0";
    const credits = parseInt(creditsStr, 10);
    const amountPaise = payment?.amount ?? (credits * 500);
    const paymentId = payment?.id ?? eventId ?? `webhook_pay_${Date.now()}`;
    const orderId = payment?.order_id ?? order?.id ?? eventId ?? `webhook_order_${Date.now()}`;

    if (credits > 0) {
      return await completeRechargePayment(tenantId, orderId, paymentId, credits, amountPaise);
    }
    return { processed: false };
  }

  // ── Legacy order-based payment events ──────────────────────────
  if (!tenantId || planKey !== SubscriptionPlanKey.PRO_YEARLY) {
    return { processed: false };
  }

  const paymentId = payment?.id ?? null;
  const orderId = payment?.order_id ?? order?.id ?? null;

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

export async function processMonthlyStudentBilling() {
  const allTenants = await db.select().from(tenants);
  let processedCount = 0;
  let totalDeductions = 0;

  for (const tenant of allTenants) {
    const [studentCountResult] = await db
      .select({ value: count() })
      .from(students)
      .where(and(eq(students.tenantId, tenant.id), isNull(students.deletedAt)));
    
    const studentCount = studentCountResult?.value ?? 0;
    if (studentCount <= 0) continue;

    const sub = await ensureTenantSubscription(tenant.id);
    if (!sub) continue;

    const deductionCredits = studentCount;
    const [updatedSub] = await db
      .update(subscriptions)
      .set({
        creditsBalance: sql`${subscriptions.creditsBalance} - ${deductionCredits}`,
        billingCycleStartDate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id))
      .returning();

    await db.insert(billingTransactions).values({
      tenantId: tenant.id,
      type: "usage_deduction",
      amountPaise: 0,
      creditsChange: -deductionCredits,
      description: `Monthly billing for ${studentCount} active students (${deductionCredits} credits deducted)`,
    });

    await logAuditEvent({
      tenantId: tenant.id,
      action: "wallet.usage.deducted",
      resource: "subscription",
      resourceId: sub.id,
      details: {
        studentCount,
        deductionCredits,
        remainingBalance: updatedSub?.creditsBalance ?? 0,
      },
    });

    processedCount++;
    totalDeductions += deductionCredits;
  }

  return { processedTenants: processedCount, totalCreditsDeducted: totalDeductions };
}
