import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.js";
import { errorHandler } from "../../middleware/error.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { contentModerationMiddleware } from "../../middleware/moderation.js";
import { listRoomsHandler } from "./rooms.js";
import {
  getMessagesHandler,
  sendMessageHandler,
  pinMessageHandler,
  unpinMessageHandler,
  deleteMessageHandler,
} from "./messages.js";
import { markRoomReadHandler, getMessageReceiptsHandler } from "./receipts.js";
import {
  blockUserHandler,
  unblockUserHandler,
  listBlockedUsersHandler,
} from "./blocks.js";
import { waltDoubtHandler } from "../walt/index.js";

const chatRoutes = new Hono();

chatRoutes.onError(errorHandler);
chatRoutes.use("*", authMiddleware);

const chatMutationLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 30,
  errorCode: "CHAT_MUTATION_LIMITED",
});

// Rooms
chatRoutes.get("/rooms", listRoomsHandler);

// Messages
chatRoutes.get("/rooms/:roomId/messages", getMessagesHandler);
chatRoutes.post("/rooms/:roomId/messages", chatMutationLimiter, contentModerationMiddleware, sendMessageHandler);
chatRoutes.post("/rooms/:roomId/walt", chatMutationLimiter, contentModerationMiddleware, waltDoubtHandler);
chatRoutes.put("/messages/:messageId/pin", chatMutationLimiter, pinMessageHandler);
chatRoutes.delete("/messages/:messageId/pin", chatMutationLimiter, unpinMessageHandler);
chatRoutes.delete("/messages/:messageId", chatMutationLimiter, deleteMessageHandler);

// Receipts
chatRoutes.post("/rooms/:roomId/read", chatMutationLimiter, markRoomReadHandler);
chatRoutes.get("/messages/:messageId/receipts", getMessageReceiptsHandler);

// Blocks
chatRoutes.post("/blocks", chatMutationLimiter, blockUserHandler);
chatRoutes.delete("/blocks/:userId", chatMutationLimiter, unblockUserHandler);
chatRoutes.get("/blocks", listBlockedUsersHandler);

export { chatRoutes };
