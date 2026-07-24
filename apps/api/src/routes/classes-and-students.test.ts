import { describe, expect, it, beforeAll } from "vitest";
import { Hono } from "hono";
import { db } from "../lib/db.js";
import {
  users,
  tenants,
  classes,
  students,
  classEnrollments,
  userTenants,
  inArray,
} from "@whiteroom/db";
import { signAccessToken } from "../lib/jwt.js";
import { UserRole, PlanTier } from "@whiteroom/shared";
import { classRoutes } from "./classes/index.js";
import { studentRoutes } from "./students/index.js";
import { errorHandler } from "../middleware/error.js";
import { hashSHA256 } from "../lib/otp.js";

describe("Classes, Students & Enrollment Integration Tests", () => {
  const testApp = new Hono();

  // Test identifiers
  const tenantAId = "test-cs-tenant-a";
  const tenantBId = "test-cs-tenant-b";

  const adminAId = "test-cs-admin-a";
  const adminBId = "test-cs-admin-b";

  let adminAToken: string;
  let adminBToken: string;

  let createdStudentA1Id: string;
  let createdStudentA2Id: string;
  let createdClassAId: string;

  const cleanUp = async () => {
    try {
      // Find all classes/students created under test tenants
      const tenantClasses = await db.select({ id: classes.id }).from(classes).where(inArray(classes.tenantId, [tenantAId, tenantBId]));
      const classIds = tenantClasses.map(c => c.id);
      if (classIds.length > 0) {
        await db.delete(classEnrollments).where(inArray(classEnrollments.classId, classIds));
      }

      await db.delete(students).where(inArray(students.tenantId, [tenantAId, tenantBId]));
      await db.delete(classes).where(inArray(classes.tenantId, [tenantAId, tenantBId]));

      await db.delete(userTenants).where(inArray(userTenants.userId, [adminAId, adminBId]));
      await db.delete(users).where(inArray(users.id, [adminAId, adminBId]));
      await db.delete(tenants).where(inArray(tenants.id, [tenantAId, tenantBId]));
    } catch (err) {
      console.error("Cleanup failed:", err);
    }
  };

  beforeAll(async () => {
    await cleanUp();

    testApp.onError(errorHandler);
    testApp.route("/api/v1/classes", classRoutes);
    testApp.route("/api/v1/students", studentRoutes);

    await db.insert(tenants).values([
      { id: tenantAId, name: "Alpha High School", slug: "alpha-high", inviteCode: "ALPH01", phone: "+919800000001" },
      { id: tenantBId, name: "Beta High School", slug: "beta-high", inviteCode: "BETA02", phone: "+919800000002" },
    ]).onConflictDoNothing();

    await db.insert(users).values([
      { id: adminAId, phone: hashSHA256("+919800000001"), role: UserRole.SCHOOL_ADMIN, tenantId: tenantAId },
      { id: adminBId, phone: hashSHA256("+919800000002"), role: UserRole.SCHOOL_ADMIN, tenantId: tenantBId },
    ]).onConflictDoNothing();

    await db.insert(userTenants).values([
      { userId: adminAId, tenantId: tenantAId, role: UserRole.SCHOOL_ADMIN, status: "active", activeTenant: true },
      { userId: adminBId, tenantId: tenantBId, role: UserRole.SCHOOL_ADMIN, status: "active", activeTenant: true },
    ]).onConflictDoNothing();

    adminAToken = await signAccessToken({
      userId: adminAId,
      tenantId: tenantAId,
      role: UserRole.SCHOOL_ADMIN,
      plan: PlanTier.PRO,
      activeTenantId: tenantAId,
      tenants: [{ tenantId: tenantAId, role: UserRole.SCHOOL_ADMIN, status: "active" }],
    });

    adminBToken = await signAccessToken({
      userId: adminBId,
      tenantId: tenantBId,
      role: UserRole.SCHOOL_ADMIN,
      plan: PlanTier.PRO,
      activeTenantId: tenantBId,
      tenants: [{ tenantId: tenantBId, role: UserRole.SCHOOL_ADMIN, status: "active" }],
    });
  });

  describe("Student Lifecycle & CRUD", () => {
    it("should create a new student in Tenant A", async () => {
      const res = await testApp.request("/api/v1/students", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Aarav Sharma",
          rollNumber: "ROLL-101",
          phone: "9876543210",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Aarav Sharma");
      expect(body.data.rollNumber).toBe("ROLL-101");
      expect(body.data.tenantId).toBe(tenantAId);
      createdStudentA1Id = body.data.id;
    });

    it("should create a second student in Tenant A", async () => {
      const res = await testApp.request("/api/v1/students", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Diya Patel",
          rollNumber: "ROLL-102",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Diya Patel");
      createdStudentA2Id = body.data.id;
    });

    it("should fail validation if student name is empty", async () => {
      const res = await testApp.request("/api/v1/students", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should list students for Tenant A and see both students", async () => {
      const res = await testApp.request("/api/v1/students?limit=50", {
        method: "GET",
        headers: { Authorization: `Bearer ${adminAToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.data.length).toBeGreaterThanOrEqual(2);
      const names = body.data.data.map((s: any) => s.name);
      expect(names).toContain("Aarav Sharma");
      expect(names).toContain("Diya Patel");
    });

    it("should update student details cleanly", async () => {
      const res = await testApp.request(`/api/v1/students/${createdStudentA1Id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Aarav Sharma (Updated)",
          rollNumber: "ROLL-101-UP",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Aarav Sharma (Updated)");
      expect(body.data.rollNumber).toBe("ROLL-101-UP");
    });
  });

  describe("Classroom Lifecycle & Enrollment", () => {
    it("should create a new classroom in Tenant A", async () => {
      const res = await testApp.request("/api/v1/classes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Grade 10 - Section A",
          subject: "Advanced Mathematics",
          teacherName: "Mr. Verma",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Grade 10 - Section A");
      expect(body.data.subject).toBe("Advanced Mathematics");
      expect(body.data.tenantId).toBe(tenantAId);
      createdClassAId = body.data.id;
    });

    it("should enroll both students into the classroom", async () => {
      const res = await testApp.request(`/api/v1/classes/${createdClassAId}/students`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentIds: [createdStudentA1Id, createdStudentA2Id],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.enrolled).toBe(2);
    });

    it("should handle duplicate enrollment idempotently without throwing DB constraint errors", async () => {
      const res = await testApp.request(`/api/v1/classes/${createdClassAId}/students`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentIds: [createdStudentA1Id],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.enrolled).toBe(0);
      expect(body.data.skipped).toBe(1);
    });

    it("should list enrolled students in the classroom", async () => {
      const res = await testApp.request(`/api/v1/classes/${createdClassAId}/students`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminAToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.data.length).toBe(2);
    });

    it("should toggle class monitor status for a student", async () => {
      const res = await testApp.request(`/api/v1/classes/${createdClassAId}/students/${createdStudentA1Id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isMonitor: true }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.isMonitor).toBe(true);
    });

    it("should remove a student from the classroom", async () => {
      const res = await testApp.request(`/api/v1/classes/${createdClassAId}/students/${createdStudentA2Id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminAToken}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify list now has 1 student left
      const listRes = await testApp.request(`/api/v1/classes/${createdClassAId}/students`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminAToken}` },
      });
      const listBody = await listRes.json();
      expect(listBody.data.data.length).toBe(1);
    });
  });

  describe("Tenant Isolation & Security Checks", () => {
    it("should block Admin B (Tenant B) from accessing Tenant A students", async () => {
      const res = await testApp.request(`/api/v1/students/${createdStudentA1Id}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${adminBToken}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("should block Admin B (Tenant B) from enrolling Tenant A student into their class or vice versa", async () => {
      const res = await testApp.request(`/api/v1/classes/${createdClassAId}/students`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminBToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studentIds: [createdStudentA1Id],
        }),
      });

      expect(res.status).toBe(404);
    });
  });
});
