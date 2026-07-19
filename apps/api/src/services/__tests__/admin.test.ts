import { describe, expect, it, vi, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { subscriptions, tenants } from "@whiteroom/db";

let testDb;

// Provide a mock db instance to the service
vi.mock("../../lib/db.js", () => {
  return {
    get db() {
      return testDb;
    }
  };
});

const { listAdminTenants } = await import("../admin.js");

describe("admin service integration", () => {
  beforeAll(async () => {
    const client = new PGlite();
    testDb = drizzle(client);

    // Hardcode the schema precisely to bypass vector issues with pglite migrations
    await client.exec(`
      CREATE TABLE tenants (
        id text PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL UNIQUE,
        logo_url text,
        brand_color text DEFAULT '#4F46E5',
        invite_code text NOT NULL UNIQUE,
        phone text NOT NULL,
        is_active boolean DEFAULT true NOT NULL,
        gdpr_agreed_at timestamp with time zone,
        ferpa_compliant boolean DEFAULT false NOT NULL,
        address text,
        contact_email text,
        public_search boolean DEFAULT false NOT NULL,
        compliance_badges jsonb DEFAULT '[]'::jsonb NOT NULL,
        trial_ends_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE subscriptions (
        id text PRIMARY KEY,
        tenant_id text NOT NULL UNIQUE REFERENCES tenants(id),
        plan text DEFAULT 'free' NOT NULL,
        plan_type text DEFAULT 'tuition' NOT NULL,
        walt_ai_enabled boolean DEFAULT false NOT NULL,
        credits_balance integer DEFAULT 100 NOT NULL,
        calculated_monthly_amount integer DEFAULT 0 NOT NULL,
        billing_cycle_start_date timestamp with time zone,
        razorpay_order_id text,
        razorpay_payment_id text,
        razorpay_subscription_id text,
        start_date timestamp with time zone,
        end_date timestamp with time zone,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE users (
        id text PRIMARY KEY,
        name text,
        phone text NOT NULL UNIQUE,
        tenant_id text REFERENCES tenants(id),
        role text DEFAULT 'student' NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
  });

  describe("listAdminTenants", () => {
    it("should fetch all tenants with their subscription details", async () => {
      // Seed data
      const tenantId = "tenant_test_123";
      await testDb.insert(tenants).values({
        id: tenantId,
        name: "Test Academy",
        slug: "test-academy",
        inviteCode: "TA123",
        phone: "+919999999999",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const subscriptionEndDate = new Date("2025-12-31T23:59:59Z");
      await testDb.insert(subscriptions).values({
        id: "sub_test_123",
        tenantId: tenantId,
        plan: "pro",
        endDate: subscriptionEndDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await listAdminTenants();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: tenantId,
        name: "Test Academy",
        slug: "test-academy",
        isActive: true,
        plan: "pro",
        subscriptionEndDate: subscriptionEndDate,
      });
      expect(result[0].createdAt).toBeInstanceOf(Date);
    });
  });
});
