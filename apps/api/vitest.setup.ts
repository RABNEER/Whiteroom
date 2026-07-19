import { vi } from "vitest";

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = "a".repeat(32);
  process.env.JWT_REFRESH_SECRET = "b".repeat(32);
  process.env.DM_ENCRYPTION_SECRET = "c".repeat(32);
  process.env.DATABASE_URL = "postgres://localhost:5432/test";
  process.env.NODE_ENV = "test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret";
});
