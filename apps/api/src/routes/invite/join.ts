import type { Context } from "hono";
import { z } from "zod";
import { db } from "../../lib/db.js";
import {
  users,
  tenants,
  userTenants,
  teacherProfiles,
  parentProfiles,
  consentLogs,
  students,
  classes,
  classEnrollments,
} from "@whiteroom/db";
import { signAccessToken, signRefreshToken } from "../../lib/jwt.js";
import { getTenantPlanTier } from "../../lib/subscription.js";
import { hashSHA256 } from "../../lib/otp.js";
import { Errors, UserRole } from "@whiteroom/shared";
import type { ApiResponse, OTPVerifyResponse, JWTPayload } from "@whiteroom/shared";
import { eq, and, isNull } from "@whiteroom/db";

const joinSchema = z.object({
  inviteCode: z.string().length(6),
  role: z.enum([UserRole.TEACHER, UserRole.PARENT]).optional(),
  studentName: z.string().trim().min(1).max(120).optional(),
  rollNumber: z.string().trim().min(1).max(40).optional(),
});

export async function joinInviteHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  if (!user) {
    throw Errors.unauthorized();
  }

  const body = await c.req.json();
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    throw Errors.validation("Invalid invite join request body.");
  }

  const { inviteCode, role: inputRole, studentName, rollNumber } = parsed.data;
  const targetRole = inputRole === UserRole.TEACHER ? UserRole.TEACHER : UserRole.PARENT;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.inviteCode, inviteCode.toUpperCase()), eq(tenants.isActive, true)))
    .limit(1);

  if (!tenant) {
    throw Errors.notFound("Invite code");
  }

  // Check if mapping already exists
  const [existingMapping] = await db
    .select()
    .from(userTenants)
    .where(and(eq(userTenants.userId, user.userId), eq(userTenants.tenantId, tenant.id)))
    .limit(1);

  await db.transaction(async (tx) => {
    // Deactivate all other tenants for this user
    await tx
      .update(userTenants)
      .set({ activeTenant: false })
      .where(eq(userTenants.userId, user.userId));

    if (existingMapping) {
      await tx
        .update(userTenants)
        .set({ activeTenant: true, role: targetRole })
        .where(eq(userTenants.id, existingMapping.id));
    } else {
      await tx.insert(userTenants).values({
        userId: user.userId,
        tenantId: tenant.id,
        role: targetRole,
        status: "active",
        activeTenant: true,
      });

      // Insert profile if missing
      if (targetRole === UserRole.TEACHER) {
        const [teacherProfile] = await tx
          .select()
          .from(teacherProfiles)
          .where(and(eq(teacherProfiles.userId, user.userId), eq(teacherProfiles.tenantId, tenant.id)))
          .limit(1);
        if (!teacherProfile) {
          await tx.insert(teacherProfiles).values({ userId: user.userId, tenantId: tenant.id });
        }
      } else {
        const [parentProfile] = await tx
          .select()
          .from(parentProfiles)
          .where(and(eq(parentProfiles.userId, user.userId), eq(parentProfiles.tenantId, tenant.id)))
          .limit(1);
        let parentProfileId = parentProfile?.id;
        if (!parentProfile) {
          const [createdParent] = await tx
            .insert(parentProfiles)
            .values({ userId: user.userId, tenantId: tenant.id })
            .returning();
          parentProfileId = createdParent!.id;
        }

        const [currentUser] = await tx
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, user.userId))
          .limit(1);

        const effectiveStudentName = studentName || currentUser?.name || "Student";
        const [existingStudent] = await tx
          .select()
          .from(students)
          .where(
            and(
              eq(students.tenantId, tenant.id),
              isNull(students.parentId),
              isNull(students.deletedAt),
              eq(students.name, effectiveStudentName)
            )
          )
          .limit(1);

        let linkedStudentId: string;
        if (existingStudent) {
          await tx
            .update(students)
            .set({ parentId: parentProfileId })
            .where(eq(students.id, existingStudent.id));
          linkedStudentId = existingStudent.id;
        } else {
          const [createdStudent] = await tx
            .insert(students)
            .values({
              tenantId: tenant.id,
              name: effectiveStudentName,
              rollNumber: rollNumber || null,
              parentId: parentProfileId,
            })
            .returning();
          linkedStudentId = createdStudent!.id;
        }

        const activeSchoolClasses = await tx
          .select({ id: classes.id })
          .from(classes)
          .where(and(eq(classes.tenantId, tenant.id), isNull(classes.deletedAt)));

        if (activeSchoolClasses.length > 0) {
          await tx
            .insert(classEnrollments)
            .values(
              activeSchoolClasses.map((cls) => ({
                classId: cls.id,
                studentId: linkedStudentId,
              }))
            )
            .onConflictDoNothing();
        }
      }

      await tx.insert(consentLogs).values({
        userId: user.userId,
        tenantId: tenant.id,
        consentType: "data_processing",
        ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
      });
    }

    // Also update main user record role and tenantId if needed
    await tx
      .update(users)
      .set({ role: targetRole, tenantId: tenant.id, updatedAt: new Date() })
      .where(eq(users.id, user.userId));
  });

  const userTenantRecords = await db
    .select({
      tenantId: userTenants.tenantId,
      role: userTenants.role,
      status: userTenants.status,
      tenantName: tenants.name,
    })
    .from(userTenants)
    .innerJoin(tenants, eq(userTenants.tenantId, tenants.id))
    .where(eq(userTenants.userId, user.userId));

  const tenantsPayload = userTenantRecords.map((r) => ({
    tenantId: r.tenantId,
    role: r.role,
    status: r.status,
  }));

  const plan = await getTenantPlanTier(tenant.id);
  const jwtPayload: JWTPayload = {
    userId: user.userId,
    tenantId: tenant.id,
    role: targetRole,
    plan,
    activeTenantId: tenant.id,
    tenants: tenantsPayload,
  };

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(jwtPayload),
    signRefreshToken(jwtPayload),
  ]);

  await db
    .update(users)
    .set({ refreshToken: hashSHA256(refreshToken), updatedAt: new Date() })
    .where(eq(users.id, user.userId));

  const response: ApiResponse<OTPVerifyResponse> = {
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user.userId,
        role: targetRole,
        tenantId: tenant.id,
        tenants: userTenantRecords.map((r) => ({
          tenantId: r.tenantId,
          role: r.role,
          status: r.status,
          tenantName: r.tenantName,
        })),
      },
      isNewUser: false,
    },
  };

  return c.json(response, 200);
}
