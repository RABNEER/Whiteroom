import { describe, expect, it, vi, beforeEach } from "vitest";

// Set environment variables before any imports happen
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

const mockOffset = vi.fn();
const mockLimit = vi.fn(() => ({ offset: mockOffset }));
const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("../../lib/db.js", () => ({
  db: {
    select: mockSelect,
  }
}));

// Mock FCM
vi.mock("../../lib/fcm.js", () => ({
  getParentUserIdsForStudents: vi.fn(),
  sendPushToUsers: vi.fn(),
}));

describe("listPromotionHistory", () => {
  let listPromotionHistory: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const promotion = await import("../promotion.js");
    listPromotionHistory = promotion.listPromotionHistory;
  });

  it("should use default pagination when no options are provided", async () => {
    mockOffset.mockResolvedValueOnce([{ id: 1 }]);
    await listPromotionHistory("tenant-1");

    expect(mockLimit).toHaveBeenCalledWith(20);
    expect(mockOffset).toHaveBeenCalledWith(0);
  });

  it("should use default pagination when empty options are provided", async () => {
    mockOffset.mockResolvedValueOnce([{ id: 1 }]);
    await listPromotionHistory("tenant-1", {});

    expect(mockLimit).toHaveBeenCalledWith(20);
    expect(mockOffset).toHaveBeenCalledWith(0);
  });

  it("should apply custom pagination parameters correctly", async () => {
    mockOffset.mockResolvedValueOnce([{ id: 1 }]);
    await listPromotionHistory("tenant-1", { page: 3, limit: 15 });

    expect(mockLimit).toHaveBeenCalledWith(15);
    expect(mockOffset).toHaveBeenCalledWith(30); // (3 - 1) * 15
  });

  it("should enforce minimum values for page and limit", async () => {
    mockOffset.mockResolvedValueOnce([{ id: 1 }]);
    await listPromotionHistory("tenant-1", { page: 0, limit: 0 });

    expect(mockLimit).toHaveBeenCalledWith(1); // min limit is 1
    expect(mockOffset).toHaveBeenCalledWith(0); // page 1, offset 0 (max(1, 0) - 1) * 1
  });

  it("should enforce minimum values for negative page and limit", async () => {
    mockOffset.mockResolvedValueOnce([{ id: 1 }]);
    await listPromotionHistory("tenant-1", { page: -5, limit: -10 });

    expect(mockLimit).toHaveBeenCalledWith(1); // min limit is 1
    expect(mockOffset).toHaveBeenCalledWith(0); // page 1, offset 0
  });

  it("should enforce maximum values for limit", async () => {
    mockOffset.mockResolvedValueOnce([{ id: 1 }]);
    await listPromotionHistory("tenant-1", { page: 2, limit: 150 });

    expect(mockLimit).toHaveBeenCalledWith(100); // max limit is 100
    expect(mockOffset).toHaveBeenCalledWith(100); // page 2, limit 100 -> offset 100
  });

  it("should filter by tenantId", async () => {
    mockOffset.mockResolvedValueOnce([{ id: 1 }]);
    await listPromotionHistory("tenant-2", { page: 1, limit: 20 });

    expect(mockWhere).toHaveBeenCalled();
  });
});
