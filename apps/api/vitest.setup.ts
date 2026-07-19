import { vi } from "vitest";

vi.hoisted(() => {
  try {
    const dotenv = require("dotenv");
    const path = require("node:path");
    dotenv.config({ path: path.resolve(process.cwd(), ".env") });
    dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
  } catch (e) {
    // Ignore if not in CJS mode or not found
  }

  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "a".repeat(32);
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "b".repeat(32);
  process.env.DM_ENCRYPTION_SECRET = process.env.DM_ENCRYPTION_SECRET || "c".repeat(32);
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://localhost:5432/test";
  process.env.NODE_ENV = "test";
  process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "rzp_test_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "webhook_secret";
});
