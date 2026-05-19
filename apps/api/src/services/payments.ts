import { db } from "../lib/db.js";
import { getRazorpayClient, verifyRazorpaySignature } from "../lib/razorpay.js";
import { subscriptions } from "@whiteroom/db";
import { Errors, PlanTier } from "@whiteroom/shared";
import { eq } from "drizzle-orm";

export async function createSubscriptionOrder(
  tenantId: string,
  userId: string,
  input: { amount: number; currency?: string }
) {
  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.create({
    amount: input.amount,
    currency: input.currency ?? "INR",
    receipt: `tenant_${tenantId}_${Date.now()}`,
    notes: {
      tenantId,
      userId,
      plan: PlanTier.PRO,
    },
  });

  return order;
}

export async function handleRazorpayWebhook(body: string, signature?: string) {
  if (!verifyRazorpaySignature(body, signature)) {
    throw Errors.validation("Invalid Razorpay webhook signature");
  }

  const event = JSON.parse(body) as {
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
    };
  };

  const payment = event.payload?.payment?.entity;
  const order = event.payload?.order?.entity;
  const tenantId = payment?.notes?.tenantId ?? order?.notes?.tenantId;

  if (!tenantId || !["payment.captured", "order.paid"].includes(event.event ?? "")) {
    return { processed: false };
  }

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 30);

  const [subscription] = await db
    .insert(subscriptions)
    .values({
      tenantId,
      plan: PlanTier.PRO,
      razorpayOrderId: payment?.order_id ?? order?.id ?? null,
      razorpayPaymentId: payment?.id ?? null,
      startDate,
      endDate,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.tenantId,
      set: {
        plan: PlanTier.PRO,
        razorpayOrderId: payment?.order_id ?? order?.id ?? null,
        razorpayPaymentId: payment?.id ?? null,
        startDate,
        endDate,
        updatedAt: new Date(),
      },
    })
    .returning();

  return { processed: true, subscription };
}

export async function downgradeExpiredSubscriptions() {
  const now = new Date();
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.plan, PlanTier.PRO));

  let downgraded = 0;
  for (const row of rows) {
    if (row.endDate && row.endDate < now) {
      await db
        .update(subscriptions)
        .set({ plan: PlanTier.FREE, updatedAt: now })
        .where(eq(subscriptions.id, row.id));
      downgraded += 1;
    }
  }

  return { downgraded };
}
