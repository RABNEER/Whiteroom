import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = "a".repeat(32);
  process.env.JWT_REFRESH_SECRET = "b".repeat(32);
  process.env.DM_ENCRYPTION_SECRET = "c".repeat(32);
  process.env.DATABASE_URL = "postgres://localhost:5432/test";
  process.env.NODE_ENV = "test";
  process.env.FIREBASE_PROJECT_ID = "test-project";
  process.env.FIREBASE_CLIENT_EMAIL = "test@test.iam.gserviceaccount.com";
  process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----";
});

const sendEachForMulticast = vi.fn();
let mockMessaging: { sendEachForMulticast: Mock } | null = { sendEachForMulticast };

vi.mock("../lib/firebase.js", () => ({
  getFirebaseMessaging: () => mockMessaging,
}));

const mockWhereToken = vi.fn();
const mockReturningInsert = vi.fn();
const mockSetWhere = vi.fn();

vi.mock("../lib/db.js", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: mockWhereToken,
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: mockReturningInsert,
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: mockSetWhere,
        })),
      })),
    },
  };
});

const { sendPushToUser } = await import("./fcm.js");

const testPayload = { title: "Test Push", body: "Hello from test", type: "absence" as const };

describe("sendPushToUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEachForMulticast.mockResolvedValue({ successCount: 1, failureCount: 0 });
  });

  it("sends a push notification when FCM token exists", async () => {
    mockWhereToken.mockResolvedValue([{ fcmToken: "fcm-token-1" }]);
    mockReturningInsert.mockResolvedValue([{ id: "notif-1" }]);

    await sendPushToUser("tenant-1", "user-1", testPayload);

    expect(sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ["fcm-token-1"],
      notification: { title: "Test Push", body: "Hello from test" },
      data: { type: "absence", tenantId: "tenant-1" },
    });
  });

  it("does not send when no FCM tokens exist", async () => {
    mockWhereToken.mockResolvedValue([]);
    mockReturningInsert.mockResolvedValue([{ id: "notif-2" }]);

    await sendPushToUser("tenant-2", "user-2", testPayload);

    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("does not send when Firebase messaging is not configured", async () => {
    mockWhereToken.mockResolvedValue([{ fcmToken: "fcm-token-3" }]);
    mockReturningInsert.mockResolvedValue([{ id: "notif-3" }]);
    mockMessaging = null;

    await sendPushToUser("tenant-3", "user-3", testPayload);

    expect(sendEachForMulticast).not.toHaveBeenCalled();
    mockMessaging = { sendEachForMulticast };
  });

  it("does not throw when FCM send fails (fire-and-forget)", async () => {
    mockWhereToken.mockResolvedValue([{ fcmToken: "fcm-token-4" }]);
    mockReturningInsert.mockResolvedValue([{ id: "notif-4" }]);
    sendEachForMulticast.mockRejectedValue(new Error("FCM quota exceeded"));

    await expect(
      sendPushToUser("tenant-4", "user-4", testPayload)
    ).resolves.toBeUndefined();
  });

  it("does not throw when DB query fails (fire-and-forget)", async () => {
    mockWhereToken.mockRejectedValue(new Error("DB connection lost"));

    await expect(
      sendPushToUser("tenant-5", "user-5", testPayload)
    ).resolves.toBeUndefined();
  });

  it("updates sentAt on successful delivery", async () => {
    mockWhereToken.mockResolvedValue([{ fcmToken: "fcm-token-6" }]);
    mockReturningInsert.mockResolvedValue([{ id: "notif-6" }]);

    await sendPushToUser("tenant-6", "user-6", testPayload);

    expect(mockSetWhere).toHaveBeenCalled();
  });

  it("does not update sentAt when send reports zero success", async () => {
    mockWhereToken.mockResolvedValue([{ fcmToken: "fcm-token-7" }]);
    mockReturningInsert.mockResolvedValue([{ id: "notif-7" }]);
    sendEachForMulticast.mockResolvedValue({ successCount: 0, failureCount: 1 });

    await sendPushToUser("tenant-7", "user-7", testPayload);

    expect(mockSetWhere).not.toHaveBeenCalled();
  });
});
