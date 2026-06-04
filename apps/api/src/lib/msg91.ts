import { env } from "./env.js";
import { Errors } from "@whiteroom/shared";

interface MSG91SendResponse {
  type: string;
  message?: string;
}

/**
 * Send an OTP via SMS Gateway 24 (SIM) or MSG91 REST API.
 *
 * Falls back to console logging in development mode if no credentials are set.
 */
export async function sendOTP(phone: string, otp: string): Promise<void> {
  // ─── 0. Termux Custom SMS Gateway ───
  if (env.TERMUX_SMS_GATEWAY_URL) {
    console.log(`📱 [TERMUX GATEWAY] Forwarding OTP SMS to ${phone} via Termux Local Gateway...`);
    try {
      const response = await fetch(`${env.TERMUX_SMS_GATEWAY_URL.replace(/\/$/, "")}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone,
          message: `Your Whiteroom verification code is: ${otp}. Valid for 5 minutes.`,
        }),
      });

      if (!response.ok) {
        console.error(`Termux Gateway error: ${response.status} ${response.statusText}`);
        throw Errors.internal("Termux SMS Gateway returned an error");
      }

      const data = await response.json() as { success?: boolean; error?: string };
      if (!data.success) {
        console.error(`Termux Gateway failure: ${data.error}`);
        throw Errors.internal(`Termux SMS Gateway failed: ${data.error}`);
      }

      console.log(`✅ [TERMUX GATEWAY] OTP sent successfully.`);
      return;
    } catch (err: any) {
      console.error("❌ Termux SMS Gateway connection failed:", err);
      throw Errors.internal(err.message || "Failed to reach Termux SMS Gateway");
    }
  }

  // ─── 1. SMS Gateway 24 (SIM Gateway fallback) ───
  if (env.SMSGATEWAY24_TOKEN && env.SMSGATEWAY24_DEVICE_ID) {
    console.log(`📱 [SMSGATEWAY24] Queueing OTP SMS to ${phone} via Android SIM Gateway...`);
    const url = "https://smsgateway24.com/getdata/addsms";

    const params = new URLSearchParams();
    params.append("token", env.SMSGATEWAY24_TOKEN);
    params.append("sendto", phone);
    params.append("body", `Your Whiteroom verification code is: ${otp}. Valid for 5 minutes.`);
    params.append("device_id", env.SMSGATEWAY24_DEVICE_ID);
    params.append("sim", "0");
    params.append("urgent", "1");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        console.error(`SmsGateway24 error: ${response.status} ${response.statusText}`);
        throw Errors.internal("SIM SMS Gateway unavailable");
      }

      const data = (await response.json()) as { error: number; message: string };
      if (data.error !== 0) {
        console.error(`SmsGateway24 API error code ${data.error}: ${data.message}`);
        throw Errors.internal(`Failed to send SMS via SIM: ${data.message}`);
      }

      console.log(`✅ [SMSGATEWAY24] OTP queued successfully on Android device.`);
      return;
    } catch (err: any) {
      console.error("❌ SMS Gateway 24 connection failed:", err);
      throw Errors.internal(err.message || "Failed to reach SIM SMS Gateway");
    }
  }

  // ─── 2. MSG91 REST API ───
  if (env.MSG91_API_KEY && env.MSG91_TEMPLATE_ID) {
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
    return;
  }

  // ─── 3. Development fallback — log OTP to console
  console.log(`\n📱 [DEV OTP] Phone: ${phone.slice(-4).padStart(phone.length, '*')} → OTP: ${otp}\n`);
}
