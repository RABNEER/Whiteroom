import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { sendBroadcastNotificationHandler, getBroadcastHistoryHandler } from "../broadcast.js";
import { UserRole } from "@whiteroom/shared";

// Mock FCM
vi.mock("../../../lib/fcm.js", () => ({
  sendPushToUsers: vi.fn().mockResolvedValue(undefined),
  sendPushToTenant: vi.fn().mockResolvedValue(undefined),
}));

// Mock DB
vi.mock("../../../lib/db.js", () => {
  const mockUsers = [
    { userId: "user-1", tenantId: "tenant-1", role: "parent" },
    { userId: "user-2", tenantId: "tenant-1", role: "teacher" },
  ];
  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "notif-1",
                  tenantId: "tenant-1",
                  title: "Test Broadcast",
                  body: "Special school update",
                  type: "broadcast",
                  sentAt: new Date(),
                  createdAt: new Date(),
                },
              ]),
            }),
            then: (resolve: any) => resolve(mockUsers),
          }),
        }),
      }),
    },
  };
});

describe("Admin Broadcast Notifications API", () => {
  let app: Hono<{ Variables: { user: any } }>;

  beforeEach(() => {
    app = new Hono<{ Variables: { user: any } }>();
    // Simulate auth user middleware injection
    app.use("*", async (c, next) => {
      c.set("user", {
        userId: "admin-1",
        role: UserRole.SCHOOL_ADMIN,
        tenantId: "tenant-1",
      });
      await next();
    });

    app.post("/broadcast", sendBroadcastNotificationHandler);
    app.get("/history", getBroadcastHistoryHandler);
  });

  it("successfully validates and queues a broadcast notification blast", async () => {
    const res = await app.request("/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "School Sports Day 🏆",
        body: "Sports Day events begin tomorrow at 9:00 AM. Don't forget your sportswear!",
        targetRole: "all",
        deepLink: "/announcements",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe("School Sports Day 🏆");
    expect(body.data.targetRole).toBe("all");
    expect(body.data.sentCount).toBe(2);
  });

  it("returns validation error when title or body is missing", async () => {
    const res = await app.request("/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "",
        body: "",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("retrieves broadcast history successfully", async () => {
    const res = await app.request("/history", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.broadcasts).toBeDefined();
    expect(body.data.broadcasts.length).toBe(1);
    expect(body.data.broadcasts[0].title).toBe("Test Broadcast");
  });
});
