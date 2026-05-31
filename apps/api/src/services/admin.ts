import { db } from "../lib/db.js";
import { subscriptions, tenants, users } from "@whiteroom/db";
import { and, count, eq, gte, sql } from "@whiteroom/db";

export async function listAdminTenants() {
  return db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      isActive: tenants.isActive,
      createdAt: tenants.createdAt,
      plan: subscriptions.plan,
      subscriptionEndDate: subscriptions.endDate,
    })
    .from(tenants)
    .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id));
}

export async function listAdminUsers() {
  return db
    .select({
      id: users.id,
      phone: users.phone,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      tenantName: tenants.name,
    })
    .from(users)
    .leftJoin(tenants, eq(users.tenantId, tenants.id))
    .orderBy(sql`${users.createdAt} desc`);
}

export async function getPlatformMetrics() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [userCount] = await db.select({ value: count() }).from(users);
  const [activeTenantCount] = await db
    .select({ value: count() })
    .from(tenants)
    .where(eq(tenants.isActive, true));
  const [proTenantCount] = await db
    .select({ value: count() })
    .from(subscriptions)
    .where(eq(subscriptions.plan, "pro"));
  const [dailyActiveUsers] = await db
    .select({ value: count() })
    .from(users)
    .where(and(gte(users.updatedAt, today), sql`${users.refreshToken} is not null`));

  return {
    totalUsers: userCount?.value ?? 0,
    activeTenants: activeTenantCount?.value ?? 0,
    proTenants: proTenantCount?.value ?? 0,
    dailyActiveUsers: dailyActiveUsers?.value ?? 0,
  };
}
