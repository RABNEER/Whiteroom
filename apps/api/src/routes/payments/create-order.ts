import type { Context } from "hono";
import { z } from "zod";
import type { ApiResponse, JWTPayload } from "@whiteroom/shared";
import { Errors } from "@whiteroom/shared";
import { createSubscriptionOrder } from "../../services/payments.js";

const createOrderSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).optional(),
});

export async function createPaymentOrderHandler(c: Context) {
  const parsed = createOrderSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw Errors.validation("Invalid request body", {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const user = c.get("user") as JWTPayload;
  const order = await createSubscriptionOrder(user.tenantId, user.userId, parsed.data);

  const response: ApiResponse = {
    success: true,
    data: order,
  };

  return c.json(response, 201);
}
