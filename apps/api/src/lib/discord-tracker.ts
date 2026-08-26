import crypto from "node:crypto";

export interface ErrorContext {
  service?: string;
  environment?: string;
  route?: string;
  statusCode?: number;
  userId?: string;
  role?: string;
  tenantId?: string;
  correlationId?: string;
  extra?: Record<string, any>;
  breadcrumbs?: Array<{ timestamp?: string; category?: string; message: string }>;
  deviceInfo?: {
    os?: string;
    version?: string;
    model?: string;
    appVersion?: string;
  };
  level?: "critical" | "warning" | "info";
}

interface ErrorDeduplicationEntry {
  count: number;
  firstSeen: number;
  lastSeen: number;
  lastNotified: number;
}

// In-memory sliding window cache for error deduplication (prevents Discord rate limit & alert storms)
const deduplicationCache = new Map<string, ErrorDeduplicationEntry>();
const DEDUPLICATION_WINDOW_MS = 15 * 1000; // 15 seconds real-time window

// Clean up stale cache items every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of deduplicationCache.entries()) {
    if (now - entry.lastSeen > DEDUPLICATION_WINDOW_MS) {
      deduplicationCache.delete(key);
    }
  }
}, 5 * 60 * 1000).unref?.();

/**
 * Returns the configured Discord Webhook URL from environment variables.
 */
export function getDiscordWebhookUrl(): string | undefined {
  return process.env.DISCORD_ERROR_WEBHOOK_URL;
}

/**
 * Computes a distinct fingerprint for an error to group identical issues.
 */
function computeFingerprint(
  service: string,
  errorName: string,
  message: string,
  stack?: string
): string {
  const firstStackLine =
    stack
      ?.split("\n")
      .slice(1, 3)
      .map((l) => l.trim().replace(/:\d+:\d+/g, ""))
      .join("|") || message;

  return crypto
    .createHash("sha256")
    .update(`${service}::${errorName}::${firstStackLine}`)
    .digest("hex");
}

/**
 * Formats and dispatches an exception event to Discord as a rich embed in real time.
 */
