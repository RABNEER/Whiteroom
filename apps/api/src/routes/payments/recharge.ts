import type { Context } from "hono";
import { html, raw } from "hono/html";
import { z } from "zod";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { db } from "../../lib/db.js";
import { billingTransactions, eq, desc } from "@whiteroom/db";
import {
  createRechargeOrder,
  getTenantWalletStatus,
} from "../../services/payments.js";

const rechargeOrderSchema = z.object({
  credits: z.number().int().min(1).max(100000),
});

export async function createRechargeOrderHandler(c: Context) {
  const parsed = rechargeOrderSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const order = await createRechargeOrder(user.tenantId, user.userId, parsed.data);

  const response: ApiResponse = {
    success: true,
    data: order,
  };

  return c.json(response, 201);
}

export async function getWalletStatusHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const status = await getTenantWalletStatus(user.tenantId);

  const response: ApiResponse = {
    success: true,
    data: status,
  };

  return c.json(response, 200);
}

export async function getTransactionsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  const transactions = await db
    .select()
    .from(billingTransactions)
    .where(eq(billingTransactions.tenantId, user.tenantId))
    .orderBy(desc(billingTransactions.createdAt))
    .limit(isNaN(limit) ? 50 : limit);

  const response: ApiResponse = {
    success: true,
    data: transactions,
  };

  return c.json(response, 200);
}

export async function renderCheckoutPageHandler(c: Context) {
  const orderId = c.req.query("order_id") || "";
  const amountPaise = parseInt(c.req.query("amount") || "0", 10);
  const credits = c.req.query("credits") || "0";
  const keyId = c.req.query("key_id") || "";

  const safeOrderId = JSON.stringify(orderId).replace(/</g, '\\u003c');
  const safeCredits = JSON.stringify(credits).replace(/</g, '\\u003c');
  const safeKeyId = JSON.stringify(keyId).replace(/</g, '\\u003c');

  const htmlContent = html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Whiteroom - Complete Recharge</title>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
    .card { background: #1e293b; border: 1px solid #334155; padding: 2.5rem 2rem; border-radius: 1.25rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); text-align: center; max-width: 420px; width: 100%; }
    .title { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    .subtitle { color: #94a3b8; font-size: 0.95rem; margin-bottom: 1.5rem; }
    .amount-box { background: #0f172a; padding: 1rem; border-radius: 0.75rem; border: 1px solid #334155; margin-bottom: 1.5rem; }
    .amount { font-size: 2rem; font-weight: 800; color: #38bdf8; }
    .credits { font-size: 0.875rem; color: #cbd5e1; margin-top: 0.25rem; }
    .btn { background: #3b82f6; color: white; border: none; padding: 1rem 1.5rem; border-radius: 0.75rem; font-size: 1rem; font-weight: 600; cursor: pointer; width: 100%; transition: background 0.2s; }
    .btn:hover { background: #2563eb; }
    .status { margin-top: 1.5rem; font-size: 0.95rem; color: #10b981; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">Complete Your Recharge</div>
    <div class="subtitle">Secure prepaid student credits checkout</div>
    <div class="amount-box">
      <div class="amount">₹${(amountPaise / 100).toFixed(0)}</div>
      <div class="credits"><strong>${credits}</strong> Student Credits</div>
    </div>
    <button class="btn" id="payBtn" onclick="openRazorpay()">Pay Securely with Razorpay</button>
    <div class="status" id="statusMsg">✅ Payment completed successfully! You may now close this window or return to the Whiteroom app.</div>
  </div>
  <script>
    const orderId = ${raw(safeOrderId)};
    const amountPaise = ${amountPaise};
    const credits = ${raw(safeCredits)};
    const keyId = ${raw(safeKeyId)};

    function openRazorpay() {
      if (!orderId || orderId.startsWith('mock_') || !keyId) {
        alert('This is a simulated/mock order. In live mode with Razorpay keys configured, the Razorpay payment modal will open automatically.');
        return;
      }
      const options = {
        key: keyId,
        amount: amountPaise,
        currency: 'INR',
        name: 'Whiteroom EdTech',
        description: 'Recharge ' + credits + ' Student Credits',
        order_id: orderId,
        handler: function (response) {
          document.getElementById('payBtn').style.display = 'none';
          document.getElementById('statusMsg').style.display = 'block';
        },
        theme: { color: '#3b82f6' }
      };
      const rzp = new Razorpay(options);
      rzp.open();
    }
    window.addEventListener('load', () => { if (orderId && !orderId.startsWith('mock_') && keyId) openRazorpay(); });
  </script>
</body>
</html>`;

  return c.html(htmlContent, 200);
}
