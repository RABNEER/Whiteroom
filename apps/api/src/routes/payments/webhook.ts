import type { Context } from "hono";
import type { ApiResponse } from "@whiteroom/shared";
import { handleRazorpayWebhook } from "../../services/payments.js";

export async function paymentWebhookHandler(c: Context) {
  const body = await c.req.text();
  const signature = c.req.header("x-razorpay-signature");
  const result = await handleRazorpayWebhook(body, signature);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
