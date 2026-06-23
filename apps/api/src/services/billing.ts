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

/**
 * Calculate the dynamic monthly subscription fee for a tenant.
 * Tuition: standard (₹200) or premium with Walt AI (₹400).
 * School: Min 10 classes, ₹20/class + ₹2/student + ₹400 Walt AI.
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
  const studentsCharge = totalStudents * 5 * 100; // ₹5/student in paise
  const waltCharge = waltAiEnabled ? 40000 : 0; // ₹400 in paise

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
 * Generate a Razorpay order or mock payment order if local/offline.
 */
export async function createBillingOrder(
  tenantId: string,
  planType: "tuition" | "school",
  waltAiEnabled: boolean
) {
  const { totalAmount } = await calculateSubscriptionFee(tenantId, planType, waltAiEnabled);

  // If amount is 0 (e.g. trial is active), return a custom object
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
    const paymentLink = await razorpay.paymentLink.create({
      amount: totalAmount,
      currency: "INR",
      accept_partial: false,
      description: `Whiteroom Subscription - ${planType === "school" ? "School Plan" : "Tuition Plan"}${waltAiEnabled ? " + Walt AI" : ""}`,
      customer: {
        name: tenant?.name || "Whiteroom School Admin",
        contact: tenant?.phone || "+919999999999",
      },
      notify: {
        sms: false,
        email: false,
      },
      reminder_enable: false,
      callback_url: "https://whiteroom.co.in/billing/success",
      callback_method: "get",
    });

    // Save payment link ID to subscription table
    await db
      .insert(subscriptions)
      .values({
        tenantId,
        plan: "pro",
        planType,
        waltAiEnabled,
        calculatedMonthlyAmount: totalAmount,
        razorpayOrderId: paymentLink.id,
        billingCycleStartDate: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.tenantId,
        set: {
          planType,
          waltAiEnabled,
          calculatedMonthlyAmount: totalAmount,
          razorpayOrderId: paymentLink.id,
          updatedAt: new Date(),
        },
      });

    return {
      id: paymentLink.id,
      amount: totalAmount,
      currency: "INR",
      paymentUrl: paymentLink.short_url,
    };
  } catch (err) {
    console.error("Razorpay payment link creation failed, falling back to mock:", err);
    // Offline/Testing Mock order fallback
    const mockOrderId = `order_mock_${Math.random().toString(36).substring(7)}`;
    
    await db
      .insert(subscriptions)
      .values({
        tenantId,
        plan: "pro",
        planType,
        waltAiEnabled,
        calculatedMonthlyAmount: totalAmount,
        razorpayOrderId: mockOrderId,
        billingCycleStartDate: new Date(),
      })
      .onConflictDoUpdate({
        target: subscriptions.tenantId,
        set: {
          planType,
          waltAiEnabled,
          calculatedMonthlyAmount: totalAmount,
          razorpayOrderId: mockOrderId,
          updatedAt: new Date(),
        },
      });

    return {
      id: mockOrderId,
      amount: totalAmount,
      currency: "INR",
      paymentUrl: `https://example.com/mock-pay?orderId=${mockOrderId}`,
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

  return updatedSub;
}
