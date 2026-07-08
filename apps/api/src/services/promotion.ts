import { db } from "../lib/db.js";
import { classEnrollments, classes, classPromotions } from "@whiteroom/db";
import { Errors } from "@whiteroom/shared";
import { and, eq, inArray, isNull } from "@whiteroom/db";
import { getParentUserIdsForStudents, sendPushToUsers } from "../lib/fcm.js";

export interface PromotionRuleInput {
  fromClassId: string;
  toClassId: string;
}

export interface PromoteAllInput {
  academicYear: string;
  promotionRules: PromotionRuleInput[];
  graduatingClassIds: string[];
}

export async function promoteAllStudents(
  tenantId: string,
  promotedBy: string,
  input: PromoteAllInput
) {
  const { academicYear, promotionRules, graduatingClassIds } = input;

  if (!academicYear) {
    throw Errors.validation("Academic year is required");
  }

  // 1. Check if promotion for this academic year has already been performed
  const [existingPromotion] = await db
    .select()
    .from(classPromotions)
    .where(
      and(
        eq(classPromotions.tenantId, tenantId),
        eq(classPromotions.academicYear, academicYear)
      )
    )
    .limit(1);

  if (existingPromotion) {
    throw Errors.validation(
      `Promotion for academic year ${academicYear} has already been executed.`
    );
  }

  // 2. Fetch all classes in the tenant to validate and resolve names
  const allClassIds = [
    ...promotionRules.map((r) => r.fromClassId),
    ...promotionRules.map((r) => r.toClassId),
    ...graduatingClassIds,
  ];

  if (allClassIds.length === 0) {
    throw Errors.validation("No classes specified for promotion or graduation");
  }

  const tenantClasses = await db
    .select()
    .from(classes)
    .where(and(eq(classes.tenantId, tenantId), isNull(classes.deletedAt)));

  const classMap = new Map(tenantClasses.map((c) => [c.id, c]));

  // Validate that all specified classes exist and belong to the tenant
  for (const classId of allClassIds) {
    if (!classMap.has(classId)) {
      throw Errors.notFound(`Classroom ${classId}`);
    }
  }

  // Map rules to audit format (with names)
  const auditRules = promotionRules.map((rule) => {
    const fromClass = classMap.get(rule.fromClassId)!;
    const toClass = classMap.get(rule.toClassId)!;
    return {
      fromClassId: rule.fromClassId,
      toClassId: rule.toClassId,
      fromClassName: fromClass.name,
      toClassName: toClass.name,
    };
  });

  let totalPromoted = 0;
  let totalGraduated = 0;

  // Track notifications to send after transaction succeeds
  const promotionsToSend: { studentId: string; newClassName: string }[] = [];
  const graduationsToSend: { studentId: string; className: string }[] = [];

  // Execute database transactions to promote/graduate all in one block
  const result = await db.transaction(async (tx) => {
    // A. Handle graduating classes
    for (const graduatingClassId of graduatingClassIds) {
      const activeEnrollments = await tx
        .select()
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.classId, graduatingClassId),
            eq(classEnrollments.status, "active")
          )
        );

      if (activeEnrollments.length > 0) {
        const studentIds = activeEnrollments.map((e) => e.studentId);
        
        // Update old enrollments status to 'graduated'
        await tx
          .update(classEnrollments)
          .set({
            status: "graduated",
            promotedAt: new Date(),
          })
          .where(
            and(
              eq(classEnrollments.classId, graduatingClassId),
              inArray(classEnrollments.studentId, studentIds)
            )
          );

        totalGraduated += studentIds.length;
        
        const className = classMap.get(graduatingClassId)!.name;
        for (const sId of studentIds) {
          graduationsToSend.push({ studentId: sId, className });
        }
      }
    }

    // B. Handle promotions
    for (const rule of promotionRules) {
      const activeEnrollments = await tx
        .select()
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.classId, rule.fromClassId),
            eq(classEnrollments.status, "active")
          )
        );

      if (activeEnrollments.length > 0) {
        const studentIds = activeEnrollments.map((e) => e.studentId);

        // Update old enrollments to 'promoted'
        await tx
          .update(classEnrollments)
          .set({
            status: "promoted",
            promotedAt: new Date(),
          })
          .where(
            and(
              eq(classEnrollments.classId, rule.fromClassId),
              inArray(classEnrollments.studentId, studentIds)
            )
          );

        // Enroll students in new classes
        for (const studentId of studentIds) {
          // Check if already active in target class to prevent unique constraint crash
          const [existingActive] = await tx
            .select()
            .from(classEnrollments)
            .where(
              and(
                eq(classEnrollments.classId, rule.toClassId),
                eq(classEnrollments.studentId, studentId)
              )
            )
            .limit(1);

          if (existingActive) {
            if (existingActive.status !== "active") {
              await tx
                .update(classEnrollments)
                .set({
                  status: "active",
                  enrolledAt: new Date(),
                })
                .where(
                  and(
                    eq(classEnrollments.classId, rule.toClassId),
                    eq(classEnrollments.studentId, studentId)
                  )
                );
            }
          } else {
            await tx.insert(classEnrollments).values({
              classId: rule.toClassId,
              studentId,
              status: "active",
              enrolledAt: new Date(),
            });
          }
        }

        totalPromoted += studentIds.length;

        const toClassName = classMap.get(rule.toClassId)!.name;
        for (const sId of studentIds) {
          promotionsToSend.push({ studentId: sId, newClassName: toClassName });
        }
      }

      // Update academicYear of target class
      await tx
        .update(classes)
        .set({
          academicYear,
          updatedAt: new Date(),
        })
        .where(eq(classes.id, rule.toClassId));
    }

    // C. Write audit record
    const [promotionLog] = await tx
      .insert(classPromotions)
      .values({
        tenantId,
        academicYear,
        promotedBy,
        promotionRules: auditRules,
        graduatingClassIds,
        studentsPromoted: totalPromoted,
        studentsGraduated: totalGraduated,
        promotionDate: new Date(),
      })
      .returning();

    return promotionLog;
  });

  // 5. Fire parent notifications (non-blocking, fire-and-forget)
  // Send notifications for promotions
  if (promotionsToSend.length > 0) {
    const studentIds = promotionsToSend.map((p) => p.studentId);
    const parentLinks = await getParentUserIdsForStudents(tenantId, studentIds);
    const parentMap = new Map(parentLinks.map((p) => [p.studentId, p.parentId]));

    for (const promotion of promotionsToSend) {
      const parentId = parentMap.get(promotion.studentId);
      if (parentId) {
        sendPushToUsers(tenantId, [parentId], {
          title: "Class Promotion 🎓",
          body: `Your child has been promoted to ${promotion.newClassName} for academic year ${academicYear}.`,
          type: "reminder",
        });
      }
    }
  }

  // Send notifications for graduations
  if (graduationsToSend.length > 0) {
    const studentIds = graduationsToSend.map((g) => g.studentId);
    const parentLinks = await getParentUserIdsForStudents(tenantId, studentIds);
    const parentMap = new Map(parentLinks.map((p) => [p.studentId, p.parentId]));

    for (const graduation of graduationsToSend) {
      const parentId = parentMap.get(graduation.studentId);
      if (parentId) {
        sendPushToUsers(tenantId, [parentId], {
          title: "Congratulations! 🎉",
          body: `Your child has graduated from ${graduation.className}.`,
          type: "reminder",
        });
      }
    }
  }

  return result;
}

export async function listPromotionHistory(
  tenantId: string,
  options?: { page?: number; limit?: number }
) {
  const page = Math.max(1, options?.page ?? 1);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
  const offset = (page - 1) * limit;

  const data = await db
    .select()
    .from(classPromotions)
    .where(eq(classPromotions.tenantId, tenantId))
    .orderBy(classPromotions.createdAt)
    .limit(limit)
    .offset(offset);

  return data;
}
