import crypto from "node:crypto";
import { db } from "../lib/db.js";
import { env } from "../lib/env.js";
import {
  messages,
  dmRooms,
  messageReceipts,
  userBlocks,
  messageAuditLogs,
  classes,
  users,
  userTenants,
  classEnrollments,
  students,
  parentProfiles,
} from "@whiteroom/db";
import { and, eq, or, isNull, desc, sql } from "@whiteroom/db";
import { Errors, UserRole } from "@whiteroom/shared";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function deriveTenantKey(rootSecret: string, tenantId: string): Buffer {
  return crypto.createHmac("sha256", rootSecret).update(tenantId).digest();
}

function getCurrentTenantKey(tenantId: string): Buffer {
  return deriveTenantKey(env.DM_ENCRYPTION_SECRET, tenantId);
}

function getDecryptionKeys(tenantId: string): Buffer[] {
  return [getCurrentTenantKey(tenantId)];
}

function decryptWithKey(encryptedData: string, key: Buffer): string {
  const [ivHex, encryptedHex, authTagHex] = encryptedData.split(":");
  const iv = Buffer.from(ivHex!, "hex");
  const authTag = Buffer.from(authTagHex!, "hex");
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex!, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function encryptMessage(content: string, tenantId: string): string {
  const key = getCurrentTenantKey(tenantId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(content, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${encrypted}:${authTag}`;
}

export function decryptMessage(encryptedData: string, tenantId: string): string {
  const parts = encryptedData.split(":");
  if (parts.length !== 3) {
    return encryptedData;
  }

  let lastDecryptError: Error | null = null;
  for (const key of getDecryptionKeys(tenantId)) {
    try {
      return decryptWithKey(encryptedData, key);
    } catch (innerErr) {
      lastDecryptError = innerErr instanceof Error ? innerErr : new Error(String(innerErr));
    }
  }

  console.error("[chat] All decryption keys failed for tenant", tenantId, lastDecryptError);
  return "[Encrypted Message]";
}
// â”€â”€â”€ DM Room Helpers â”€â”€â”€
export async function getOrCreateDMRoom(
  tenantId: string,
  participant1Id: string,
  participant2Id: string
) {
  const lockKey = `dm_room_${[participant1Id, participant2Id].sort().join("_")}`;

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const [existing] = await tx
      .select()
      .from(dmRooms)
      .where(
        and(
          eq(dmRooms.tenantId, tenantId),
          or(
            and(
              eq(dmRooms.participant1Id, participant1Id),
              eq(dmRooms.participant2Id, participant2Id)
            ),
            and(
              eq(dmRooms.participant1Id, participant2Id),
              eq(dmRooms.participant2Id, participant1Id)
            )
          )
        )
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await tx
      .insert(dmRooms)
      .values({
        tenantId,
        participant1Id,
        participant2Id,
      })
      .returning();

    return created!;
  });
}

// â”€â”€â”€ Core Message operations â”€â”€â”€
export async function sendMessage(
  tenantId: string,
  senderId: string,
  roomId: string,
  roomType: "classroom" | "teacher_channel" | "direct_message",
  content: string,
  attachments?: { type: "image" | "video" | "document"; url: string; name: string; size: number }[],
  mentions?: string[],
  senderRole?: string
) {
  // 1. Enforce specific room-type permissions
  if (roomType === "classroom") {
    const [classRow] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, roomId), eq(classes.tenantId, tenantId), isNull(classes.deletedAt)))
      .limit(1);

    if (!classRow) {
      throw Errors.notFound("Classroom");
    }

    const isTeacherOrAdmin =
      senderRole === UserRole.TEACHER ||
      senderRole === UserRole.SCHOOL_ADMIN ||
      senderRole === UserRole.SUPER_ADMIN;

    if (!isTeacherOrAdmin && senderRole === UserRole.PARENT) {
      const [profile] = await db
        .select({ id: parentProfiles.id })
        .from(parentProfiles)
        .where(and(eq(parentProfiles.userId, senderId), eq(parentProfiles.tenantId, tenantId)))
        .limit(1);

      if (!profile) {
        throw Errors.forbidden("You are not part of this classroom.");
      }

      const [enrollment] = await db
        .select({ classId: classEnrollments.classId })
        .from(classEnrollments)
        .innerJoin(students, eq(classEnrollments.studentId, students.id))
        .where(
          and(
            eq(classEnrollments.classId, roomId),
            eq(students.parentId, profile.id),
            eq(classEnrollments.status, "active"),
            isNull(students.deletedAt)
          )
        )
        .limit(1);

      if (!enrollment) {
        throw Errors.forbidden("You are not part of this classroom.");
      }
    }

    // Check announcement mode restriction
    if (classRow.chatMode === "announcement") {
      if (!isTeacherOrAdmin) {
        throw Errors.forbidden("Only teachers and school administrators can post in announcement mode.");
      }
    }
  } else if (roomType === "teacher_channel") {
    // Teacher-only channels are invisible/forbidden to students & parents
    const [senderTenantInfo] = await db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.userId, senderId), eq(userTenants.tenantId, tenantId)))
      .limit(1);

    const isTeacherOrAdmin =
      senderTenantInfo &&
      (senderTenantInfo.role === UserRole.TEACHER ||
        senderTenantInfo.role === UserRole.SCHOOL_ADMIN);

    if (!isTeacherOrAdmin) {
      throw Errors.forbidden("Teacher channels are restricted to teachers and school admins.");
    }
  } else if (roomType === "direct_message") {
    // 1-on-1 direct message checks
    const [dmRoom] = await db
      .select()
      .from(dmRooms)
      .where(and(eq(dmRooms.id, roomId), eq(dmRooms.tenantId, tenantId)))
      .limit(1);

    if (!dmRoom) {
      throw Errors.notFound("Direct message room");
    }

    const recipientId = dmRoom.participant1Id === senderId ? dmRoom.participant2Id : dmRoom.participant1Id;

    // Check if blocked by recipient
    const [isBlocked] = await db
      .select()
      .from(userBlocks)
      .where(
        and(
          eq(userBlocks.tenantId, tenantId),
          eq(userBlocks.userId, recipientId),
          eq(userBlocks.blockedUserId, senderId)
        )
      )
      .limit(1);

    if (isBlocked) {
      throw Errors.forbidden("You cannot message this user.");
    }

  }

  const messageContent = roomType === "direct_message" ? encryptMessage(content, tenantId) : content;
  const [msg] = await db
    .insert(messages)
    .values({
      tenantId,
      roomId,
      roomType,
      senderId,
      content: messageContent,
      attachments: attachments ?? null,
      mentions: mentions ?? null,
    })
    .returning();

  // 3. Mark read by sender automatically
  await db
    .insert(messageReceipts)
    .values({
      tenantId,
      messageId: msg!.id,
      userId: senderId,
    });

  // 4. Log in message audit log
  await db
    .insert(messageAuditLogs)
    .values({
      tenantId,
      messageId: msg!.id,
      actorId: senderId,
      action: "send",
      details: {
        roomType,
        roomId,
        hasAttachments: !!attachments?.length,
        mentionsCount: mentions?.length ?? 0,
      },
    });

  return msg!;
}

export async function getMessages(
  tenantId: string,
  roomId: string,
  roomType: "classroom" | "teacher_channel" | "direct_message",
  requestingUserId: string,
  requestingUserRole: string
) {
  // 1. Authorize read access
  if (roomType === "direct_message") {
    const [dmRoom] = await db
      .select()
      .from(dmRooms)
      .where(and(eq(dmRooms.id, roomId), eq(dmRooms.tenantId, tenantId)))
      .limit(1);

    if (!dmRoom) {
      throw Errors.notFound("Direct message room");
    }

    const isParticipant =
      dmRoom.participant1Id === requestingUserId || dmRoom.participant2Id === requestingUserId;

    const isAdmin =
      requestingUserRole === UserRole.SCHOOL_ADMIN || requestingUserRole === UserRole.SUPER_ADMIN;

    if (!isParticipant && !isAdmin) {
      throw Errors.forbidden("Access denied to this DM.");
    }
  } else if (roomType === "classroom") {
    const isAdmin =
      requestingUserRole === UserRole.SCHOOL_ADMIN || requestingUserRole === UserRole.SUPER_ADMIN;

    if (!isAdmin) {
      if (requestingUserRole === UserRole.TEACHER) {
        const [classRow] = await db
          .select()
          .from(classes)
          .where(and(eq(classes.id, roomId), eq(classes.tenantId, tenantId), eq(classes.teacherId, requestingUserId)))
          .limit(1);

        if (!classRow) {
          throw Errors.forbidden("Access denied to this classroom.");
        }
      } else if (requestingUserRole === UserRole.PARENT) {
        const [profile] = await db
          .select({ id: parentProfiles.id })
          .from(parentProfiles)
          .where(and(eq(parentProfiles.userId, requestingUserId), eq(parentProfiles.tenantId, tenantId)))
          .limit(1);

        if (!profile) {
          throw Errors.forbidden("Access denied to this classroom.");
        }

        const [enrollment] = await db
          .select({ classId: classEnrollments.classId })
          .from(classEnrollments)
          .innerJoin(students, eq(classEnrollments.studentId, students.id))
          .where(
            and(
              eq(classEnrollments.classId, roomId),
              eq(students.parentId, profile.id),
              eq(classEnrollments.status, "active"),
              isNull(students.deletedAt)
            )
          )
          .limit(1);

        if (!enrollment) {
          throw Errors.forbidden("Access denied to this classroom.");
        }
      }
    }
  } else if (roomType === "teacher_channel") {
    const isTeacherOrAdmin =
      requestingUserRole === UserRole.TEACHER ||
      requestingUserRole === UserRole.SCHOOL_ADMIN ||
      requestingUserRole === UserRole.SUPER_ADMIN;

    if (!isTeacherOrAdmin) {
      throw Errors.forbidden("Teacher channels are restricted to teachers and administrators.");
    }
  }

  // 2. Retrieve messages
  const rawMessages = await db
    .select({
      id: messages.id,
      roomId: messages.roomId,
      roomType: messages.roomType,
      senderId: messages.senderId,
      senderName: users.name,
      senderRole: users.role,
      content: messages.content,
      attachments: messages.attachments,
      isPinned: messages.isPinned,
      mentions: messages.mentions,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      deletedAt: messages.deletedAt,
      readCount: sql<number>`(SELECT count(*)::int FROM message_receipts WHERE message_receipts.message_id = messages.id AND message_receipts.user_id != messages.sender_id)`
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(
      and(
        eq(messages.roomId, roomId),
        eq(messages.roomType, roomType),
        eq(messages.tenantId, tenantId),
        isNull(messages.deletedAt)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(100);

  // Reverse to chronological for chat screens
  const orderedMessages = rawMessages.reverse();

  // 3. Decrypt direct messages
  if (roomType === "direct_message") {
    for (const msg of orderedMessages) {
      msg.content = decryptMessage(msg.content, tenantId);
    }
  }

  return orderedMessages;
}

// â”€â”€â”€ Pinning â”€â”€â”€
export async function pinMessage(
  tenantId: string,
  messageId: string,
  actorId: string,
  actorRole: string
) {
  const isTeacherOrAdmin =
    actorRole === UserRole.TEACHER ||
    actorRole === UserRole.SCHOOL_ADMIN ||
    actorRole === UserRole.SUPER_ADMIN;

  if (!isTeacherOrAdmin) {
    throw Errors.forbidden("Only teachers and school administrators can pin messages.");
  }

  const [msg] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)))
    .limit(1);

  if (!msg) {
    throw Errors.notFound("Message");
  }

  if (msg.roomType === "classroom" && actorRole !== UserRole.SCHOOL_ADMIN && actorRole !== UserRole.SUPER_ADMIN) {
    const [classRow] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, msg.roomId), eq(classes.teacherId, actorId)))
      .limit(1);

    if (!classRow) {
      throw Errors.forbidden("Only the class teacher can pin messages in this classroom.");
    }
  }

  await db
    .update(messages)
    .set({ isPinned: true, updatedAt: new Date() })
    .where(eq(messages.id, messageId));

  // Log audit trail
  await db.insert(messageAuditLogs).values({
    tenantId,
    messageId,
    actorId,
    action: "pin",
    details: { roomId: msg.roomId, roomType: msg.roomType },
  });

  return { success: true };
}

export async function unpinMessage(
  tenantId: string,
  messageId: string,
  actorId: string,
  actorRole: string
) {
  const isTeacherOrAdmin =
    actorRole === UserRole.TEACHER ||
    actorRole === UserRole.SCHOOL_ADMIN ||
    actorRole === UserRole.SUPER_ADMIN;

  if (!isTeacherOrAdmin) {
    throw Errors.forbidden("Only teachers and school administrators can unpin messages.");
  }

  const [msg] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)))
    .limit(1);

  if (!msg) {
    throw Errors.notFound("Message");
  }

  if (msg.roomType === "classroom" && actorRole !== UserRole.SCHOOL_ADMIN && actorRole !== UserRole.SUPER_ADMIN) {
    const [classRow] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, msg.roomId), eq(classes.teacherId, actorId)))
      .limit(1);

    if (!classRow) {
      throw Errors.forbidden("Only the class teacher can unpin messages in this classroom.");
    }
  }

  await db
    .update(messages)
    .set({ isPinned: false, updatedAt: new Date() })
    .where(eq(messages.id, messageId));

  // Log audit trail
  await db.insert(messageAuditLogs).values({
    tenantId,
    messageId,
    actorId,
    action: "unpin",
    details: { roomId: msg.roomId, roomType: msg.roomType },
  });

  return { success: true };
}

// â”€â”€â”€ Deletion â”€â”€â”€
export async function deleteMessage(
  tenantId: string,
  messageId: string,
  actorId: string,
  actorRole: string
) {
  const [msg] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.tenantId, tenantId), isNull(messages.deletedAt)))
    .limit(1);

  if (!msg) {
    throw Errors.notFound("Message");
  }

  const isSender = msg.senderId === actorId;
  const isModerator =
    actorRole === UserRole.TEACHER ||
    actorRole === UserRole.SCHOOL_ADMIN ||
    actorRole === UserRole.SUPER_ADMIN;

  if (!isSender && !isModerator) {
    throw Errors.forbidden("You do not have permission to delete this message.");
  }

  // Soft delete message
  await db
    .update(messages)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(messages.id, messageId));

  // Log audit trail
  await db.insert(messageAuditLogs).values({
    tenantId,
    messageId,
    actorId,
    action: "delete",
    details: { roomId: msg.roomId, roomType: msg.roomType, isModeratorAction: !isSender },
  });

  return { success: true };
}

// â”€â”€â”€ Read Receipts â”€â”€â”€
export async function markRoomRead(tenantId: string, roomId: string, userId: string, role?: string) {
  // Verify user has access to this room
  const staffRoomId = `staff-${tenantId}`;
  if (roomId === staffRoomId) {
    if (role !== UserRole.TEACHER && role !== UserRole.SCHOOL_ADMIN && role !== UserRole.SUPER_ADMIN) {
      throw Errors.forbidden();
    }
  } else if (roomId.startsWith("dm_")) {
    const [dm] = await db
      .select()
      .from(dmRooms)
      .where(
        and(
          eq(dmRooms.id, roomId),
          eq(dmRooms.tenantId, tenantId),
          or(eq(dmRooms.participant1Id, userId), eq(dmRooms.participant2Id, userId))
        )
      )
      .limit(1);
    if (!dm) throw Errors.forbidden();
  } else {
    const [classRow] = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, roomId), eq(classes.tenantId, tenantId), isNull(classes.deletedAt)))
      .limit(1);
    if (!classRow) throw Errors.notFound("Room");

    // Check enrollment for non-teacher/admin users
    if (role !== UserRole.TEACHER && role !== UserRole.SCHOOL_ADMIN && role !== UserRole.SUPER_ADMIN) {
      const [enrollment] = await db
        .select({ classId: classEnrollments.classId })
        .from(classEnrollments)
        .innerJoin(students, eq(classEnrollments.studentId, students.id))
        .innerJoin(parentProfiles, eq(students.parentId, parentProfiles.id))
        .where(
          and(
            eq(classEnrollments.classId, roomId),
            eq(parentProfiles.userId, userId),
            eq(classEnrollments.status, "active")
          )
        )
        .limit(1);
      if (!enrollment) throw Errors.forbidden();
    }
  }

  // Find all messages in this room that do not have a read receipt from this user
  const unreadMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .leftJoin(
      messageReceipts,
      and(eq(messages.id, messageReceipts.messageId), eq(messageReceipts.userId, userId))
    )
    .where(
      and(
        eq(messages.roomId, roomId),
        eq(messages.tenantId, tenantId),
        isNull(messages.deletedAt),
        isNull(messageReceipts.id) // Filter where there is no read receipt record
      )
    );

  if (unreadMessages.length === 0) {
    return { marked: 0 };
  }

  // Bulk insert read receipts
  await db
    .insert(messageReceipts)
    .values(
      unreadMessages.map((m) => ({
        tenantId,
        messageId: m.id,
        userId,
      }))
    );

  return { marked: unreadMessages.length };
}

export async function getMessageReceipts(tenantId: string, messageId: string, userId?: string, role?: string) {
  if (!userId) {
    throw Errors.unauthorized();
  }

  const [msg] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.tenantId, tenantId)))
    .limit(1);

  if (!msg) {
    throw Errors.notFound("Message");
  }

  // Verify user has access to the message's room
  const staffRoomId = `staff-${tenantId}`;
  if (msg.roomId === staffRoomId) {
    if (role !== UserRole.TEACHER && role !== UserRole.SCHOOL_ADMIN && role !== UserRole.SUPER_ADMIN) {
      throw Errors.forbidden();
    }
  } else if (msg.roomType === "direct_message") {
    const [dm] = await db
      .select()
      .from(dmRooms)
      .where(
        and(
          eq(dmRooms.id, msg.roomId),
          eq(dmRooms.tenantId, tenantId),
          or(eq(dmRooms.participant1Id, userId), eq(dmRooms.participant2Id, userId))
        )
      )
      .limit(1);
    if (!dm) throw Errors.forbidden();
  } else if (msg.roomType === "classroom") {
    if (role !== UserRole.TEACHER && role !== UserRole.SCHOOL_ADMIN && role !== UserRole.SUPER_ADMIN) {
      const [enrollment] = await db
        .select({ classId: classEnrollments.classId })
        .from(classEnrollments)
        .innerJoin(students, eq(classEnrollments.studentId, students.id))
        .innerJoin(parentProfiles, eq(students.parentId, parentProfiles.id))
        .where(
          and(
            eq(classEnrollments.classId, msg.roomId),
            eq(parentProfiles.userId, userId),
            eq(classEnrollments.status, "active")
          )
        )
        .limit(1);
      if (!enrollment) throw Errors.forbidden();
    }
  }

  // Fetch all read receipts for this message with user names
  const receipts = await db
    .select({
      userId: messageReceipts.userId,
      userName: users.name,
      userRole: users.role,
      readAt: messageReceipts.readAt,
    })
    .from(messageReceipts)
    .innerJoin(users, eq(messageReceipts.userId, users.id))
    .where(and(eq(messageReceipts.messageId, messageId), eq(messageReceipts.tenantId, tenantId)))
    .orderBy(messageReceipts.readAt);

  return receipts;
}
