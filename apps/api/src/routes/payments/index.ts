import { Hono } from "hono";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { createPaymentOrderHandler } from "./create-order.js";
import { paymentWebhookHandler } from "./webhook.js";
import {
  createRechargeOrderHandler,
  getWalletStatusHandler,
  getTransactionsHandler,
  renderCheckoutPageHandler,
} from "./recharge.js";

const paymentRoutes = new Hono();

paymentRoutes.post("/webhook", paymentWebhookHandler);
paymentRoutes.get("/checkout", renderCheckoutPageHandler);
paymentRoutes.post(
  "/orders",
  authMiddleware,
  requireRole(UserRole.SCHOOL_ADMIN),
  createPaymentOrderHandler
);

paymentRoutes.get(
  "/wallet",
  authMiddleware,
  requireRole(UserRole.SCHOOL_ADMIN),
  getWalletStatusHandler
);

paymentRoutes.get(
  "/transactions",
  authMiddleware,
  requireRole(UserRole.SCHOOL_ADMIN),
  getTransactionsHandler
);

paymentRoutes.post(
  "/recharge/orders",
  authMiddleware,
  requireRole(UserRole.SCHOOL_ADMIN),
  createRechargeOrderHandler
);

export { paymentRoutes };
