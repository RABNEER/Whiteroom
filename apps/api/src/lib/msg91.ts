import { env } from "./env.js";
import { Errors } from "@whiteroom/shared";

interface MSG91SendResponse {
  type: string;
  message?: string;
}

/**
 * Send an OTP via MSG91 REST API.
 *
 * In development mode without MSG91 credentials, logs the OTP
 * to console instead of sending a real SMS.
 */
export async function sendOTP(phone: string, otp: string): Promise<void> {
  // Development fallback — log OTP to console
  if (!env.MSG91_API_KEY || !env.MSG91_TEMPLATE_ID) {
    console.log(`\n📱 [DEV OTP] Phone: ${phone.slice(-4).padStart(phone.length, '*')} → OTP: ${otp}\n`);
    return;
  }

  const url = "https://control.msg91.com/api/v5/otp";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: env.MSG91_API_KEY,
    },
    body: JSON.stringify({
      template_id: env.MSG91_TEMPLATE_ID,
      mobile: phone.replace("+", ""), // MSG91 expects without + prefix
      otp,
      sender: env.MSG91_SENDER_ID ?? "WHTROM",
    }),
  });

  if (!response.ok) {
    console.error(`MSG91 error: ${response.status} ${response.statusText}`);
    throw Errors.internal("SMS service unavailable");
  }

  const data = (await response.json()) as MSG91SendResponse;

  if (data.type === "error") {
    console.error(`MSG91 API error: ${data.message}`);
    throw Errors.internal("Failed to send OTP");
  }
}
