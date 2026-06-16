import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { whatsappRoutes } from "./whatsapp.js";
import { db } from "../../lib/db.js";
import { whatsappSessions, users, eq } from "@whiteroom/db";

describe("WhatsApp Auth Flow", () => {
  const testPhone = "+919999999901";

  const cleanUp = async () => {
    // Clean up any test users/sessions for the test phone
    await db.delete(users).where(eq(users.phone, testPhone));
    await db.delete(whatsappSessions).where(eq(whatsappSessions.phone, testPhone));
  };

  beforeAll(async () => {
    await cleanUp();
  });

  afterEach(async () => {
    await cleanUp();
  });

  it("completes the full WhatsApp authentication flow for new user", async () => {
    // 1. POST /session
    const createRes = await whatsappRoutes.request("/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone }),
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json() as any;
    expect(createBody.success).toBe(true);
    expect(createBody.data).toHaveProperty("id");
    expect(createBody.data).toHaveProperty("token");

    const sessionId = createBody.data.id;
    const sessionToken = createBody.data.token;

    // 2. GET /session/:id/phone (resolves the registered phone for the bot)
    const phoneRes = await whatsappRoutes.request(`/session/${sessionId}/phone`, {
      method: "GET",
      headers: {
        "x-webhook-secret": process.env.WHATSAPP_WEBHOOK_SECRET || "",
      },
    });

    expect(phoneRes.status).toBe(200);
    const phoneBody = await phoneRes.json() as any;
    expect(phoneBody.success).toBe(true);
    expect(phoneBody.data.phone).toBe(testPhone);

    // 3. POST /webhook (simulates WhatsApp bot message webhook)
    const webhookRes = await whatsappRoutes.request("/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": process.env.WHATSAPP_WEBHOOK_SECRET || "",
      },
      body: JSON.stringify({
        from: testPhone,
        text: `Verify my device: ${sessionId}`,
      }),
    });

    expect(webhookRes.status).toBe(200);
    const webhookBody = await webhookRes.json() as any;
    expect(webhookBody.success).toBe(true);

    // 4. GET /session/:id (polling session status)
    const statusRes = await whatsappRoutes.request(`/session/${sessionId}`);
    expect(statusRes.status).toBe(200);
    const statusBody = await statusRes.json() as any;
    expect(statusBody.success).toBe(true);
    expect(statusBody.data.verified).toBe(true);
    expect(statusBody.data.isExpired).toBe(false);

    // 5. POST /verify (completes verification step)
    const verifyRes = await whatsappRoutes.request("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: sessionId,
        token: sessionToken,
      }),
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json() as any;
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.data.type).toBe("new_user");
    expect(verifyBody.data).toHaveProperty("registrationToken");
  });

  it("authenticates an existing user via WhatsApp verify", async () => {
    // 1. Create an existing user
    await db.insert(users).values({
      phone: testPhone,
      role: "teacher",
    });

    // 2. Create verification session
    const createRes = await whatsappRoutes.request("/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone }),
    });
    const createBody = await createRes.json() as any;
    const sessionId = createBody.data.id;
    const sessionToken = createBody.data.token;

    // 3. Verify via webhook
    await whatsappRoutes.request("/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": process.env.WHATSAPP_WEBHOOK_SECRET || "",
      },
      body: JSON.stringify({
        from: testPhone,
        text: `Verify my device: ${sessionId}`,
      }),
    });

    // 4. Call verify
    const verifyRes = await whatsappRoutes.request("/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: sessionId,
        token: sessionToken,
      }),
    });

    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json() as any;
    expect(verifyBody.success).toBe(true);
    expect(verifyBody.data.type).toBe("existing_user");
    expect(verifyBody.data).toHaveProperty("accessToken");
    expect(verifyBody.data).toHaveProperty("refreshToken");
    expect(verifyBody.data.user.id).toBeDefined();
    expect(verifyBody.data.user.role).toBe("teacher");
  });
});

