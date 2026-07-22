import { Context, Next } from "hono";
import { Errors } from "@whiteroom/shared";
import { securityAuditLogs } from "@whiteroom/db";
import { db } from "../lib/db.js";

// ─── Local PII Patterns ───
const PII_PATTERNS = [
  // Aadhaar: 12 digits formatted or contiguous (e.g. 1234 5678 9012 or 123456789012)
  /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/,
  // Credit/Debit Cards: 16 digits formatted or contiguous
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9][0-9])[0-9]{12})\b/,
  // UPI IDs
  /\b[a-zA-Z0-9.\-_]{2,64}@(okaxis|okhdfcbank|okicici|oksbi|paytm|ybl|upi|axl|ibl|hdfcbank|icici|sbi)\b/i,
  // Indian Phone numbers when preceded by phone indicators or standard formats (+91 9876543210, 09876543210, etc.)
  /(?:(?:\+?91|0)[\-\s]?)?[6-9]\d{9}\b/,
];

// ─── Local Profanity & Toxicity Words (English, Hinglish, & Common Slang) ───
const TOXIC_WORDS = [
  "bitch",
  "bastard",
  "fucker",
  "asshole",
  "motherfucker",
  "slut",
  "whore",
  "kill yourself",
  "suicide",
  "bomb school",
  "shoot up",
  "madarchod",
  "behenchod",
  "bhosdike",
  "chutiya",
  "gaand",
  "harami",
  "randi",
  "kamina",
];

// ─── Local Phishing & Suspicious Link Patterns ───
const PHISHING_PATTERNS = [
  /https?:\/\/(?:www\.)?(?:t\.me|telegram\.me|bit\.ly|tinyurl\.com)\//i,
  /\.(?:apk|exe|bat|sh|msi)(?:\?|$)/i,
  /\b(?:1xbet|bet365|dream11|parimatch|instantloan|kreditbee|cashbean)\b/i,
];

/**
 * Helper function to inspect string content against local and cloud guardrails.
 */
export async function checkContentSafety(
  content: string,
  tenantId?: string,
  userId?: string,
  ipAddress?: string
): Promise<{ safe: boolean; reason?: string; severity?: string }> {
  if (!content || typeof content !== "string") {
    return { safe: true };
  }

  // 1. Check Local PII Shield
  for (const regex of PII_PATTERNS) {
    if (regex.test(content)) {
      await logSecurityViolation("PII_GUARDRAIL_BLOCK", "HIGH", { reason: "PII detected", contentSnippet: content.slice(0, 50) }, tenantId, userId, ipAddress);
      return { safe: false, reason: "Contains personal identification information (Aadhaar, Card, Phone, or UPI ID)", severity: "HIGH" };
    }
  }

  // 2. Check Local Phishing Shield
  for (const regex of PHISHING_PATTERNS) {
    if (regex.test(content)) {
      await logSecurityViolation("PHISHING_GUARDRAIL_BLOCK", "CRITICAL", { reason: "Phishing/Betting link detected", contentSnippet: content.slice(0, 50) }, tenantId, userId, ipAddress);
      return { safe: false, reason: "Contains unauthorized or suspicious external links/apps", severity: "CRITICAL" };
    }
  }

  // 3. Check Local Profanity/Abuse Filter
  const lowerContent = content.toLowerCase();
  for (const word of TOXIC_WORDS) {
    // Check whole word or phrase boundary
    if (lowerContent.includes(word)) {
      await logSecurityViolation("TOXICITY_GUARDRAIL_BLOCK", "MEDIUM", { reason: "Abusive/Toxic language", word, contentSnippet: content.slice(0, 50) }, tenantId, userId, ipAddress);
      return { safe: false, reason: "Contains abusive, harassing, or inappropriate language", severity: "MEDIUM" };
    }
  }

  // 4. Check Optional Cloud OpenAI Moderation API (if configured in .env)
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          input: content,
          model: "omni-moderation-latest",
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const result = data?.results?.[0];
        if (result && result.flagged) {
          await logSecurityViolation("OPENAI_GUARDRAIL_BLOCK", "HIGH", { categories: result.categories, contentSnippet: content.slice(0, 50) }, tenantId, userId, ipAddress);
          return { safe: false, reason: "Flagged by AI safety checks for sensitive or inappropriate content", severity: "HIGH" };
        }
      }
    } catch (err) {
      console.error("🛡️ [MODERATION] Cloud OpenAI check failed, defaulting to local guardrail safety:", err);
    }
  }

  return { safe: true };
}

/**
 * Log security guardrail violations to database
 */
async function logSecurityViolation(
  eventType: string,
  severity: string,
  metadata: Record<string, unknown>,
  tenantId?: string,
  userId?: string,
  ipAddress?: string
) {
  try {
    await db.insert(securityAuditLogs).values({
      tenantId: tenantId || null,
      userId: userId || null,
      eventType,
      severity,
      ipAddress: ipAddress || null,
      metadata,
    });
  } catch (err) {
    console.error("🛡️ [MODERATION] Failed to write security audit log:", err);
  }
}

/**
 * Hono Middleware to automatically inspect request body text (content, text, title)
 */
export async function contentModerationMiddleware(c: Context, next: Next) {
  const tenantId = c.get("tenantId");
  const user = c.get("user");
  const userId = user?.id || user?.userId;
  const ipAddress = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

  // Only scan POST/PUT requests with JSON bodies
  if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
    const contentType = c.req.header("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        // Clone the request body to check
        const body = await c.req.raw.clone().json();
        const textToCheck = [
          typeof body.content === "string" ? body.content : "",
          typeof body.text === "string" ? body.text : "",
          typeof body.title === "string" ? body.title : "",
          typeof body.message === "string" ? body.message : "",
        ]
          .filter(Boolean)
          .join(" ");

        if (textToCheck) {
          const check = await checkContentSafety(textToCheck, tenantId, userId, ipAddress);
          if (!check.safe) {
            throw Errors.contentBlocked(`Message blocked: ${check.reason}`);
          }
        }
      } catch (err: any) {
        // If it's our AppError (contentBlocked), rethrow so global error handler formats it
        if (err?.code === "CONTENT_BLOCKED" || err?.name === "AppError") {
          throw err;
        }
        // If body parsing failed, ignore and proceed to regular route validation
      }
    }
  }

  await next();
}
