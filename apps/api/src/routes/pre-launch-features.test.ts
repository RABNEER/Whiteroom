import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Hono } from "hono";
import { db } from "../lib/db.js";
import {
  users,
  tenants,
  classes,
  students,
  classEnrollments,
  classPromotions,
  fileUploadSessions,
  fileUploadChunks,
  classroomFiles,
  auditLogs,
  rateLimits,
  eq,
  inArray,
} from "@whiteroom/db";
import { signAccessToken } from "../lib/jwt.js";
import { UserRole } from "@whiteroom/shared";
import { errorHandler } from "../middleware/error.js";
import { adminRoutes } from "./admin/index.js";
import { chunkedRoutes } from "./upload/chunked.js";
import { calculateSubscriptionFee } from "../services/billing.js";

describe("Pre-Launch Features Integration Tests", () => {
  const tenantId = "test-prelaunch-tenant-id";
  const schoolAdminId = "test-prelaunch-admin-id";
  const student1Id = "test-prelaunch-student-1";
  const student2Id = "test-prelaunch-student-2";
  const studentGradId = "test-prelaunch-student-grad";
  
  const classFromId = "test-prelaunch-class-from";
  const classToId = "test-prelaunch-class-to";
  const classGradId = "test-prelaunch-class-grad";

  let adminToken: string;

  const testApp = new Hono();

  const cleanUp = async () => {
    try {
      await db.delete(fileUploadChunks).where(eq(fileUploadChunks.tenantId, tenantId));
      await db.delete(fileUploadSessions).where(eq(fileUploadSessions.tenantId, tenantId));
      await db.delete(classroomFiles).where(eq(classroomFiles.tenantId, tenantId));
      await db.delete(classPromotions).where(eq(classPromotions.tenantId, tenantId));

      await db.delete(classEnrollments).where(
        inArray(classEnrollments.classId, [classFromId, classToId, classGradId])
      );
      await db.delete(students).where(eq(students.tenantId, tenantId));
      await db.delete(classes).where(eq(classes.tenantId, tenantId));
      await db.delete(users).where(eq(users.id, schoolAdminId));
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
      await db.delete(rateLimits);
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } catch (err) {
      console.error("Cleanup failed:", err);
    }
  };

  beforeAll(async () => {
    await cleanUp();

    // 1. Setup routers on testApp
    testApp.onError(errorHandler);
    testApp.route("/api/v1/admin", adminRoutes);
    testApp.route("/api/v1/upload", chunkedRoutes);

    // 2. Insert test data
    await db.insert(tenants).values({
      id: tenantId,
      name: "Pre-Launch Test School",
      slug: "pre-launch-test-school",
      inviteCode: "PLT123",
      phone: "+919999999920",
    });

    await db.insert(users).values({
      id: schoolAdminId,
      phone: "+919999999921",
      role: UserRole.SCHOOL_ADMIN,
      tenantId,
    });

    await db.insert(students).values([
      { id: student1Id, tenantId, name: "Student One" },
      { id: student2Id, tenantId, name: "Student Two" },
      { id: studentGradId, tenantId, name: "Student Graduating" },
    ]);

    await db.insert(classes).values([
      { id: classFromId, tenantId, name: "Class 9A", academicYear: "2025-2026" },
      { id: classToId, tenantId, name: "Class 10A", academicYear: "2025-2026" },
      { id: classGradId, tenantId, name: "Class 12A", academicYear: "2025-2026" },
    ]);

    await db.insert(classEnrollments).values([
      { classId: classFromId, studentId: student1Id, status: "active" },
      { classId: classFromId, studentId: student2Id, status: "active" },
      { classId: classGradId, studentId: studentGradId, status: "active" },
    ]);

    // 3. Generate Auth Tokens
    const payload = {
      userId: schoolAdminId,
      tenantId,
      role: UserRole.SCHOOL_ADMIN,
      plan: "free",
      activeTenantId: tenantId,
      tenants: [{ tenantId, role: UserRole.SCHOOL_ADMIN, status: "active" }],
    };

    adminToken = await signAccessToken(payload);
  });

  afterAll(async () => {
    await cleanUp();
  });

  describe("Feature 2: Annual Class Promotions", () => {
    it("successfully runs promote-all transaction for students and archives graduates", async () => {
      const res = await testApp.request("/api/v1/admin/promote-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          academicYear: "2026-2027",
          promotionRules: [
            { fromClassId: classFromId, toClassId: classToId }
          ],
          graduatingClassIds: [classGradId],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.studentsPromoted).toBe(2);
      expect(body.data.studentsGraduated).toBe(1);

      // Verify db changes
      const enrollments = await db
        .select()
        .from(classEnrollments)
        .where(inArray(classEnrollments.studentId, [student1Id, student2Id, studentGradId]));

      // Old enrollments in classFromId should be 'promoted'
      const oldEnrollments = enrollments.filter((e) => e.classId === classFromId);
      expect(oldEnrollments.length).toBe(2);
      expect(oldEnrollments.every((e) => e.status === "promoted")).toBe(true);

      // New enrollments in classToId should be 'active'
      const newEnrollments = enrollments.filter((e) => e.classId === classToId);
      expect(newEnrollments.length).toBe(2);
      expect(newEnrollments.every((e) => e.status === "active")).toBe(true);

      // Graduating student in classGradId should be 'graduated'
      const gradEnrollment = enrollments.find((e) => e.classId === classGradId);
      expect(gradEnrollment?.status).toBe("graduated");

      // Verify target class academicYear is updated
      const [toClass] = await db.select().from(classes).where(eq(classes.id, classToId));
      expect(toClass.academicYear).toBe("2026-2027");
    }, 15000);

    it("prevents duplicate promotion execution for the same academic year", async () => {
      const res = await testApp.request("/api/v1/admin/promote-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          academicYear: "2026-2027",
          promotionRules: [
            { fromClassId: classFromId, toClassId: classToId }
          ],
          graduatingClassIds: [classGradId],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("already been executed");
    });

    it("can list promotion logs history", async () => {
      const res = await testApp.request("/api/v1/admin/promotion-history", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(1);
      expect(body.data[0].academicYear).toBe("2026-2027");
    });
  });

  describe("Feature 3: Chunked Upload API", () => {
    let sessionId: string;
    const mockChecksum = "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"; // sha256 of "test"

    it("initializes a chunked upload session", async () => {
      const res = await testApp.request("/api/v1/upload/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          classId: classToId,
          fileName: "ChunkedTest.pdf",
          fileSize: 42,
          mimeType: "application/pdf",
          checksum: mockChecksum,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.sessionId).toBeDefined();
      sessionId = body.data.sessionId;
    });

    it("can check upload status of pending session", async () => {
      const res = await testApp.request(`/api/v1/upload/status/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("pending");
    });
  });

  describe("Feature 4: Billing Engine Surcharge & Flat rate updates", () => {
    it("calculates flat ₹5/student and no class-based charges for school plan", async () => {
      // 1 student enrolled in classToId currently
      const feeDetails = await calculateSubscriptionFee(tenantId, "school", false);
      
      // Total students in school currently = 3 (Student One, Student Two, Student Graduating)
      // Since student base fee is removed, total charge should be 3 * 5 = 15 Rupees -> 1500 paise.
      expect(feeDetails.breakdown.classesCharge).toBe(0);
      expect(feeDetails.breakdown.studentsCharge).toBe(3 * 5 * 100);
      expect(feeDetails.totalAmount).toBe(3 * 5 * 100);
    });

    it("adds exactly ₹400 for flat Walt AI add-on in school plan", async () => {
      const feeDetails = await calculateSubscriptionFee(tenantId, "school", true);
      
      expect(feeDetails.breakdown.waltCharge).toBe(400 * 100); // 40000 paise
      expect(feeDetails.totalAmount).toBe((3 * 5 * 100) + (400 * 100));
    });
  });
});
