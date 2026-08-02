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
    // A. Handle graduating classes (Batched single query)
    if (graduatingClassIds.length > 0) {
      const activeGraduatingEnrollments = await tx
        .select()
        .from(classEnrollments)
        .where(
          and(
            inArray(classEnrollments.classId, graduatingClassIds),
            eq(classEnrollments.status, "active")
          )
        );

      const enrollmentsByClass = new Map<string, string[]>();
      for (const e of activeGraduatingEnrollments) {
        const list = enrollmentsByClass.get(e.classId) || [];
        list.push(e.studentId);
        enrollmentsByClass.set(e.classId, list);
      }

      for (const graduatingClassId of graduatingClassIds) {
        const studentIds = enrollmentsByClass.get(graduatingClassId) || [];
        if (studentIds.length > 0) {
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
    }

    // B. Handle promotions (Batched single query)
    const fromClassIds = promotionRules.map((r) => r.fromClassId);
    if (fromClassIds.length > 0) {
      const activePromotionEnrollments = await tx
        .select()
        .from(classEnrollments)
        .where(
          and(
            inArray(classEnrollments.classId, fromClassIds),
            eq(classEnrollments.status, "active")
          )
        );

      const promoByClass = new Map<string, string[]>();
      for (const e of activePromotionEnrollments) {
        const list = promoByClass.get(e.classId) || [];
        list.push(e.studentId);
        promoByClass.set(e.classId, list);
      }

      for (const rule of promotionRules) {
        const studentIds = promoByClass.get(rule.fromClassId) || [];

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

        // Batch check if students already exist in target class
        const existingTargetEnrollments = await tx
          .select()
          .from(classEnrollments)
          .where(
            and(
              eq(classEnrollments.classId, rule.toClassId),
              inArray(classEnrollments.studentId, studentIds)
            )
          );

        const existingMap = new Map(existingTargetEnrollments.map((e) => [e.studentId, e]));
        const studentsToUpdate: string[] = [];
        const studentsToInsert: string[] = [];

        for (const studentId of studentIds) {
          const existing = existingMap.get(studentId);
          if (existing) {
            if (existing.status !== "active") {
              studentsToUpdate.push(studentId);
            }
          } else {
            studentsToInsert.push(studentId);
          }
        }

        if (studentsToUpdate.length > 0) {
          await tx
            .update(classEnrollments)
            .set({
              status: "active",
              enrolledAt: new Date(),
            })
            .where(
              and(
                eq(classEnrollments.classId, rule.toClassId),
                inArray(classEnrollments.studentId, studentsToUpdate)
              )
            );
        }

        if (studentsToInsert.length > 0) {
          await tx.insert(classEnrollments).values(
            studentsToInsert.map((studentId) => ({
              classId: rule.toClassId,
              studentId,
              status: "active" as const,
              enrolledAt: new Date(),
            }))
          );
        }

        totalPromoted += studentIds.length;

        const toClassName = classMap.get(rule.toClassId)!.name;
        for (const sId of studentIds) {
          promotionsToSend.push({ studentId: sId, newClassName: toClassName });
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

  // 5. Fire parent notifications (non-blocking, batched by class name)
  if (promotionsToSend.length > 0) {
    const studentIds = promotionsToSend.map((p) => p.studentId);
    const parentLinks = await getParentUserIdsForStudents(tenantId, studentIds);
    const parentMap = new Map(parentLinks.map((p) => [p.studentId, p.parentId]));

    const groupedPromotions = new Map<string, string[]>();
    for (const promotion of promotionsToSend) {
      const parentId = parentMap.get(promotion.studentId);
      if (parentId) {
        const group = groupedPromotions.get(promotion.newClassName) ?? [];
        group.push(parentId);
        groupedPromotions.set(promotion.newClassName, group);
      }
    }

    for (const [newClassName, parentIds] of groupedPromotions.entries()) {
      sendPushToUsers(tenantId, parentIds, {
        title: "Class Promotion 🎓",
        body: `Your child has been promoted to ${newClassName} for academic year ${academicYear}.`,
        type: "reminder",
      });
    }
  }

  // Send notifications for graduations batched by class name
  if (graduationsToSend.length > 0) {
    const studentIds = graduationsToSend.map((g) => g.studentId);
    const parentLinks = await getParentUserIdsForStudents(tenantId, studentIds);
    const parentMap = new Map(parentLinks.map((p) => [p.studentId, p.parentId]));

    const groupedGraduations = new Map<string, string[]>();
    for (const graduation of graduationsToSend) {
      const parentId = parentMap.get(graduation.studentId);
      if (parentId) {
        const group = groupedGraduations.get(graduation.className) ?? [];
        group.push(parentId);
        groupedGraduations.set(graduation.className, group);
      }
    }

    for (const [className, parentIds] of groupedGraduations.entries()) {
      sendPushToUsers(tenantId, parentIds, {
        title: "Congratulations! 🎉",
        body: `Your child has graduated from ${className}.`,
        type: "reminder",
      });
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
