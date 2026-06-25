import { Hono } from "hono";
import { otpSendHandler } from "./otp-send.js";
import { otpVerifyHandler } from "./otp-verify.js";
import { registerHandler } from "./register.js";
import { refreshHandler } from "./refresh.js";
import { logoutHandler } from "./logout.js";
import { switchTenantHandler } from "./switch-tenant.js";
import { whatsappSessionCreateHandler } from "./whatsapp-session-create.js";
import { whatsappSessionGetHandler } from "./whatsapp-session-get.js";
import { whatsappVerifyHandler } from "./whatsapp-verify.js";
import { authMiddleware } from "../../middleware/auth.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";

const authRoutes = new Hono();

const otpSendLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 requests per 15 mins
});

// Public - no auth required
authRoutes.post("/otp/send", otpSendLimiter, otpSendHandler);
authRoutes.post("/otp/verify", otpVerifyHandler);
authRoutes.post("/whatsapp/session", otpSendLimiter, whatsappSessionCreateHandler);
authRoutes.get("/whatsapp/session/:id", whatsappSessionGetHandler);
authRoutes.post("/whatsapp/verify", whatsappVerifyHandler);
authRoutes.post("/register", registerHandler);
authRoutes.post("/refresh", refreshHandler);

// Protected - requires valid access token
authRoutes.post("/logout", authMiddleware, logoutHandler);
authRoutes.post("/switch-tenant", authMiddleware, switchTenantHandler);

export { authRoutes };
