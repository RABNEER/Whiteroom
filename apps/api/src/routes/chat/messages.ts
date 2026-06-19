import type { Context } from "hono";
import { z } from "zod";
import {
  sendMessage,
  getMessages,
  pinMessage,
  unpinMessage,
  deleteMessage,
} from "../../services/chat.js";
import { Errors } from "@whiteroom/shared";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";

const sendMessageSchema = z.object({
  roomType: z.enum(["classroom", "teacher_channel", "direct_message"]),
  content: z.string().trim().min(1).max(2000),
  attachments: z
    .array(
      z.object({
        type: z.enum(["image", "video", "document"]),
        url: z.string().url(),
        name: z.string(),
        size: z.number().int().nonnegative(),
      })
    )
    .optional(),
  mentions: z.array(z.string()).optional(),
});

/**
 * GET /api/v1/chat/rooms/:roomId/messages?roomType=...
 */
export async function getMessagesHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const roomId = c.req.param("roomId")!;
  const roomType = c.req.query("roomType") as "classroom" | "teacher_channel" | "direct_message";

  if (!roomType || !["classroom", "teacher_channel", "direct_message"].includes(roomType)) {
    throw Errors.validation("Invalid or missing 'roomType' query parameter.");
  }

  const list = await getMessages(user.tenantId, roomId, roomType, user.userId, user.role);

  const response: ApiResponse<any[]> = {
    success: true,
    data: list,
  };

  return c.json(response, 200);
}

/**
 * POST /api/v1/chat/rooms/:roomId/messages
 */
export async function sendMessageHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const roomId = c.req.param("roomId")!;
  
  const body = await c.req.json();
  const parsed = sendMessageSchema.safeParse(body);

  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const { roomType, content, attachments, mentions } = parsed.data;

  const msg = await sendMessage(
    user.tenantId,
    user.userId,
    roomId,
    roomType,
    content,
    attachments,
    mentions
  );

  const response: ApiResponse<any> = {
    success: true,
    data: msg,
  };

  return c.json(response, 201);
}

/**
 * PUT /api/v1/chat/messages/:messageId/pin
 */
export async function pinMessageHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const messageId = c.req.param("messageId")!;

  const res = await pinMessage(user.tenantId, messageId, user.userId, user.role);

  const response: ApiResponse<any> = {
    success: true,
    data: res,
  };

  return c.json(response, 200);
}

/**
 * DELETE /api/v1/chat/messages/:messageId/pin
 */
export async function unpinMessageHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const messageId = c.req.param("messageId")!;

  const res = await unpinMessage(user.tenantId, messageId, user.userId, user.role);

  const response: ApiResponse<any> = {
    success: true,
    data: res,
  };

  return c.json(response, 200);
}

/**
 * DELETE /api/v1/chat/messages/:messageId
 */
export async function deleteMessageHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const messageId = c.req.param("messageId")!;

  const res = await deleteMessage(user.tenantId, messageId, user.userId, user.role);

  const response: ApiResponse<any> = {
    success: true,
    data: res,
  };

  return c.json(response, 200);
}
