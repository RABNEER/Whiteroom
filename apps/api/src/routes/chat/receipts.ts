import type { Context } from "hono";
import { markRoomRead, getMessageReceipts } from "../../services/chat.js";
import { ApiResponse, JWTPayload } from "@whiteroom/shared";

/**
 * POST /api/v1/chat/rooms/:roomId/read
 */
export async function markRoomReadHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const roomId = c.req.param("roomId")!;

  const res = await markRoomRead(user.tenantId, roomId, user.userId, user.role);

  const response: ApiResponse<any> = {
    success: true,
    data: res,
  };

  return c.json(response, 200);
}

/**
 * GET /api/v1/chat/messages/:messageId/receipts
 */
export async function getMessageReceiptsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const messageId = c.req.param("messageId")!;

  const receipts = await getMessageReceipts(user.tenantId, messageId, user.userId, user.role);

  const response: ApiResponse<any[]> = {
    success: true,
    data: receipts,
  };

  return c.json(response, 200);
}
