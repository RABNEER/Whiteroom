export interface PlatformMetrics {
  totalUsers: number;
  activeTenants: number;
  proTenants: number;
  dailyActiveUsers: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  plan: string | null;
  subscriptionEndDate: string | null;
}

export interface User {
  id: string;
  phone: string;
  name: string | null;
  role: string;
  createdAt: string;
  tenantName: string | null;
}

export interface SecurityAuditLog {
  id: string;
  tenantId: string | null;
  userId: string | null;
  eventType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ipAddress: string | null;
  metadata: any;
  createdAt: string;
}
