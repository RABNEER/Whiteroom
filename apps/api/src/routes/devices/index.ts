import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.js";
import { registerFcmHandler } from "./register-fcm.js";
import { testPushHandler } from "./test-push.js";

const deviceRoutes = new Hono();

deviceRoutes.use("*", authMiddleware);
deviceRoutes.post("/fcm", registerFcmHandler);
deviceRoutes.post("/test-push", testPushHandler);

export { deviceRoutes };
