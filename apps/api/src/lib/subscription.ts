import { db } from "./db.js";
import { subscriptions } from "@whiteroom/db";
import { PlanTier } from "@whiteroom/shared";
import { eq } from "@whiteroom/db";

export async function getTenantPlanTier(tenantId: string | null): Promise<PlanTier> {
  if (!tenantId) return PlanTier.FREE;
  
  try {
    const [sub] = await db
      .select({ plan: subscriptions.plan })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId))
      .limit(1);

    if (sub && sub.plan?.toLowerCase() === "pro") {
      return PlanTier.PRO;
    }
  } catch (err) {
    console.error(`[SUBSCRIPTION] Failed to resolve plan for tenant ${tenantId}:`, err);
  }
  
  return PlanTier.FREE;
}
