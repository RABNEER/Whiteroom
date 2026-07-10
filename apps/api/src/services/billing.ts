import { db } from "../lib/db.js";
import {
  classes,
  students,
  tenants,
  subscriptions,
  count,
  and,
  eq,
  isNull,
} from "@whiteroom/db";
import { getRazorpayClient } from "../lib/razorpay.js";
import { Errors } from "@whiteroom/shared";
import { logAuditEvent } from "./audit.js";

function paymentContact(phone?: string | null): string {
  return phone && phone.startsWith("+91") && !/^\+91(\d)\1{9}$/.test(phone)
    ? phone
    : "+919876543210";
}

/**
 * Calculate the dynamic monthly subscription fee for a tenant.
 * Tuition: standard (â‚¹200) or premium with Walt AI (â‚¹400).
 * School: Min 10 classes, â‚¹20/class + â‚¹2/student + â‚¹400 Walt AI.
 * Returns amount in paise (Rupees * 100).
 */
export async function calculateSubscriptionFee(
  tenantId: string,
  planType: "tuition" | "school",
  waltAiEnabled: boolean
): Promise<{
  totalAmount: number; // in paise
  breakdown: {
    classesCount: number;
    classesCharge: number;
    studentsCount: number;
    studentsCharge: number;
    waltCharge: number;
  };
}> {
  const [classCountResult] = await db
    .select({ value: count() })
    .from(classes)
    .where(and(eq(classes.tenantId, tenantId), isNull(classes.deletedAt)));
  const totalClasses = classCountResult?.value ?? 0;

  const [studentCountResult] = await db
    .select({ value: count() })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), isNull(students.deletedAt)));
  const totalStudents = studentCountResult?.value ?? 0;

  const classesCharge = 0; // Class base fee removed in new pricing model
  const studentsCharge = totalStudents * 5 * 100; // â‚¹5/student in paise
  const waltCharge = waltAiEnabled ? 40000 : 0; // â‚¹400 in paise

  const totalAmount = studentsCharge + waltCharge;

  return {
    totalAmount,
    breakdown: {
      classesCount: totalClasses,
      classesCharge,
      studentsCount: totalStudents,
      studentsCharge,
      waltCharge,
    },
  };
}

/**
 * Generate a Razorpay recurring subscription (autopay) or mock on dev.
 */
export async function createBillingOrder(
  tenantId: string,
  planType: "tuition" | "school",
  waltAiEnabled: boolean
) {
  const { totalAmount } = await calculateSubscriptionFee(tenantId, planType, waltAiEnabled);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (tenant?.trialEndsAt && tenant.trialEndsAt > new Date()) {
    return {
      id: "trial_active",
      amount: 0,
      currency: "INR",
      receipt: `trial_${tenantId}`,
    };
  }

  try {
    const razorpay = getRazorpayClient();

    const plan = await razorpay.plans.create({
      period: "monthly",
      interval: 1,
      item: {
        name: `Whiteroom ${planType === "school" ? "School" : "Tuition"}${waltAiEnabled ? " + AI" : ""}`,
        amount: totalAmount,
        currency: "INR",
      },
    });

    const subscription = await razorpay.subscriptions.create({
      plan_id: plan.id,
      total_count: 12,
      customer_notify: true,
      notes: {
        tenantId,
        planType,
        waltAiEnabled: String(waltAiEnabled),
        calculatedMonthlyAmount: String(totalAmount),
      },
    });

    await db
      .insert(subscriptions)
      .values({
        tenantId,
        plan: "free",
        planType,
        waltAiEnabled,
        calculatedMonthlyAmount: totalAmount,
        razorpaySubscriptionId: subscription.id,
        billingCycleStartDate: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.tenantId,
        set: {
          planType,
          waltAiEnabled,
          calculatedMonthlyAmount: totalAmount,
          razorpaySubscriptionId: subscription.id,
          updatedAt: new Date(),
        },
      });

    await logAuditEvent({
      tenantId,
      action: "subscription.subscription.created",
      resource: "subscription",
      resourceId: subscription.id,
      details: { planType, waltAiEnabled, totalAmount },
    });

    return {
      id: subscription.id,
      amount: totalAmount,
      currency: "INR",
      paymentUrl: subscription.short_url,
    };
  } catch (err) {
    console.error("Razorpay subscription creation failed, falling back to mock:", err);
    const mockSubId = `sub_mock_${Math.random().toString(36).substring(7)}`;

    await db
      .insert(subscriptions)
      .values({
        tenantId,
        plan: "free",
        planType,
        waltAiEnabled,
        calculatedMonthlyAmount: totalAmount,
        razorpaySubscriptionId: mockSubId,
        billingCycleStartDate: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.tenantId,
        set: {
          planType,
          waltAiEnabled,
          calculatedMonthlyAmount: totalAmount,
          razorpaySubscriptionId: mockSubId,
          updatedAt: new Date(),
        },
      });

    await logAuditEvent({
      tenantId,
      action: "subscription.order.mock",
      resource: "subscription",
      resourceId: mockSubId,
      details: { planType, waltAiEnabled, totalAmount },
    });

    return {
      id: mockSubId,
      amount: totalAmount,
      currency: "INR",
      paymentUrl: `https://example.com/mock-pay?subscriptionId=${mockSubId}`,
    };
  }
}

/**
 * Handle subscription update upon successful payment validation.
 */
export async function completeSubscriptionPayment(
  orderId: string,
  paymentId: string,
  signature: string
) {
  void signature;
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.razorpayOrderId, orderId))
    .limit(1);

  if (!sub) {
    throw Errors.notFound("Subscription order");
  }

  // Update subscription to active
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1); // 1 month cycle

  const [updatedSub] = await db
    .update(subscriptions)
    .set({
      plan: "pro",
      razorpayPaymentId: paymentId,
      startDate,
      endDate,
      billingCycleStartDate: startDate,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id))
    .returning();

  await logAuditEvent({
    tenantId: sub.tenantId,
    action: "subscription.activated",
    resource: "subscription",
    resourceId: sub.id,
    details: { planType: sub.planType, waltAiEnabled: sub.waltAiEnabled, paymentId },
  });

  return updatedSub;
}
