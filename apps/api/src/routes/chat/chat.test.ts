import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { chatRoutes } from "./index.js";
import { db } from "../../lib/db.js";
import {
  users,
  tenants,
  classes,
  dmRooms,
  messages,
  userTenants,
  userBlocks,
  roomMutes,
  messageReceipts,
  messageAuditLogs,
  eq,
  inArray,
} from "@whiteroom/db";
import { encryptMessage, decryptMessage } from "../../services/chat.js";
import { signAccessToken } from "../../lib/jwt.js";
import { UserRole } from "@whiteroom/shared";

describe("Native Chat API Routes", () => {
  let tenantId = "test-tenant-chat-id";
  let schoolAdminId = "test-admin-id";
  let teacherId = "test-teacher-id";
  let parentId = "test-parent-id";
  let blockParentId = "test-blocked-parent-id";
  let classId = "test-class-id";
  
  let adminToken: string;
  let teacherToken: string;
  let parentToken: string;
  let blockedParentToken: string;

  const cleanUp = async () => {
    // Delete in dependency order
    await db.delete(userBlocks).where(eq(userBlocks.tenantId, tenantId));
    await db.delete(roomMutes).where(eq(roomMutes.tenantId, tenantId));
    await db.delete(messageReceipts).where(eq(messageReceipts.tenantId, tenantId));
    await db.delete(messageAuditLogs).where(eq(messageAuditLogs.tenantId, tenantId));
    await db.delete(messages).where(eq(messages.tenantId, tenantId));
    await db.delete(dmRooms).where(eq(dmRooms.tenantId, tenantId));
    await db.delete(classes).where(eq(classes.tenantId, tenantId));
    await db.delete(userTenants).where(eq(userTenants.tenantId, tenantId));
    await db.delete(users).where(inArray(users.id, [schoolAdminId, teacherId, parentId, blockParentId]));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  };

  beforeAll(async () => {
    await cleanUp();

    // 1. Create Tenant
    await db.insert(tenants).values({
      id: tenantId,
      name: "Chat Test Academy",
      slug: "chat-test-academy",
      inviteCode: "CHT123",
      phone: "+919999999902",
    });

    // 2. Create Users
    await db.insert(users).values([
      { id: schoolAdminId, phone: "+919999999903", role: UserRole.SCHOOL_ADMIN, tenantId },
      { id: teacherId, phone: "+919999999904", role: UserRole.TEACHER, tenantId },
      { id: parentId, phone: "+919999999905", role: UserRole.PARENT, tenantId },
      { id: blockParentId, phone: "+919999999906", role: UserRole.PARENT, tenantId },
    ]);

    await db.insert(userTenants).values([
      { userId: schoolAdminId, tenantId, role: UserRole.SCHOOL_ADMIN, status: "active" },
      { userId: teacherId, tenantId, role: UserRole.TEACHER, status: "active" },
      { userId: parentId, tenantId, role: UserRole.PARENT, status: "active" },
      { userId: blockParentId, tenantId, role: UserRole.PARENT, status: "active" },
    ]);

    // 3. Create a Classroom
    await db.insert(classes).values({
      id: classId,
      tenantId,
      name: "Class 10 - Chat Test",
      teacherId,
      teacherName: "Chat Educator",
      chatMode: "announcement", // Default to announcement
    });

    // 4. Generate Auth Tokens
    const payload = (uid: string, r: string) => ({
      userId: uid,
      tenantId,
      role: r,
      plan: "free",
      activeTenantId: tenantId,
      tenants: [{ tenantId, role: r, status: "active" }],
    });

    [adminToken, teacherToken, parentToken, blockedParentToken] = await Promise.all([
      signAccessToken(payload(schoolAdminId, UserRole.SCHOOL_ADMIN)),
      signAccessToken(payload(teacherId, UserRole.TEACHER)),
      signAccessToken(payload(parentId, UserRole.PARENT)),
      signAccessToken(payload(blockParentId, UserRole.PARENT)),
    ]);
  });

  afterAll(async () => {
    await cleanUp();
  });

  describe("Encryption Helpers", () => {
    it("encrypts and decrypts text messages properly using tenant-specific key", () => {
      const plaintext = "Secret direct message content!";
      const encrypted = encryptMessage(plaintext, tenantId);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.split(":").length).toBe(3);

      const decrypted = decryptMessage(encrypted, tenantId);
      expect(decrypted).toBe(plaintext);
    });

    it("fails gracefully when decrypting non-encrypted text", () => {
      const plaintext = "Unencrypted text";
      const decrypted = decryptMessage(plaintext, tenantId);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("API Route Integration", () => {
    it("denies parents from sending messages in announcement-mode classrooms", async () => {
      const res = await chatRoutes.request(`/rooms/${classId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${parentToken}`,
        },
        body: JSON.stringify({
          roomType: "classroom",
          content: "Hello class!",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json() as any;
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("allows teachers to send messages in announcement-mode classrooms", async () => {
      const res = await chatRoutes.request(`/rooms/${classId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({
          roomType: "classroom",
          content: "Important notice: Exam tomorrow!",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.content).toBe("Important notice: Exam tomorrow!");
    });

    it("blocks DMs when a user blocks another", async () => {
      // 1. Create a DM Room
      const [dmRoom] = await db.insert(dmRooms).values({
        tenantId,
        participant1Id: teacherId,
        participant2Id: blockParentId,
      }).returning();

      // 2. Teacher blocks Parent
      await db.insert(userBlocks).values({
        tenantId,
        userId: teacherId,
        blockedUserId: blockParentId,
      });

      // 3. Blocked parent attempts to send DM
      const res = await chatRoutes.request(`/rooms/${dmRoom.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${blockedParentToken}`,
        },
        body: JSON.stringify({
          roomType: "direct_message",
          content: "Hi teacher!",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json() as any;
      expect(body.error).toBeDefined();
      expect(body.error.message).toContain("cannot message this user");
    });

    it("allows School Admin to audit and read any DMs in their tenant", async () => {
      // 1. Create DM room between Teacher and Parent
      const [dmRoom] = await db.insert(dmRooms).values({
        tenantId,
        participant1Id: teacherId,
        participant2Id: parentId,
      }).returning();

      // 2. Teacher sends DM to Parent (stored encrypted)
      const secretMessage = "Confidential meeting tomorrow.";
      const encryptedContent = encryptMessage(secretMessage, tenantId);
      
      await db.insert(messages).values({
        tenantId,
        roomId: dmRoom.id,
        roomType: "direct_message",
        senderId: teacherId,
        content: encryptedContent,
      });

      // 3. School Admin fetches and audits the DM messages
      const res = await chatRoutes.request(`/rooms/${dmRoom.id}/messages?roomType=direct_message`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data[0].content).toBe(secretMessage); // Decrypted successfully for Admin
    });
  });
});
