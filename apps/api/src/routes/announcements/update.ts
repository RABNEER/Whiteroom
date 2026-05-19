import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { updateAnnouncement } from "../../services/announcements.js";

const updateAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(5000).optional(),
  attachmentUrl: z.string().url().nullable().optional(),
  isPinned: z.boolean().optional(),
});

export async function updateAnnouncementHandler(c: Context) {
  const parsed = updateAnnouncementSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const announcementId = c.req.param("id")!;

  const updated = await updateAnnouncement(
    user.tenantId,
    announcementId,
    parsed.data
  );

  const response: ApiResponse = {
    success: true,
    data: updated,
  };

  return c.json(response);
}
