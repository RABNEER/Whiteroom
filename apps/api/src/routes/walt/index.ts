import type { Context } from "hono";
import { Errors, UserRole } from "@whiteroom/shared";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import {
  solveDoubt,
  generateQuizFromFiles,
  generateFlashcardsFromFiles,
  getPrincipalInsights,
  autoDraftNotice,
} from "../../services/walt.js";
import { verifyClassAccess } from "../archive/index.js";

/**
 * POST /api/v1/chat/rooms/:roomId/walt
 * Student or teacher asking Walt AI a doubt.
 */
export async function waltDoubtHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const roomId = c.req.param("roomId")!;
  const body = await c.req.json().catch(() => ({}));
  const question = body.question || body.content;

  if (!question) {
    throw Errors.validation("Question is required");
  }

  // Verify class access
  await verifyClassAccess(user.userId, user.tenantId, user.role, roomId);

  const result = await solveDoubt(user.tenantId, roomId, question, user.role);

  const response: ApiResponse = {
    success: true,
    data: result,
  };
  return c.json(response, 200);
}

/**
 * POST /api/v1/classes/:id/walt/quiz
 * Generate an MCQ quiz from uploaded study materials.
 */
export async function waltQuizHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;
  const body = await c.req.json().catch(() => ({}));
  const { title } = body;

  if (!title) {
    throw Errors.validation("Quiz title is required");
  }

  // Verify class access
  await verifyClassAccess(user.userId, user.tenantId, user.role, classId);

  const quiz = await generateQuizFromFiles(user.tenantId, classId, title);

  const response: ApiResponse = {
    success: true,
    data: quiz,
  };
  return c.json(response, 201);
}

/**
 * POST /api/v1/classes/:id/walt/flashcards
 * Generate concept flashcards from classroom files.
 */
export async function waltFlashcardHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const classId = c.req.param("id")!;

  // Verify class access
  await verifyClassAccess(user.userId, user.tenantId, user.role, classId);

  const flashcards = await generateFlashcardsFromFiles(user.tenantId, classId);

  const response: ApiResponse = {
    success: true,
    data: flashcards,
  };
  return c.json(response, 200);
}

/**
 * GET /api/v1/reports/insights
 * Retrieve principal insights dashboard data.
 */
export async function waltInsightsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  // Only school admins can access school-wide insights
  if (user.role !== UserRole.SCHOOL_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    throw Errors.forbidden("Only school administrators can access principal insights");
  }

  const insights = await getPrincipalInsights(user.tenantId);

  const response: ApiResponse = {
    success: true,
    data: insights,
  };
  return c.json(response, 200);
}

/**
 * POST /api/v1/walt/draft-notice
 * Draft bulletin notice from instructions.
 */
export async function waltDraftNoticeHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const body = await c.req.json().catch(() => ({}));
  const { classId, instructions } = body;

  if (!instructions) {
    throw Errors.validation("Instructions are required");
  }

  // Verify class access if classId is provided
  if (classId) {
    await verifyClassAccess(user.userId, user.tenantId, user.role, classId);
  }

  const draft = await autoDraftNotice(user.tenantId, classId || "", instructions);

  const response: ApiResponse = {
    success: true,
    data: draft,
  };
  return c.json(response, 200);
}
