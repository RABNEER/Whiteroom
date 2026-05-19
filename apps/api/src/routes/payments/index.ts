import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { createPaymentOrderHandler } from "./create-order.js";
import { paymentWebhookHandler } from "./webhook.js";

const paymentRoutes = new Hono();

paymentRoutes.post("/webhook", paymentWebhookHandler);
paymentRoutes.post(
  "/orders",
  authMiddleware,
  requireRole(UserRole.TEACHER),
  createPaymentOrderHandler
);

export { paymentRoutes };