export async function captureException(
  err: Error | unknown,
  context: ErrorContext = {}
): Promise<boolean> {
  const webhookUrl = getDiscordWebhookUrl();
  if (!webhookUrl) {
    return false;
  }

  const errorObj =
    err instanceof Error
      ? err
      : new Error(typeof err === "string" ? err : JSON.stringify(err));

  const errorName = errorObj.name || "Error";
  const errorMessage = errorObj.message || "Unknown error occurred";
  const stack = errorObj.stack || "";

  const service = context.service || "apps/api";
  const environment = context.environment || process.env.NODE_ENV || "development";
  const level = context.level || (context.statusCode && context.statusCode < 500 ? "warning" : "critical");

  // Real-time deduplication check (only debounce rapid duplicate bursts within 15s)
  const isTest = context.extra?.test === true;
  const fingerprint = computeFingerprint(service, errorName, errorMessage, stack);
  const now = Date.now();
  let entry = deduplicationCache.get(fingerprint);

  if (!isTest) {
    if (!entry) {
      entry = { count: 1, firstSeen: now, lastSeen: now, lastNotified: now };
      deduplicationCache.set(fingerprint, entry);
    } else {
      entry.count++;
      entry.lastSeen = now;

      // Real-time notification: alert on 1st, then debounce rapid bursts (notify on 10th, 50th, 100th, or after 15s window)
      const shouldNotify =
        entry.count === 10 ||
        entry.count === 50 ||
        entry.count === 100 ||
        entry.count % 250 === 0 ||
        now - entry.lastNotified > DEDUPLICATION_WINDOW_MS;

      if (!shouldNotify) {
        return false;
      }
      entry.lastNotified = now;
    }
  } else {
    entry = { count: 1, firstSeen: now, lastSeen: now, lastNotified: now };
  }

  // Determine Embed Colors: 🔴 Red for critical (500s), 🟡 Amber for warning, 🔵 Blue for info
  let embedColor = 0xe74c3c; // Red
  let levelEmoji = "🔴 [CRITICAL]";

  if (level === "warning") {
    embedColor = 0xf1c40f; // Amber
    levelEmoji = "🟡 [WARNING]";
  } else if (level === "info") {
    embedColor = 0x3498db; // Blue
    levelEmoji = "🔵 [INFO]";
  }

  // Clean and sanitize stack trace (limit to top 8 frames, max 950 chars to stay within Discord limits)
  const sanitizedStack =
    stack
      .split("\n")
      .slice(0, 8)
      .join("\n")
      .slice(0, 950) || "No stack trace available";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "📍 Service & Env",
      value: `\`${service}\` • \`${environment}\``,
      inline: true,
    },
  ];

  if (context.route) {
    fields.push({
      name: "🛣️ Route / Screen",
      value: `\`${context.route}\`${context.statusCode ? ` [${context.statusCode}]` : ""}`,
      inline: true,
    });
  }

  if (context.userId || context.tenantId || context.role) {
    const userDetail = [
      context.role ? `Role: **${context.role}**` : "",
      context.userId ? `User: \`${context.userId}\`` : "",
      context.tenantId ? `Tenant: \`${context.tenantId}\`` : "",
    ]
      .filter(Boolean)
      .join(" • ");

    fields.push({
      name: "👤 User Context",
      value: userDetail || "Anonymous",
      inline: false,
    });
  }

  if (context.deviceInfo) {
    const d = context.deviceInfo;
    const deviceStr = [
      d.appVersion ? `App: **v${d.appVersion}**` : "",
      d.os ? `OS: \`${d.os} ${d.version || ""}\`` : "",
      d.model ? `Device: \`${d.model}\`` : "",
    ]
      .filter(Boolean)
      .join(" • ");

    if (deviceStr) {
      fields.push({
        name: "📱 Device Info",
        value: deviceStr,
        inline: false,
      });
    }
  }

  // Error Details
  fields.push({
    name: "⚠️ Error Message",
    value: `\`\`\`\n${errorMessage.slice(0, 1000)}\n\`\`\``,
    inline: false,
  });

  if (sanitizedStack && sanitizedStack !== "No stack trace available") {
    fields.push({
      name: "📜 Stack Trace",
      value: `\`\`\`js\n${sanitizedStack}\n\`\`\``,
      inline: false,
    });
  }

  if (context.breadcrumbs && context.breadcrumbs.length > 0) {
    const breadcrumbList = context.breadcrumbs
      .slice(-4)
      .map((b, i) => `${i + 1}. \`${b.category || "action"}\`: ${b.message}`)
      .join("\n");

    fields.push({
      name: "👣 Recent Actions (Breadcrumbs)",
      value: breadcrumbList.slice(0, 950),
      inline: false,
    });
  }

  const occurrenceText =
    entry.count > 1
      ? `🔥 Occurred **${entry.count} times** (First seen ${new Date(entry.firstSeen).toLocaleTimeString()})`
      : "✨ First Seen";

  fields.push({
    name: "🔁 Occurrence",
    value: occurrenceText,
    inline: true,
  });

  if (context.correlationId) {
    fields.push({
      name: "🆔 Trace ID",
      value: `\`${context.correlationId}\``,
      inline: true,
    });
  }

  const payload = {
    username: "Whiteroom Watchdog 🛡️",
    avatar_url: "https://raw.githubusercontent.com/RABNEER/Whiteroom/001-auth-multitenancy/apps/mobile/src/assets/logo.png",
    embeds: [
      {
        title: `${levelEmoji} ${errorName}`,
        description: `An exception was detected in **${service}**.`,
        color: embedColor,
        fields,
        footer: {
          text: `Whiteroom Error Tracker • ${new Date().toISOString()}`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn(`[discord-tracker] Failed to deliver alert: HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (deliveryErr) {
    console.error("[discord-tracker] Network error while sending alert:", deliveryErr);
    return false;
  }
}

/**
 * Triggers a test alert to verify Discord Webhook connectivity.
 */
export async function sendTestAlert(serviceName = "Whiteroom Diagnostics"): Promise<boolean> {
  const testError = new Error("This is a verified test error alert from Whiteroom Watchdog.");
  testError.name = "DiagnosticTestException";

  return captureException(testError, {
    service: serviceName,
    environment: process.env.NODE_ENV || "development",
    route: "POST /api/v1/telemetry/test-alert",
    statusCode: 200,
    correlationId: crypto.randomUUID(),
    level: "info",
    extra: { test: true },
    breadcrumbs: [
      { category: "admin", message: "Admin requested diagnostic test alert" },
      { category: "telemetry", message: "Validated Discord webhook URL" },
      { category: "delivery", message: "Dispatched test embed" },
    ],
  });
}
