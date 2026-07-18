import { describe, expect, it, beforeAll } from "vitest";
import { Hono } from "hono";
import { db } from "../lib/db.js";
import {
  users,
  tenants,
  userTenants,
  subscriptions,
  billingTransactions,
  idempotencyKeys,
  rateLimits,
  auditLogs,
  eq,
  inArray,
} from "@whiteroom/db";
import { signAccessToken } from "../lib/jwt.js";
import { UserRole } from "@whiteroom/shared";
import { paymentRoutes } from "./payments/index.js";
import { errorHandler } from "../middleware/error.js";
import { hashSHA256 } from "../lib/otp.js";
import crypto from "node:crypto";

describe("Prepaid Credits Wallet & Recharge Integration Tests", () => {
  const testApp = new Hono();

  const tenantRechargeId = "test-recharge-tenant-1";
  const adminRechargeId = "test-recharge-admin-1";
  const parentRechargeId = "test-recharge-parent-1";

  let adminToken: string;
  let parentToken: string;

  const cleanUp = async () => {
    try {
      await db.delete(billingTransactions).where(eq(billingTransactions.tenantId, tenantRechargeId));
      await db.delete(subscriptions).where(eq(subscriptions.tenantId, tenantRechargeId));
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.tenantId, tenantRechargeId));
      await db.delete(rateLimits);

      await db.delete(userTenants).where(
        inArray(userTenants.userId, [adminRechargeId, parentRechargeId])
      );
      await db.delete(users).where(
        inArray(users.id, [adminRechargeId, parentRechargeId])
      );
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantRechargeId));
      await db.delete(tenants).where(eq(tenants.id, tenantRechargeId));
    } catch (err) {
      console.error("Recharge test cleanup failed:", err);
    }
  };

  beforeAll(async () => {
    // Mount payments endpoints
    testApp.onError(errorHandler);
    testApp.route("/api/v1/payments", paymentRoutes);

    await cleanUp();

    // Insert baseline tenant and users
    await db.insert(tenants).values([
      {
        id: tenantRechargeId,
        name: "Recharge Academy",
        slug: "recharge-academy",
        inviteCode: "RECH12",
        phone: "+919988776655",
      },
    ]).onConflictDoNothing();

    await db.insert(users).values([
      {
        id: adminRechargeId,
        phone: hashSHA256("+919988776655"),
        role: UserRole.SCHOOL_ADMIN,
        tenantId: tenantRechargeId,
      },
      {
        id: parentRechargeId,
        phone: hashSHA256("+919988776656"),
        role: UserRole.PARENT,
        tenantId: tenantRechargeId,
      },
    ]).onConflictDoNothing();

    await db.insert(userTenants).values([
      {
        userId: adminRechargeId,
        tenantId: tenantRechargeId,
        role: UserRole.SCHOOL_ADMIN,
        status: "active",
        activeTenant: true,
      },
      {
        userId: parentRechargeId,
        tenantId: tenantRechargeId,
        role: UserRole.PARENT,
        status: "active",
        activeTenant: true,
      },
    ]).onConflictDoNothing();

    adminToken = await signAccessToken({
      userId: adminRechargeId,
      role: UserRole.SCHOOL_ADMIN,
      tenantId: tenantRechargeId,
      activeTenantId: tenantRechargeId,
      plan: "free" as any,
      tenants: [{ tenantId: tenantRechargeId, role: UserRole.SCHOOL_ADMIN, status: "active" }],
    });

    parentToken = await signAccessToken({
      userId: parentRechargeId,
      role: UserRole.PARENT,
      tenantId: tenantRechargeId,
      activeTenantId: tenantRechargeId,
      plan: "free" as any,
      tenants: [{ tenantId: tenantRechargeId, role: UserRole.PARENT, status: "active" }],
    });

    return async () => {
      await cleanUp();
    };
  });

  it("should reject wallet status request without auth token (401)", async () => {
    const res = await testApp.request("/api/v1/payments/wallet");
    expect(res.status).toBe(401);
  });

  it("should reject wallet status request from non-admin role (403)", async () => {
    const res = await testApp.request("/api/v1/payments/wallet", {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    expect(res.status).toBe(403);
  });

  it("should return initial wallet status with 100 trial credits for new school admin", async () => {
    const res = await testApp.request("/api/v1/payments/wallet", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tenantId).toBe(tenantRechargeId);
    expect(body.data.creditsBalance).toBe(100);
    expect(body.data.status).toBe("ACTIVE");
  });

  it("should reject recharge order creation with invalid or zero credits", async () => {
    const res = await testApp.request("/api/v1/payments/recharge/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ credits: 0 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("should create a recharge order at ₹5/credit (500 paise per credit)", async () => {
    const creditsToBuy = 100; // 100 credits = ₹500 = 50000 paise
    const res = await testApp.request("/api/v1/payments/recharge/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ credits: creditsToBuy }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.credits).toBe(creditsToBuy);
    expect(body.data.amountPaise).toBe(creditsToBuy * 500);
    expect(body.data.currency).toBe("INR");
    expect(body.data.id).toBeDefined();
    expect(body.data.paymentUrl).toBeDefined();
  });

  it("should process webhook capture for recharge and increment credits balance", async () => {
    const orderId = "order_recharge_int_001";
    const paymentId = "pay_recharge_int_001";
    const eventId = `evt_recharge_${crypto.randomUUID()}`;

    const webhookPayload = {
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            notes: {
              tenantId: tenantRechargeId,
              credits: "150",
              type: "recharge",
            },
          },
        },
        order: {
          entity: {
            id: orderId,
            receipt: `recharge_${tenantRechargeId}_${Date.now()}`,
            notes: {
              tenantId: tenantRechargeId,
              credits: "150",
              type: "recharge",
            },
          },
        },
      },
    };

    const signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET || "razorpay_webhook_secret")
      .update(JSON.stringify(webhookPayload))
      .digest("hex");

    const res = await testApp.request("/api/v1/payments/webhook", {
      method: "POST",
      headers: {
        "x-razorpay-signature": signature,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(webhookPayload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.processed).toBe(true);
    expect(body.data.creditsBalance).toBe(250); // initial 100 + recharge 150 = 250
  });

  it("should fetch transaction history and verify newly added recharge record", async () => {
    const res = await testApp.request("/api/v1/payments/transactions", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    const rechargeTx = body.data.find((tx: any) => tx.type === "recharge" && tx.creditsChange === 150);
    expect(rechargeTx).toBeDefined();
    expect(rechargeTx.description).toContain("150 credits");
  });
});
