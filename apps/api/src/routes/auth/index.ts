import { Hono } from "hono";
import { otpSendHandler } from "./otp-send.js";
import { otpVerifyHandler } from "./otp-verify.js";
import { refreshHandler } from "./refresh.js";
import { logoutHandler } from "./logout.js";
import { authMiddleware } from "../../middleware/auth.js";

const authRoutes = new Hono();

// Public — no auth required
authRoutes.post("/otp/send", otpSendHandler);
authRoutes.post("/otp/verify", otpVerifyHandler);
authRoutes.post("/refresh", refreshHandler);

// Protected — requires valid access token
authRoutes.post("/logout", authMiddleware, logoutHandler);

export { authRoutes };
