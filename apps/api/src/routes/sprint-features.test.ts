import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { db } from "../lib/db.js";
import {
  users,
  tenants,
  classes,
  students,
  classEnrollments,
  classroomFiles,
  classroomFileChunks,
  waltQuizzes,
  waltQuizResponses,
  bulletins,
  bulletinReads,
  messages,
  subscriptions,
  parentProfiles,
  teacherProfiles,
  eq,
  inArray,
} from "@whiteroom/db";
import { signAccessToken } from "../lib/jwt.js";
import { UserRole } from "@whiteroom/shared";
import { authMiddleware } from "../middleware/auth.js";
import { errorHandler } from "../middleware/error.js";
import { archiveRoutes } from "./archive/index.js";
import { billingRoutes } from "./billing/index.js";
import { bulletinsRoutes } from "./bulletins/index.js";
import { userRoutes } from "./users/index.js";
import {
  waltDoubtHandler,
  waltQuizHandler,
  waltFlashcardHandler,
  waltInsightsHandler,
  waltDraftNoticeHandler,
} from "./walt/index.js";
import { getEmbedding } from "../services/walt.js";

describe("Pre-Launch B2B Sprint Features", () => {
  const tenantId = "test-sprint-tenant-id";
  const schoolAdminId = "test-sprint-admin-id";
  const teacherId = "test-sprint-teacher-id";
  const parentId = "test-sprint-parent-id";
  const studentId = "test-sprint-student-id";
  const classId = "test-sprint-class-id";

  let adminToken: string;
  let teacherToken: string;
  let parentToken: string;

  const testApp = new Hono();

  const cleanUp = async () => {
    try {
      await Promise.all([
        db.delete(bulletinReads).where(eq(bulletinReads.tenantId, tenantId)),
        db.delete(bulletins).where(eq(bulletins.tenantId, tenantId)),
        db.delete(waltQuizResponses).where(eq(waltQuizResponses.studentId, studentId)),
        db.delete(waltQuizzes).where(eq(waltQuizzes.tenantId, tenantId)),
        db.delete(classroomFileChunks).where(eq(classroomFileChunks.tenantId, tenantId)),
        db.delete(classroomFiles).where(eq(classroomFiles.tenantId, tenantId)),
        db.delete(subscriptions).where(eq(subscriptions.tenantId, tenantId)),
        db.delete(classEnrollments).where(eq(classEnrollments.classId, classId)),
        db.delete(messages).where(eq(messages.tenantId, tenantId)),
      ]);

      await Promise.all([
        db.delete(students).where(eq(students.tenantId, tenantId)),
        db.delete(classes).where(eq(classes.tenantId, tenantId)),
      ]);

      await Promise.all([
        db.delete(parentProfiles).where(eq(parentProfiles.tenantId, tenantId)),
        db.delete(teacherProfiles).where(eq(teacherProfiles.tenantId, tenantId)),
      ]);

      await db.delete(users).where(inArray(users.id, [schoolAdminId, teacherId, parentId]));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } catch (err) {
      console.error("Cleanup failed:", err);
    }
  };

  beforeAll(async () => {
    await cleanUp();

    // 1. Setup routers on testApp
    testApp.onError(errorHandler);
    testApp.route("/api/v1/classes/:classId/archive", archiveRoutes);
    testApp.route("/api/v1/billing", billingRoutes);
    testApp.route("/api/v1/users", userRoutes);
    testApp.route("/api/v1/bulletins", bulletinsRoutes);
    testApp.post("/api/v1/chat/rooms/:roomId/walt", authMiddleware, waltDoubtHandler);
    testApp.post("/api/v1/classes/:id/walt/quiz", authMiddleware, waltQuizHandler);
    testApp.post("/api/v1/classes/:id/walt/flashcards", authMiddleware, waltFlashcardHandler);
    testApp.get("/api/v1/reports/insights", authMiddleware, waltInsightsHandler);
    testApp.post("/api/v1/walt/draft-notice", authMiddleware, waltDraftNoticeHandler);

    // 2. Insert test data
    await db.insert(tenants).values({
      id: tenantId,
      name: "Sprint Test Academy",
      slug: "sprint-test-academy",
      inviteCode: "SPR123",
      phone: "+919999999910",
      complianceBadges: ["DPDP", "GDPR"],
      trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // trial active
    });

    await db.insert(users).values([
      { id: schoolAdminId, phone: "+919999999911", role: UserRole.SCHOOL_ADMIN, tenantId },
      { id: teacherId, phone: "+919999999912", role: UserRole.TEACHER, tenantId },
      { id: parentId, phone: "+919999999913", role: UserRole.PARENT, tenantId },
    ]);

    const parentProfileId = "test-sprint-parent-profile-id";

    await db.insert(parentProfiles).values({
      id: parentProfileId,
      userId: parentId,
      tenantId,
    });

    await db.insert(teacherProfiles).values({
      id: teacherId,
      userId: teacherId,
      tenantId,
    });

    await db.insert(students).values({
      id: studentId,
      tenantId,
      name: "Sprint Pupil",
      rollNumber: "S42",
      parentId: parentProfileId,
    });

    await db.insert(classes).values({
      id: classId,
      tenantId,
      name: "Class 10 - Science",
      teacherId,
      teacherName: "Sprint Educator",
    });

    await db.insert(classEnrollments).values({
      classId,
      studentId,
    });

    // 3. Generate Auth Tokens
    const payload = (uid: string, r: string) => ({
      userId: uid,
      tenantId,
      role: r,
      plan: "free",
      activeTenantId: tenantId,
      tenants: [{ tenantId, role: r, status: "active" }],
    });

    [adminToken, teacherToken, parentToken] = await Promise.all([
      signAccessToken(payload(schoolAdminId, UserRole.SCHOOL_ADMIN)),
      signAccessToken(payload(teacherId, UserRole.TEACHER)),
      signAccessToken(payload(parentId, UserRole.PARENT)),
    ]);
  }, 30000);

  afterAll(async () => {
    await cleanUp();
  }, 30000);

  describe("Media & Document Archive", () => {
    it("allows teachers to upload files to classroom archive", async () => {
      const res = await testApp.request(`/api/v1/classes/${classId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({
          name: "Syllabus.pdf",
          url: "https://whiteroom.co.in/files/syllabus.pdf",
          type: "pdf",
          size: 1024,
          category: "Syllabus",
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Syllabus.pdf");
    });

    it("allows parents to list classroom archive files", async () => {
      const res = await testApp.request(`/api/v1/classes/${classId}/archive`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].category).toBe("Syllabus");
    });

    it("blocks parents from uploading files", async () => {
      const res = await testApp.request(`/api/v1/classes/${classId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${parentToken}`,
        },
        body: JSON.stringify({
          name: "CheatSheet.pdf",
          url: "https://whiteroom.co.in/files/cs.pdf",
          type: "pdf",
          size: 500,
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("Walt AI doubt solver & RAG Gating", () => {
    it("returns 'Out of Scope' when no materials are uploaded that match similarity", async () => {
      // Clear files/chunks so nothing matches
      await db.delete(classroomFileChunks).where(eq(classroomFileChunks.tenantId, tenantId));

      const res = await testApp.request(`/api/v1/chat/rooms/${classId}/walt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${parentToken}`,
        },
        body: JSON.stringify({
          question: "What is the capital of France?",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.answer).toBe("I'm sorry, but that question is outside the scope of the materials uploaded for this classroom.");
      expect(body.data.citations.length).toBe(0);
    });

    it("resolves doubt successfully and cites source when grounded chunks exist", async () => {
      // 1. Create a dummy file and chunks
      const [file] = await db
        .insert(classroomFiles)
        .values({
          tenantId,
          classId,
          uploaderId: teacherId,
          name: "Science_Ch1.pdf",
          url: "https://whiteroom.co.in/science1.pdf",
          type: "pdf",
          size: 2048,
          category: "Biology",
        })
        .returning();

      // Compute mock embedding for the scrubbed question to guarantee 100% similarity match
      const mockVector = await getEmbedding("Explain what is Photosynthesis? Call user phone [PHONE] or email [EMAIL]");

      await db.insert(classroomFileChunks).values({
        tenantId,
        fileId: file.id,
        content: "Photosynthesis is the process by which green plants manufacture food.",
        pageNumber: 3,
        embedding: mockVector,
      });

      // Override env to use mock completions/embeddings
      const res = await testApp.request(`/api/v1/chat/rooms/${classId}/walt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${parentToken}`,
        },
        body: JSON.stringify({
          question: "Explain what is Photosynthesis? Call user phone +919999999999 or email test@gmail.com",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.citations.length).toBeGreaterThan(0);
      expect(body.data.citations[0].fileName).toBe("Science_Ch1.pdf");
      expect(body.data.citations[0].pageNumber).toBe(3);
    });
  });

  describe("Billing & Subscription Engine", () => {
    it("reports dashboard status details and trial period", async () => {
      const res = await testApp.request("/api/v1/billing/dashboard", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.trialActive).toBe(true);
      expect(body.data.breakdown.classesCount).toBe(1);
    });

    it("subscribes and creates order successfully", async () => {
      const res = await testApp.request("/api/v1/billing/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          planType: "school",
          waltAiEnabled: true,
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
    });
  });

  describe("GDPR Data Export & Delete Cascading Scrub", () => {
    it("compiles structured data ZIP export for the parent", async () => {
      const res = await testApp.request("/api/v1/users/me/export", {
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/zip");
    });

    it("completely scrubs parent details and cascade soft deletes student on delete request", async () => {
      const res = await testApp.request("/api/v1/users/me", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${parentToken}`,
        },
      });

      expect(res.status).toBe(200);

      // Verify DB state
      const [userRow] = await db.select().from(users).where(eq(users.id, parentId)).limit(1);
      expect(userRow.phone).toContain("[SCRUBBED_");

      const [studentRow] = await db.select().from(students).where(eq(students.id, studentId)).limit(1);
      expect(studentRow.name).toBe("Scrubbed Student");
      expect(studentRow.deletedAt).not.toBeNull();
    }, 15000);
  });

  describe("Structured bulletins notices board", () => {
    let bulletinId: string;

    it("publishes bulletins correctly", async () => {
      const res = await testApp.request("/api/v1/bulletins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({
          title: "Exam fee deadline",
          body: "Submit standard exam fees before June 30.",
          category: "FEES",
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      bulletinId = body.data.id;
    });

    it("marks bulletin as read and tracks seen receipt details", async () => {
      // Admin marks read
      const readRes = await testApp.request(`/api/v1/bulletins/${bulletinId}/read`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });
      expect(readRes.status).toBe(200);

      // Fetch receipts list
      const receiptsRes = await testApp.request(`/api/v1/bulletins/${bulletinId}/receipts`, {
        headers: {
          Authorization: `Bearer ${teacherToken}`,
        },
      });

      expect(receiptsRes.status).toBe(200);
      const body = (await receiptsRes.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.seenCount).toBe(1);
      expect(body.data.seenBy[0].userId).toBe(schoolAdminId);
    });
  });
});
