import { describe, expect, it, vi, beforeEach } from "vitest";

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

const mockOrderCreate = vi.fn();
const mockRazorpayClient = { orders: { create: mockOrderCreate } };
const mockVerifySignature = vi.fn((_body: string, _sig?: string) => true);

vi.mock("../../lib/razorpay.js", () => ({
  getRazorpayClient: () => mockRazorpayClient,
  verifyRazorpaySignature: mockVerifySignature,
}));

// Drizzle query builder mocks
const mockLimit = vi.fn();
const mockWhereSelect = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhereSelect }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockReturningInsert = vi.fn();
const mockReturningDoNothing = vi.fn().mockResolvedValue([{ id: "idempotent-1" }]);
const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturningInsert }));
const mockOnConflictDoNothing = vi.fn(() => ({
  returning: mockReturningDoNothing,
}));
const mockValues = vi.fn(() => ({
  onConflictDoNothing: mockOnConflictDoNothing,
  onConflictDoUpdate: mockOnConflictDoUpdate,
}));
const mockInsert = vi.fn(() => ({ values: mockValues }));

const mockReturningUpdate = vi.fn();
const mockWhereUpdate = vi.fn(() => ({ returning: mockReturningUpdate }));
const mockSet = vi.fn(() => ({ where: mockWhereUpdate }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock("../../lib/db.js", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

const { createSubscriptionOrder, handleRazorpayWebhook, downgradeExpiredSubscriptions } = await import("../payments.js");

const webhookEvent = {
  id: "evt_test_001",
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_test_001",
        order_id: "order_test_001",
        notes: { tenantId: "tenant-1", plan: "pro_yearly" },
      },
    },
    order: {
      entity: {
        id: "order_test_001",
        notes: { tenantId: "tenant-1", plan: "pro_yearly" },
      },
    },
  },
};

describe("createSubscriptionOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderCreate.mockResolvedValue({
      id: "order_test_real",
      amount: 1_500_000,
      currency: "INR",
      receipt: "tenant_tenant-1_1234567890",
      status: "created",
    });
  });

  it("creates an order via Razorpay client", async () => {
    const result = await createSubscriptionOrder("tenant-1", "user-1", { plan: "pro_yearly" });

    expect(mockOrderCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1_500_000, currency: "INR" })
    );
    expect(result.id).toBe("order_test_real");
    expect(result.status).toBe("created");
  });

  it("throws for unsupported plan", async () => {
    await expect(
      createSubscriptionOrder("tenant-1", "user-1", { plan: "bogus_plan" as any })
    ).rejects.toThrow("Unsupported subscription plan");
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });


});

describe("handleRazorpayWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockReset();
    mockReturningInsert.mockReset();
    mockReturningDoNothing.mockReset();
    mockReturningUpdate.mockReset();
    mockVerifySignature.mockReturnValue(true);
    mockLimit.mockResolvedValue([]);
    mockReturningDoNothing.mockResolvedValue([{ id: "iev-1" }]);
    mockReturningInsert.mockResolvedValue([
      {
        id: "sub-1",
        tenantId: "tenant-1",
        plan: "pro",
        razorpayOrderId: "order_test_001",
        razorpayPaymentId: "pay_test_001",
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    ]);
  });

  it("processes a valid payment.captured webhook", async () => {
    const result = await handleRazorpayWebhook(JSON.stringify(webhookEvent), "valid_sig");

    expect(result.processed).toBe(true);
    expect(result.subscription).toBeDefined();
    expect(mockVerifySignature).toHaveBeenCalled();
  });

  it("rejects webhook with invalid signature", async () => {
    mockVerifySignature.mockReturnValue(false);

    await expect(
      handleRazorpayWebhook(JSON.stringify(webhookEvent), "bad_sig")
    ).rejects.toThrow("Invalid Razorpay webhook signature");
  });

  it("skips processing for unsupported event types", async () => {
    const result = await handleRazorpayWebhook(
      JSON.stringify({ ...webhookEvent, event: "payment.failed" }),
      "sig"
    );

    expect(result.processed).toBe(false);
  });

  it("skips processing when tenantId is missing", async () => {
    const result = await handleRazorpayWebhook(
      JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { notes: {} } } } }),
      "sig"
    );

    expect(result.processed).toBe(false);
  });

  it("detects duplicate webhook event via idempotency key", async () => {
    mockReturningDoNothing.mockResolvedValueOnce([]);

    const result = await handleRazorpayWebhook(JSON.stringify(webhookEvent), "sig");

    expect(result.processed).toBe(true);
    expect(result.alreadyProcessed).toBe(true);
  });

  it("detects duplicate via existing subscription order/payment ID", async () => {
    mockLimit.mockResolvedValueOnce([{ id: "existing-sub", tenantId: "tenant-1" }]);

    const result = await handleRazorpayWebhook(JSON.stringify(webhookEvent), "sig");

    expect(result.processed).toBe(true);
    expect(result.alreadyProcessed).toBe(true);
    expect(result.subscription).toBeDefined();
  });

  it("skips when plan key is not pro_yearly", async () => {
    const result = await handleRazorpayWebhook(
      JSON.stringify({
        ...webhookEvent,
        payload: {
          payment: {
            entity: {
              id: "pay_002",
              order_id: "order_002",
              notes: { tenantId: "tenant-2", plan: "free" },
            },
          },
        },
      }),
      "sig"
    );

    expect(result.processed).toBe(false);
  });

  it("inserts subscription on successful processing", async () => {
    await handleRazorpayWebhook(JSON.stringify(webhookEvent), "sig");

    expect(mockReturningInsert).toHaveBeenCalled();
  });
});

describe("downgradeExpiredSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downgrades expired PRO subscriptions to FREE", async () => {
    mockReturningUpdate.mockResolvedValue([{ id: "sub-expired-1" }]);

    const result = await downgradeExpiredSubscriptions();

    expect(result.downgraded).toBe(1);
  });

  it("returns zero when no expired subscriptions exist", async () => {
    mockReturningUpdate.mockResolvedValue([]);

    const result = await downgradeExpiredSubscriptions();

    expect(result.downgraded).toBe(0);
  });
});
