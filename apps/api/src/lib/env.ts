import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

// Load .env from monorepo root â€” try multiple resolution paths
config({ path: resolve(process.cwd(), ".env") });
config({ path: resolve(process.cwd(), "../../.env") });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  DM_ENCRYPTION_SECRET: z.string().min(32).optional(),
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.coerce.number().default(3000),

  // â”€â”€â”€ MSG91 (OTP Provider) â”€â”€â”€
  MSG91_API_KEY: z.string().min(1).optional(),
  MSG91_TEMPLATE_ID: z.string().min(1).optional(),
  MSG91_SENDER_ID: z.string().min(1).optional(),

  // â”€â”€â”€ SMS Gateway 24 (SIM Gateway) â”€â”€â”€
  SMSGATEWAY24_TOKEN: z.string().optional(),
  SMSGATEWAY24_DEVICE_ID: z.string().optional(),

  // â”€â”€â”€ Termux Custom SMS Gateway â”€â”€â”€
  TERMUX_SMS_GATEWAY_URL: z.string().optional(),

  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL_PREFIX: z.string().url().optional(),

  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  SUPER_ADMIN_PHONE: z.string().min(1).optional(),
  MOBILE_WEB_URL: z.string().url().optional(),
  ADMIN_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(1).optional(),
  WHATSAPP_WEBHOOK_URL: z.string().url().optional(),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && !value.DM_ENCRYPTION_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DM_ENCRYPTION_SECRET"],
      message: "DM_ENCRYPTION_SECRET is required in production",
    });
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
