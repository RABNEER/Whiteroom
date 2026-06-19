import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

// Load .env from monorepo root — try multiple resolution paths
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.coerce.number().default(3000),
  ENABLE_DEV_BYPASS: z.string().optional(),

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

  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  SUPER_ADMIN_PHONE: z.string().min(1).optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = validateEnv();
