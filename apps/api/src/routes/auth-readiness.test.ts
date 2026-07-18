import { describe, expect, it, beforeAll } from "vitest";
import { Hono } from "hono";
import { db } from "../lib/db.js";
import {
  users,
  tenants,
  classes,
  students,
  classEnrollments,
  parentProfiles,
  teacherProfiles,
  userTenants,
  idempotencyKeys,
  registrationTokens,
  subscriptions,
  billingTransactions,
  attendanceSessions,
  attendanceRecords,
  otpAttempts,
  rateLimits,
  auditLogs,
  eq,
  inArray,
} from "@whiteroom/db";
import { signAccessToken } from "../lib/jwt.js";
import { UserRole, PlanTier } from "@whiteroom/shared";
import { authRoutes } from "./auth/index.js";
import { classRoutes } from "./classes/index.js";
import { parentRoutes } from "./parent/index.js";
import { attendanceRoutes } from "./attendance/index.js";
import { paymentRoutes } from "./payments/index.js";
import { errorHandler } from "../middleware/error.js";
import { hashSHA256 } from "../lib/otp.js";
import crypto from "node:crypto";

describe("Auth Readiness & Security Integration Tests", () => {
  const testApp = new Hono();

  // Test identifiers
  const tenantAId = "test-ready-tenant-a";
  const tenantBId = "test-ready-tenant-b";

  const adminAId = "test-ready-admin-a";
  const adminBId = "test-ready-admin-b";
  const parentAId = "test-ready-parent-a";
  
  const studentAId = "test-ready-student-a";
  const studentBId = "test-ready-student-b";

  const classAId = "test-ready-class-a";
  const classBId = "test-ready-class-b";

  const sessionAId = "test-ready-session-a";

  let adminAToken: string;
  let adminBToken: string;
  let parentAToken: string;

  const cleanUp = async () => {
    try {
      // Delete attendance records and sessions
      await db.delete(attendanceRecords).where(
        inArray(attendanceRecords.studentId, [studentAId, studentBId])
      );
      await db.delete(attendanceSessions).where(eq(attendanceSessions.id, sessionAId));

      // Delete payments/subscriptions/idempotencies
      await db.delete(subscriptions).where(
        inArray(subscriptions.tenantId, [tenantAId, tenantBId])
      );
      await db.delete(idempotencyKeys).where(
        inArray(idempotencyKeys.tenantId, [tenantAId, tenantBId])
      );

      // Delete registration tokens for test phones
      const phoneA = "+919999999991";
      const phoneB = "+919999999992";
      await db.delete(registrationTokens).where(
        inArray(registrationTokens.phone, [hashSHA256(phoneA), hashSHA256(phoneB)])
      );

      // Delete enrollments and students
      await db.delete(classEnrollments).where(
        inArray(classEnrollments.classId, [classAId, classBId])
      );
      await db.delete(students).where(
        inArray(students.id, [studentAId, studentBId])
      );
      await db.delete(classes).where(
        inArray(classes.id, [classAId, classBId])
      );

      // Delete subscriptions, idempotency keys, billing transactions
      await db.delete(billingTransactions).where(
        inArray(billingTransactions.tenantId, [tenantAId, tenantBId])
      );
      await db.delete(subscriptions).where(
        inArray(subscriptions.tenantId, [tenantAId, tenantBId])
      );
      await db.delete(idempotencyKeys).where(
        inArray(idempotencyKeys.tenantId, [tenantAId, tenantBId])
      );
      await db.delete(rateLimits);

      // Delete user tenants & profiles
      await db.delete(userTenants).where(
        inArray(userTenants.userId, [adminAId, adminBId, parentAId])
      );
      await db.delete(parentProfiles).where(
        inArray(parentProfiles.userId, [parentAId])
      );
      await db.delete(teacherProfiles).where(
        inArray(teacherProfiles.userId, [adminAId, adminBId])
      );

      // Delete users & tenants
      await db.delete(users).where(
        inArray(users.id, [adminAId, adminBId, parentAId])
      );
      await db.delete(auditLogs).where(
        inArray(auditLogs.tenantId, [tenantAId, tenantBId])
      );
      await db.delete(tenants).where(
        inArray(tenants.id, [tenantAId, tenantBId])
      );
    } catch (err) {
      console.error("Cleanup failed:", err);
    }
  };

  beforeAll(async () => {
    await cleanUp();

    // 1. Setup routers on testApp
    testApp.onError(errorHandler);
    testApp.route("/api/v1/auth", authRoutes);
    testApp.route("/api/v1/classes", classRoutes);
    testApp.route("/api/v1/parent", parentRoutes);
    testApp.route("/api/v1/attendance", attendanceRoutes);
    testApp.route("/api/v1/payments", paymentRoutes);

    // 2. Insert baseline test data
    await db.insert(tenants).values([
      { id: tenantAId, name: "Tenant A School", slug: "tenant-a-school", inviteCode: "TENA12", phone: "+919999999991" },
      { id: tenantBId, name: "Tenant B School", slug: "tenant-b-school", inviteCode: "TENB34", phone: "+919999999992" },
    ]).onConflictDoNothing();

    await db.insert(users).values([
      { id: adminAId, phone: hashSHA256("+919999999991"), role: UserRole.TEACHER, tenantId: tenantAId },
      { id: adminBId, phone: hashSHA256("+919999999992"), role: UserRole.TEACHER, tenantId: tenantBId },
      { id: parentAId, phone: hashSHA256("+919999999993"), role: UserRole.PARENT, tenantId: tenantAId },
    ]).onConflictDoNothing();

    await db.insert(userTenants).values([
      { userId: adminAId, tenantId: tenantAId, role: UserRole.TEACHER, status: "active", activeTenant: true },
      { userId: adminBId, tenantId: tenantBId, role: UserRole.TEACHER, status: "active", activeTenant: true },
      { userId: parentAId, tenantId: tenantAId, role: UserRole.PARENT, status: "active", activeTenant: true },
    ]).onConflictDoNothing();

    await db.insert(parentProfiles).values({
      userId: parentAId,
      tenantId: tenantAId,
    }).onConflictDoNothing();

    // Student A (Tenant A) is owned by parentA
    const [parentA] = await db.select().from(parentProfiles).where(eq(parentProfiles.userId, parentAId)).limit(1);
    await db.insert(students).values([
      { id: studentAId, tenantId: tenantAId, name: "Student A", parentId: parentA!.id },
      { id: studentBId, tenantId: tenantBId, name: "Student B" },
    ]).onConflictDoNothing();

    await db.insert(classes).values([
      { id: classAId, tenantId: tenantAId, name: "Class A", academicYear: "2026" },
      { id: classBId, tenantId: tenantBId, name: "Class B", academicYear: "2026" },
    ]).onConflictDoNothing();

    await db.insert(classEnrollments).values([
      { classId: classAId, studentId: studentAId, status: "active" },
      { classId: classBId, studentId: studentBId, status: "active" },
    ]).onConflictDoNothing();

    // Create attendance session in Class A
    await db.insert(attendanceSessions).values({
      id: sessionAId,
      tenantId: tenantAId,
      classId: classAId,
      date: "2026-07-01",
      status: "open",
    }).onConflictDoNothing();

    // 3. Generate access tokens
    adminAToken = await signAccessToken({
      userId: adminAId,
      tenantId: tenantAId,
      role: UserRole.TEACHER,
      plan: PlanTier.FREE,
      activeTenantId: tenantAId,
      tenants: [{ tenantId: tenantAId, role: UserRole.TEACHER, status: "active" }],
    });

    adminBToken = await signAccessToken({
      userId: adminBId,
      tenantId: tenantBId,
      role: UserRole.TEACHER,
      plan: PlanTier.FREE,
      activeTenantId: tenantBId,
      tenants: [{ tenantId: tenantBId, role: UserRole.TEACHER, status: "active" }],
    });

    parentAToken = await signAccessToken({
      userId: parentAId,
      tenantId: tenantAId,
      role: UserRole.PARENT,
      plan: PlanTier.FREE,
      activeTenantId: tenantAId,
      tenants: [{ tenantId: tenantAId, role: UserRole.PARENT, status: "active" }],
    });
  });

  describe("OTP verification bypass & registration", () => {
    it("should bypass OTP verification and return new_user type with registration token", async () => {
      // Insert valid OTP attempt for test execution
      const phoneHash = hashSHA256("+919999999994");
      const otpHash = hashSHA256("000000");
      await db.insert(otpAttempts).values({
        phoneHash,
        otp: otpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      });

      const res = await testApp.request("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "+919999999994",
          otp: "000000",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.type).toBe("new_user");
      expect(json.data.registrationToken).toBeDefined();
    });
  });

  describe("Tenant Isolation", () => {
    it("should return class A for Admin A, but not class B", async () => {
      const res = await testApp.request("/api/v1/classes", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${adminAToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      const classesList = json.data.data;
      const classIds = classesList.map((c: any) => c.id);
      expect(classIds).toContain(classAId);
      expect(classIds).not.toContain(classBId);
    });

    it("should block Admin B from updating Class A", async () => {
      const res = await testApp.request(`/api/v1/classes/${classAId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminBToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Hacked Class" }),
      });

      // Tenant isolation: gets 404 since class is queried within tenant scope
      expect(res.status).toBe(404);
    });
  });

  describe("Parent Ownership", () => {
    it("should allow parent A to access student A's attendance", async () => {
      const res = await testApp.request(`/api/v1/parent/children/${studentAId}/attendance`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${parentAToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
    });

    it("should block parent A from accessing student B's attendance", async () => {
      const res = await testApp.request(`/api/v1/parent/children/${studentBId}/attendance`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${parentAToken}`,
        },
      });

      expect(res.status).toBe(404); // returns 404 parent profile/student not found in parent's owned scope
    });
  });

  describe("Attendance Marking Validation", () => {
    it("should fail when marking student B (Tenant B) in tenant A session", async () => {
      const res = await testApp.request(`/api/v1/attendance/sessions/${sessionAId}/mark`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          records: [{ studentId: studentBId, status: "present" }],
          idempotencyKey: "a8a9a234-fed1-4d92-9111-9a7465cbca77",
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.error).toBeDefined();
      expect(json.error.message).toContain("All attendance records must belong to enrolled students");
    });
  });

  describe("Payments Webhook & Event Replay Idempotency", () => {
    it("should process new subscription, and handle replayed webhook event idempotently", async () => {
      const webhookPayload = {
        id: "evt_ready_test_1234",
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_ready_test_1234",
              order_id: "order_ready_test_1234",
              notes: {
                tenantId: tenantAId,
                plan: "pro_yearly",
              },
            },
          },
        },
      };

      const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "test-secret";
      if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
        process.env.RAZORPAY_WEBHOOK_SECRET = secret;
      }
      const bodyString = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac("sha256", secret)
        .update(bodyString)
        .digest("hex");

      // First webhook post -> expect success
      const res1 = await testApp.request("/api/v1/payments/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signature,
        },
        body: bodyString,
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json() as any;
      console.log("💳 Webhook Run 1 response:", json1);
      expect(json1.success).toBe(true);
      expect(json1.data.processed).toBe(true);
      expect(json1.data.alreadyProcessed).toBeUndefined();

      // Second webhook post (replay) -> expect alreadyProcessed: true
      const res2 = await testApp.request("/api/v1/payments/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": signature,
        },
        body: bodyString,
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json() as any;
      console.log("💳 Webhook Run 2 response:", json2);
      expect(json2.success).toBe(true);
      expect(json2.data.processed).toBe(true);
      expect(json2.data.alreadyProcessed).toBe(true);
    });
  });
});
