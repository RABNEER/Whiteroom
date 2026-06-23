import type { Context } from "hono";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { promoteAllStudents, listPromotionHistory } from "../../services/promotion.js";

export async function promoteAllHandler(c: Context) {
  const user = c.get("user") as JWTPayload;
  const body = await c.req.json();

  const result = await promoteAllStudents(user.tenantId, user.userId, {
    academicYear: body.academicYear,
    promotionRules: body.promotionRules || [],
    graduatingClassIds: body.graduatingClassIds || [],
  });

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}

export async function listPromotionsHandler(c: Context) {
  const user = c.get("user") as JWTPayload;

  const result = await listPromotionHistory(user.tenantId);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  return c.json(response, 200);
}
