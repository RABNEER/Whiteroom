import type { Context } from "hono";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../lib/db.js";
import {
  classes,
  dmRooms,
  messages,
  messageReceipts,
  users,
  classEnrollments,
  students,
  parentProfiles,
} from "@whiteroom/db";
import { and, eq, or, isNull, count, inArray } from "@whiteroom/db";
import { ApiResponse, UserRole } from "@whiteroom/shared";
import type { JWTPayload } from "@whiteroom/shared";

/**
 * GET /api/v1/chat/rooms
 *
 * Lists all messaging channels (classrooms, teacher channel, direct messages)
 * accessible to the current user.
 */
export async function listRoomsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const tenantId = user.tenantId;
  const userId = user.userId;
  const role = user.role;

  const activeRooms: any[] = [];

  // 1. CLASSROOMS
  let enrolledClasses: any[] = [];

  if (role === UserRole.SCHOOL_ADMIN || role === UserRole.SUPER_ADMIN) {
    enrolledClasses = await db
      .select()
      .from(classes)
      .where(and(eq(classes.tenantId, tenantId), isNull(classes.deletedAt)));
  } else if (role === UserRole.TEACHER) {
    enrolledClasses = await db
      .select()
      .from(classes)
      .where(and(eq(classes.tenantId, tenantId), eq(classes.teacherId, userId), isNull(classes.deletedAt)));
  } else if (role === UserRole.PARENT) {
    const [profile] = await db
      .select({ id: parentProfiles.id })
      .from(parentProfiles)
      .where(eq(parentProfiles.userId, userId))
      .limit(1);

    if (profile) {
      const parentStudents = await db
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.parentId, profile.id), eq(students.tenantId, tenantId), isNull(students.deletedAt)));

      if (parentStudents.length > 0) {
        const studentIds = parentStudents.map((s) => s.id);
        const enrollments = await db
          .select({ classId: classEnrollments.classId })
          .from(classEnrollments)
          .where(
            and(
              inArray(classEnrollments.studentId, studentIds),
              eq(classEnrollments.status, "active")
            )
          );

        if (enrollments.length > 0) {
          const classIds = enrollments.map((e) => e.classId);
          enrolledClasses = await db
            .select()
            .from(classes)
            .where(and(eq(classes.tenantId, tenantId), inArray(classes.id, classIds), isNull(classes.deletedAt)));
        }
      }
    }
  }

  for (const cls of enrolledClasses) {
    activeRooms.push({
      id: cls.id,
      name: cls.name,
      type: "classroom",
      subtitle: cls.subject || cls.teacherName || "Classroom Chat",
      chatMode: cls.chatMode,
      updatedAt: cls.updatedAt,
    });
  }

  // 2. TEACHER PRIVATE STAFF CHANNEL
  if (role === UserRole.TEACHER || role === UserRole.SCHOOL_ADMIN || role === UserRole.SUPER_ADMIN) {
    const staffRoomId = `staff-${tenantId}`;
    activeRooms.push({
      id: staffRoomId,
      name: "Staff Collaboration Room",
      type: "teacher_channel",
      subtitle: "Visible to school staff only",
      updatedAt: new Date(),
    });
  }

  // 3. DIRECT MESSAGES (1-on-1)
  let userDMs: any[] = [];
  if (role === UserRole.SCHOOL_ADMIN || role === UserRole.SUPER_ADMIN) {
    const users2 = alias(users, "users2");
    userDMs = await db
      .select({
        id: dmRooms.id,
        participant1Id: dmRooms.participant1Id,
        participant2Id: dmRooms.participant2Id,
        updatedAt: dmRooms.updatedAt,
        p1Name: users.name,
        p1Role: users.role,
        p2Name: users2.name,
        p2Role: users2.role,
      })
      .from(dmRooms)
      .innerJoin(users, eq(dmRooms.participant1Id, users.id))
      .innerJoin(users2, eq(dmRooms.participant2Id, users2.id))
      .where(eq(dmRooms.tenantId, tenantId));
  } else {
    userDMs = await db
      .select({
        id: dmRooms.id,
        participant1Id: dmRooms.participant1Id,
        participant2Id: dmRooms.participant2Id,
        updatedAt: dmRooms.updatedAt,
      })
      .from(dmRooms)
      .where(
        and(
          eq(dmRooms.tenantId, tenantId),
          or(eq(dmRooms.participant1Id, userId), eq(dmRooms.participant2Id, userId))
        )
      );
  }

  // Collect all other participant IDs for batch user lookup
  const otherParticipantIds = [...new Set(userDMs.map((dm) =>
    dm.participant1Id === userId ? dm.participant2Id : dm.participant1Id
  ))];

  const otherUsers = otherParticipantIds.length > 0
    ? await db
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(and(inArray(users.id, otherParticipantIds), eq(users.tenantId, tenantId)))
    : [];
  const otherUserMap = new Map(otherUsers.map((u) => [u.id, u]));

  for (const dm of userDMs) {
    const otherParticipantId = dm.participant1Id === userId ? dm.participant2Id : dm.participant1Id;
    const otherUser = otherUserMap.get(otherParticipantId);

    if (otherUser) {
      activeRooms.push({
        id: dm.id,
        name: otherUser.name || "Private DM",
        type: "direct_message",
        subtitle: `1-on-1 discussion (${otherUser.role})`,
        updatedAt: dm.updatedAt,
        otherParticipant: {
          id: otherUser.id,
          name: otherUser.name,
          role: otherUser.role,
        },
      });
    }
  }

  // 4. Batch unread counts across all rooms (BUG 4/7)
  if (activeRooms.length > 0) {
    const unreadCounts = await db
      .select({
        roomId: messages.roomId,
        value: count(),
      })
      .from(messages)
      .leftJoin(
        messageReceipts,
        and(eq(messages.id, messageReceipts.messageId), eq(messageReceipts.userId, userId))
      )
      .where(
        and(
          inArray(messages.roomId, activeRooms.map((r) => r.id)),
          eq(messages.tenantId, tenantId),
          isNull(messages.deletedAt),
          isNull(messageReceipts.id)
        )
      )
      .groupBy(messages.roomId);

    const unreadMap = new Map(unreadCounts.map((r) => [r.roomId, r.value]));
    for (const room of activeRooms) {
      room.unreadCount = unreadMap.get(room.id) ?? 0;
    }
  }

  activeRooms.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const response: ApiResponse<any[]> = {
    success: true,
    data: activeRooms,
  };

  return c.json(response, 200);
}
