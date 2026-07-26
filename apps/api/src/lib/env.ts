import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

// Load .env from monorepo root â€” try multiple resolution paths
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const isBotProcess =
  process.env.WHATSAPP_BOT_ONLY === "true" ||
  process.argv[1]?.includes("whatsapp-bot");

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().default(isBotProcess ? "whiteroom-whatsapp-bot-dummy-access-secret-32chars" : ""),
  JWT_REFRESH_SECRET: z.string().default(isBotProcess ? "whiteroom-whatsapp-bot-dummy-refresh-secret-32chars" : ""),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  DM_ENCRYPTION_SECRET: z.string().default(isBotProcess ? "whiteroom-whatsapp-bot-dummy-dm-secret-32chars" : ""),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().default(3000),

  // ─── MSG91 (OTP Provider) ───
  MSG91_API_KEY: z.string().min(1).optional(),
  MSG91_TEMPLATE_ID: z.string().min(1).optional(),
  MSG91_SENDER_ID: z.string().min(1).optional(),

  // ─── SMS Gateway 24 (SIM Gateway) ───
  SMSGATEWAY24_TOKEN: z.string().optional(),
  SMSGATEWAY24_DEVICE_ID: z.string().optional(),

  // ─── Termux Custom SMS Gateway ───
  TERMUX_SMS_GATEWAY_URL: z.string().optional(),

  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional(),
  LOCAL_STORAGE_PATH: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL_PREFIX: z.string().url().optional(),

  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  SUPER_ADMIN_PHONE: z.string().min(1).optional(),
  APP_URL: z.string().optional(),
  MOBILE_WEB_URL: z.string().url().optional(),
  ADMIN_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(1).default("whiteroom-whatsapp-bot-internal-secret"),
  WHATSAPP_WEBHOOK_URL: z.string().url().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  LATEST_APP_VERSION: z.string().optional(),
  APK_DOWNLOAD_URL: z.string().optional(),
  FORCE_UPDATE_REQUIRED: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && !isBotProcess) {
    if (!value.JWT_PRIVATE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_PRIVATE_KEY"],
        message: "JWT_PRIVATE_KEY is required in production",
      });
    }
    if (!value.JWT_PUBLIC_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_PUBLIC_KEY"],
        message: "JWT_PUBLIC_KEY is required in production",
      });
    }
  }
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("âŒ Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = validateEnv();
