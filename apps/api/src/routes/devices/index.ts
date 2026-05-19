import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.js";
import { registerFcmHandler } from "./register-fcm.js";

const deviceRoutes = new Hono();

deviceRoutes.use("*", authMiddleware);
deviceRoutes.post("/fcm", registerFcmHandler);

export { deviceRoutes };
