import type { Context } from "hono";
import { db } from "../../lib/db.js";
import {
  classes,
  dmRooms,
  messages,
  messageReceipts,
  users,
  userTenants,
  classEnrollments,
  students,
  parentProfiles,
} from "@whiteroom/db";
import { and, eq, or, isNull, count, sql, inArray } from "@whiteroom/db";
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

  // Helper function to get unread count
  const getUnreadCount = async (roomId: string) => {
    const [res] = await db
      .select({ value: count() })
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
          isNull(messageReceipts.id)
        )
      );
    return res?.value ?? 0;
  };

  // 1. CLASSROOMS
  let enrolledClasses: any[] = [];

  if (role === UserRole.SCHOOL_ADMIN || role === UserRole.SUPER_ADMIN) {
    // School Admin sees all classrooms in the tenant
    enrolledClasses = await db
      .select()
      .from(classes)
      .where(and(eq(classes.tenantId, tenantId), isNull(classes.deletedAt)));
  } else if (role === UserRole.TEACHER) {
    // Teacher sees classrooms they teach
    enrolledClasses = await db
      .select()
      .from(classes)
      .where(and(eq(classes.tenantId, tenantId), eq(classes.teacherId, userId), isNull(classes.deletedAt)));
  } else if (role === UserRole.PARENT) {
    // Parent sees classrooms where their children are enrolled
    // Find parent profile ID
    const [profile] = await db
      .select({ id: parentProfiles.id })
      .from(parentProfiles)
      .where(eq(parentProfiles.userId, userId))
      .limit(1);

    if (profile) {
      // Find all enrolled student IDs linked to parent
      const parentStudents = await db
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.parentId, profile.id), eq(students.tenantId, tenantId), isNull(students.deletedAt)));

      if (parentStudents.length > 0) {
        const studentIds = parentStudents.map((s) => s.id);
        const enrollments = await db
          .select({ classId: classEnrollments.classId })
          .from(classEnrollments)
          .where(inArray(classEnrollments.studentId, studentIds));

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
    const unread = await getUnreadCount(cls.id);
    activeRooms.push({
      id: cls.id,
      name: cls.name,
      type: "classroom",
      subtitle: cls.subject || cls.teacherName || "Classroom Chat",
      chatMode: cls.chatMode,
      unreadCount: unread,
      updatedAt: cls.updatedAt,
    });
  }

  // 2. TEACHER PRIVATE STAFF CHANNEL
  // Only visible to teachers and admins
  if (role === UserRole.TEACHER || role === UserRole.SCHOOL_ADMIN || role === UserRole.SUPER_ADMIN) {
    const staffRoomId = `staff-${tenantId}`;
    const unread = await getUnreadCount(staffRoomId);
    activeRooms.push({
      id: staffRoomId,
      name: "Staff Collaboration Room",
      type: "teacher_channel",
      subtitle: "Visible to school staff only",
      unreadCount: unread,
      updatedAt: new Date(), // Staff room always present
    });
  }

  // 3. DIRECT MESSAGES (1-on-1)
  let userDMs: any[] = [];
  if (role === UserRole.SCHOOL_ADMIN || role === UserRole.SUPER_ADMIN) {
    // School Admin can view all DMs in their tenant for compliance & auditing
    userDMs = await db
      .select({
        id: dmRooms.id,
        participant1Id: dmRooms.participant1Id,
        participant2Id: dmRooms.participant2Id,
        updatedAt: dmRooms.updatedAt,
        p1Name: users.name,
        p1Role: users.role,
      })
      .from(dmRooms)
      .innerJoin(users, eq(dmRooms.participant1Id, users.id))
      .where(eq(dmRooms.tenantId, tenantId));
  } else {
    // Regular users see DMs they are part of
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

  for (const dm of userDMs) {
    const otherParticipantId = dm.participant1Id === userId ? dm.participant2Id : dm.participant1Id;
    
    // Fetch details of other participant
    const [otherUser] = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, otherParticipantId))
      .limit(1);

    if (otherUser) {
      const unread = await getUnreadCount(dm.id);
      activeRooms.push({
        id: dm.id,
        name: otherUser.name || "Private DM",
        type: "direct_message",
        subtitle: `1-on-1 discussion (${otherUser.role})`,
        unreadCount: unread,
        updatedAt: dm.updatedAt,
        otherParticipant: {
          id: otherUser.id,
          name: otherUser.name,
          role: otherUser.role,
        },
      });
    }
  }

  // Sort rooms by updatedAt descending
  activeRooms.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const response: ApiResponse<any[]> = {
    success: true,
    data: activeRooms,
  };

  return c.json(response, 200);
}
