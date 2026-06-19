import { Hono } from "hono";
import { authMiddleware } from "../../middleware/auth.js";
import { Errors, UserRole } from "@whiteroom/shared";
import type { JWTPayload, ApiResponse } from "@whiteroom/shared";
import { db } from "../../lib/db.js";
import {
  users,
  parentProfiles,
  teacherProfiles,
  students,
  attendanceRecords,
  messages,
  consentLogs,
  deviceTokens,
  eq,
  inArray,
} from "@whiteroom/db";
import JSZip from "jszip";

const userRoutes = new Hono<{ Variables: { user: JWTPayload } }>();

userRoutes.use("*", authMiddleware);

// 1. GET /api/v1/users/me/export - GDPR Article 20 ZIP Export
userRoutes.get("/me/export", async (c) => {
  const user = c.get("user") as JWTPayload;
  const userId = user.userId;

  // Fetch core user row
  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) {
    throw Errors.notFound("User");
  }

  // Fetch role-specific profile
  let profile: any = null;
  if (user.role === UserRole.TEACHER) {
    const [row] = await db
      .select()
      .from(teacherProfiles)
      .where(eq(teacherProfiles.id, userId))
      .limit(1);
    profile = row;
  } else if (user.role === UserRole.PARENT) {
    const [row] = await db
      .select()
      .from(parentProfiles)
      .where(eq(parentProfiles.id, userId))
      .limit(1);
    profile = row;
  }

  // Fetch all chat messages sent by this user
  const userMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.senderId, userId));

  // Fetch consent logs
  const logs = await db
    .select()
    .from(consentLogs)
    .where(eq(consentLogs.userId, userId));

  // Fetch device tokens
  const tokens = await db
    .select()
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId));

  // Fetch parent student metadata and attendance if applicable
  let studentsList: any[] = [];
  let attendanceList: any[] = [];

  if (user.role === UserRole.PARENT) {
    studentsList = await db
      .select()
      .from(students)
      .where(eq(students.parentId, userId));

    const studentIds = studentsList.map((s) => s.id);
    if (studentIds.length > 0) {
      attendanceList = await db
        .select()
        .from(attendanceRecords)
        .where(inArray(attendanceRecords.studentId, studentIds));
    }
  }

  // Generate ZIP file on-the-fly
  const zip = new JSZip();
  zip.file("profile.json", JSON.stringify({ user: userRow, profile }, null, 2));
  zip.file("messages.json", JSON.stringify(userMessages, null, 2));
  zip.file("consent.json", JSON.stringify(logs, null, 2));
  zip.file("device_tokens.json", JSON.stringify(tokens, null, 2));

  if (user.role === UserRole.PARENT) {
    zip.file("students.json", JSON.stringify(studentsList, null, 2));
    zip.file("attendance.json", JSON.stringify(attendanceList, null, 2));
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", `attachment; filename="gdpr-export-${userId}.zip"`);
  return c.body(zipBuffer as any);
});

// 2. DELETE /api/v1/users/me - GDPR Right-to-be-Forgotten Anonymization & Delete
userRoutes.delete("/me", async (c) => {
  const user = c.get("user") as JWTPayload;
  const userId = user.userId;

  await db.transaction(async (tx) => {
    // 1. Scrub User table PII fields (matching schema fields)
    await tx
      .update(users)
      .set({
        phone: `[SCRUBBED_${userId}]`,
        name: "[Deleted User]",
        refreshToken: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // 2. Delete Profile Mapping
    if (user.role === UserRole.TEACHER) {
      await tx.delete(teacherProfiles).where(eq(teacherProfiles.id, userId));
    } else if (user.role === UserRole.PARENT) {
      // Scrub and soft delete students registered under this parent first
      const parentStudents = await tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.parentId, userId));

      const studentIds = parentStudents.map((s) => s.id);
      if (studentIds.length > 0) {
        await tx
          .update(students)
          .set({
            parentId: null, // satisfied constraint
            name: "Scrubbed Student",
            rollNumber: null,
            phone: null,
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(inArray(students.id, studentIds));
      }

      await tx.delete(parentProfiles).where(eq(parentProfiles.id, userId));
    }

    // 3. Scrub Messages Content
    await tx
      .update(messages)
      .set({
        content: "[Deleted User Message]",
        attachments: null,
        updatedAt: new Date(),
      })
      .where(eq(messages.senderId, userId));

    // 4. Delete device tokens & consent records
    await tx.delete(deviceTokens).where(eq(deviceTokens.userId, userId));
    await tx.delete(consentLogs).where(eq(consentLogs.userId, userId));
  });

  const response: ApiResponse = {
    success: true,
    data: { message: "User PII scrubbed and account deactivated successfully." },
  };
  return c.json(response, 200);
});

export { userRoutes };
