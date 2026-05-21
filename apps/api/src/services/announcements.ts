import { db } from "../lib/db.js";
import {
  announcements,
  announcementReads,
} from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import { and, count, desc, eq, isNull } from "@whiteroom/db";

// ─── Create Announcement ───

export async function createAnnouncement(
  tenantId: string,
  authorId: string,
  input: {
    title: string;
    body: string;
    attachmentUrl?: string;
    isPinned?: boolean;
  }
) {
  const [created] = await db
    .insert(announcements)
    .values({
      tenantId,
      authorId,
      title: input.title,
      body: input.body,
      attachmentUrl: input.attachmentUrl ?? null,
      isPinned: input.isPinned ?? false,
    })
    .returning();

  return created!;
}

// ─── List Announcements ───

export async function listAnnouncements(
  tenantId: string,
  options?: { page?: number; limit?: number }
) {
  // FIX: No pagination on list endpoints — will OOM at 1000+ students
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
  const offset = (page - 1) * limit;

  const [totalResult] = await db
    .select({ total: count() })
    .from(announcements)
    .where(and(eq(announcements.tenantId, tenantId), isNull(announcements.deletedAt)));

  const total = totalResult?.total ?? 0;

  const data = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.tenantId, tenantId),
        isNull(announcements.deletedAt)
      )
    )
    .orderBy(desc(announcements.isPinned), desc(announcements.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}

// ─── Get One Announcement ───

export async function getAnnouncement(tenantId: string, announcementId: string) {
  const [row] = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.id, announcementId),
        eq(announcements.tenantId, tenantId),
        isNull(announcements.deletedAt)
      )
    )
    .limit(1);

  if (!row) {
    throw Errors.notFound("Announcement");
  }

  return row;
}

// ─── Update Announcement ───

export async function updateAnnouncement(
  tenantId: string,
  announcementId: string,
  input: {
    title?: string;
    body?: string;
    attachmentUrl?: string | null;
    isPinned?: boolean;
  }
) {
  await getAnnouncement(tenantId, announcementId);

  const [updated] = await db
    .update(announcements)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(
        eq(announcements.id, announcementId),
        eq(announcements.tenantId, tenantId)
      )
    )
    .returning();

  return updated!;
}

// ─── Soft Delete Announcement ───

export async function softDeleteAnnouncement(
  tenantId: string,
  announcementId: string
) {
  await getAnnouncement(tenantId, announcementId);

  const [deleted] = await db
    .update(announcements)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(announcements.id, announcementId),
        eq(announcements.tenantId, tenantId)
      )
    )
    .returning();

  return deleted!;
}

// ─── Mark Read ───

export async function markAnnouncementRead(
  announcementId: string,
  userId: string
) {
  await db
    .insert(announcementReads)
    .values({
      announcementId,
      userId,
    })
    .onConflictDoNothing();

  return { read: true };
}

// ─── Unread Count ───

export async function getUnreadCount(tenantId: string, userId: string) {
  const [totalResult] = await db
    .select({ value: count() })
    .from(announcements)
    .where(
      and(
        eq(announcements.tenantId, tenantId),
        isNull(announcements.deletedAt)
      )
    );

  const [readResult] = await db
    .select({ value: count() })
    .from(announcementReads)
    .innerJoin(
      announcements,
      eq(announcementReads.announcementId, announcements.id)
    )
    .where(
      and(
        eq(announcementReads.userId, userId),
        eq(announcements.tenantId, tenantId),
        isNull(announcements.deletedAt)
      )
    );

  const total = totalResult?.value ?? 0;
  const read = readResult?.value ?? 0;

  return { total, read, unread: total - read };
}
