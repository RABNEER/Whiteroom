import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { createAnnouncement } from "../../services/announcements.js";

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  attachmentUrl: z.string().url().optional(),
  isPinned: z.boolean().optional(),
});

export async function createAnnouncementHandler(c: Context) {
  const parsed = createAnnouncementSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const announcement = await createAnnouncement(
    user.tenantId,
    user.userId,
    parsed.data
  );

  const response: ApiResponse = {
    success: true,
    data: announcement,
  };

  return c.json(response, 201);
}
