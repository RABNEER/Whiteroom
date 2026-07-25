import { Hono } from "hono";
import { otpSendHandler } from "./otp-send.js";
import { otpVerifyHandler } from "./otp-verify.js";
import { registerHandler } from "./register.js";
import { refreshHandler } from "./refresh.js";
import { logoutHandler } from "./logout.js";
import { switchTenantHandler } from "./switch-tenant.js";
import { whatsappSessionCreateHandler } from "./whatsapp-session-create.js";
import { whatsappSessionGetHandler } from "./whatsapp-session-get.js";
import { whatsappSessionPhoneHandler } from "./whatsapp-session-phone.js";
import { whatsappWebhookHandler } from "./whatsapp-webhook.js";
import { whatsappVerifyHandler } from "./whatsapp-verify.js";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
const authRoutes = new Hono();

const otpSendLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 100,
  errorCode: "OTP_RATE_LIMITED",
});

const otpVerifyLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 100,
  errorCode: "VERIFY_RATE_LIMITED",
});

const registerLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 50,
  errorCode: "REGISTER_RATE_LIMITED",
});

const refreshLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 200,
  errorCode: "REFRESH_RATE_LIMITED",
});

const qrRawLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 60,
  errorCode: "QR_RAW_RATE_LIMITED",
});

const qrPageLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 30,
  errorCode: "QR_PAGE_RATE_LIMITED",
});

const pairCodeLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 5,
  errorCode: "PAIR_CODE_RATE_LIMITED",
});

// Public - no auth required
authRoutes.post("/otp/send", otpSendLimiter, otpSendHandler);
authRoutes.post("/otp/verify", otpVerifyLimiter, otpVerifyHandler);
authRoutes.post("/whatsapp/session", otpSendLimiter, whatsappSessionCreateHandler);
authRoutes.get("/whatsapp/session/:id", whatsappSessionGetHandler);
authRoutes.get("/whatsapp/session/:id/phone", whatsappSessionPhoneHandler);
authRoutes.get("/whatsapp/qr/raw", qrRawLimiter, async (c) => {
  return c.json({
    mode: "external_microservice",
    message: "WhatsApp Bot is running as a standalone microservice (https://github.com/RABNEER/Whiteroom-BOT)",
  });
});

authRoutes.get("/whatsapp/bot-status", async (c) => {
  return c.json({
    mode: "external_microservice",
    botRepo: "https://github.com/RABNEER/Whiteroom-BOT",
    webhookUrl: "/api/v1/auth/whatsapp/webhook",
  });
});

authRoutes.get("/whatsapp/qr", qrPageLimiter, async (c) => {
  return c.redirect("https://github.com/RABNEER/Whiteroom-BOT");
});
authRoutes.post("/whatsapp/webhook", whatsappWebhookHandler);
authRoutes.post("/whatsapp/verify", registerLimiter, whatsappVerifyHandler);
authRoutes.post("/register", registerLimiter, registerHandler);
authRoutes.post("/refresh", refreshLimiter, refreshHandler);

// Protected - requires valid access token
authRoutes.post("/logout", authMiddleware, logoutHandler);
authRoutes.post("/switch-tenant", authMiddleware, switchTenantHandler);

export { authRoutes };
