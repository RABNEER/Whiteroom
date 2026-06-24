import crypto from "node:crypto";
import Razorpay from "razorpay";
import { Errors } from "@whiteroom/shared";
import { env } from "./env.js";

let client: Razorpay | null = null;

export function getRazorpayClient() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw Errors.internal("Razorpay credentials are not configured");
  }

  client ??= new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });

  return client;
}

export function verifyRazorpaySignature(body: string, signature?: string) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw Errors.internal("Razorpay webhook secret is not configured");
  }

  if (!signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
