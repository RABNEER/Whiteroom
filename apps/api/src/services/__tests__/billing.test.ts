import { describe, expect, it, vi, beforeEach } from "vitest";
import { Errors } from "@whiteroom/shared";

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = "a".repeat(32);
  process.env.JWT_REFRESH_SECRET = "b".repeat(32);
  process.env.DM_ENCRYPTION_SECRET = "c".repeat(32);
  process.env.DATABASE_URL = "postgres://localhost:5432/test";
  process.env.NODE_ENV = "test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret";
});

// Drizzle query builder mocks
const mockLimit = vi.fn();
const mockWhereSelect = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhereSelect }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockReturningUpdate = vi.fn();
const mockWhereUpdate = vi.fn(() => ({ returning: mockReturningUpdate }));
const mockSet = vi.fn(() => ({ where: mockWhereUpdate }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock("../../lib/db.js", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock("../audit.js", () => ({
  logAuditEvent: vi.fn(),
}));

const { completeSubscriptionPayment } = await import("../billing.js");

describe("completeSubscriptionPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws a notFound error when subscription is missing", async () => {
    mockLimit.mockResolvedValueOnce([]); // Mock db.select returning an empty array

    await expect(
      completeSubscriptionPayment("order_not_found", "pay_test_001", "signature")
    ).rejects.toThrow(Errors.notFound("Subscription order"));

    expect(mockSelect).toHaveBeenCalled();
  });

  it("updates subscription and logs audit event when subscription is found", async () => {
    const mockSub = {
      id: "sub-1",
      tenantId: "tenant-1",
      planType: "tuition",
      waltAiEnabled: false,
    };
    const mockUpdatedSub = { ...mockSub, plan: "pro" };

    mockLimit.mockResolvedValueOnce([mockSub]); // Subscription found
    mockReturningUpdate.mockResolvedValueOnce([mockUpdatedSub]); // Mock db.update returning updated subscription

    const result = await completeSubscriptionPayment("order_found", "pay_test_002", "signature");

    expect(result).toEqual(mockUpdatedSub);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
