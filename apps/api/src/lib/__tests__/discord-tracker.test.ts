import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { captureException, sendTestAlert, getDiscordWebhookUrl } from "../discord-tracker.js";

describe("Discord Error & Crash Tracker", () => {
  const originalEnv = process.env.DISCORD_ERROR_WEBHOOK_URL;
  const mockWebhookUrl = "https://discord.com/api/webhooks/mock-id/mock-token";

  beforeEach(() => {
    process.env.DISCORD_ERROR_WEBHOOK_URL = mockWebhookUrl;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.DISCORD_ERROR_WEBHOOK_URL = originalEnv;
  });

  it("returns configured webhook url from environment", () => {
    expect(getDiscordWebhookUrl()).toBe(mockWebhookUrl);
  });

  it("captures an error and sends a formatted Discord embed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = fetchMock;

    const testError = new Error("Database query timeout in attendance");
    testError.name = "TimeoutError";

    const result = await captureException(testError, {
      service: "apps/api",
      route: "POST /api/v1/attendance/mark",
      statusCode: 500,
      userId: "usr_teacher_1",
      role: "teacher",
      tenantId: "school_greenwood",
      correlationId: "trace-1234-5678",
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOptions] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(mockWebhookUrl);

    const payload = JSON.parse(calledOptions.body);
    expect(payload.username).toBe("Whiteroom Watchdog 🛡️");
    expect(payload.embeds).toHaveLength(1);

    const embed = payload.embeds[0];
    expect(embed.title).toContain("TimeoutError");
    expect(embed.color).toBe(0xe74c3c); // Red for 500/critical

    const serviceField = embed.fields.find((f: any) => f.name.includes("Service"));
    expect(serviceField.value).toContain("apps/api");

    const routeField = embed.fields.find((f: any) => f.name.includes("Route"));
    expect(routeField.value).toContain("POST /api/v1/attendance/mark");
    expect(routeField.value).toContain("[500]");

    const userField = embed.fields.find((f: any) => f.name.includes("User Context"));
    expect(userField.value).toContain("Role: **teacher**");
    expect(userField.value).toContain("usr_teacher_1");
    expect(userField.value).toContain("school_greenwood");
  });

  it("handles warnings with amber color and non-critical status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    const result = await captureException(new Error("Validation failed for student schema"), {
      service: "mobile-app",
      route: "RegistrationScreen",
      level: "warning",
      statusCode: 400,
    });

    expect(result).toBe(true);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.embeds[0].color).toBe(0xf1c40f); // Amber for warning
    expect(payload.embeds[0].title).toContain("🟡 [WARNING]");
  });

  it("deduplicates identical errors and prevents alert storms", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    const repeatError = new Error("UniqueDeduplicationErrorTestString123");
    repeatError.name = "DeduplicationTestError";

    // 1st time -> triggers webhook
    const firstHit = await captureException(repeatError, { service: "test-service" });
    expect(firstHit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 2nd time -> debounced (no extra webhook)
    const secondHit = await captureException(repeatError, { service: "test-service" });
    expect(secondHit).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gracefully returns false if DISCORD_ERROR_WEBHOOK_URL is missing", async () => {
    delete process.env.DISCORD_ERROR_WEBHOOK_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const result = await captureException(new Error("Some error"));
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dispatches diagnostic test alert with sendTestAlert", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    const result = await sendTestAlert("Whiteroom Diagnostics Test");
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.embeds[0].title).toContain("DiagnosticTestException");
  });
});
