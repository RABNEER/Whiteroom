import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.js";
import { errorHandler } from "../../middleware/error.js";
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

// Rooms
chatRoutes.get("/rooms", listRoomsHandler);

// Messages
chatRoutes.get("/rooms/:roomId/messages", getMessagesHandler);
chatRoutes.post("/rooms/:roomId/messages", sendMessageHandler);
chatRoutes.post("/rooms/:roomId/walt", waltDoubtHandler);
chatRoutes.put("/messages/:messageId/pin", pinMessageHandler);
chatRoutes.delete("/messages/:messageId/pin", unpinMessageHandler);
chatRoutes.delete("/messages/:messageId", deleteMessageHandler);

// Receipts
chatRoutes.post("/rooms/:roomId/read", markRoomReadHandler);
chatRoutes.get("/messages/:messageId/receipts", getMessageReceiptsHandler);

// Blocks
chatRoutes.post("/blocks", blockUserHandler);
chatRoutes.delete("/blocks/:userId", unblockUserHandler);
chatRoutes.get("/blocks", listBlockedUsersHandler);

export { chatRoutes };
