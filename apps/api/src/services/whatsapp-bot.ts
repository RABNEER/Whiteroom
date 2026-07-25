import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import path from "node:path";
import { config } from "dotenv";

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });

export const inMemoryLogs: string[] = [];

const port = process.env.PORT || 3000;
let webhookUrl =
  process.env.WHATSAPP_WEBHOOK_URL ||
  `http://localhost:${port}/api/v1/auth/whatsapp/webhook`;

if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
  try {
    const urlObj = new URL(webhookUrl);
    urlObj.port = String(port);
    webhookUrl = urlObj.toString().replace(/\/$/, "");
  } catch (err) {
    console.error("Failed to parse webhookUrl:", err);
  }
}
const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;

console.log("🤖 [WHATSAPP BOT] Target Webhook URL:", webhookUrl);

let latestQr: string | null = null;

export function getLatestQr(): string | null {
  return latestQr;
}

export async function logoutBot(options: { skipRemoteLogout?: boolean; restart?: boolean } = {}) {
  try {
    await client.logout().catch(() => {});
    latestQr = null;
  } catch (err) {
    console.error("Failed to logout client:", err);
  }
}

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.resolve(process.cwd(), ".wwebjs_auth"),
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  },
});

client.on("qr", (qr) => {
  latestQr = qr;
  console.log("\n📱 [WHATSAPP BOT] Scan this QR code using Linked Devices in WhatsApp:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  latestQr = null;
  console.log("\n✅ [WHATSAPP BOT] Connected successfully to WhatsApp network via Chromium!");
});

client.on("authenticated", () => {
  console.log("🔒 [WHATSAPP BOT] Authenticated successfully.");
});

client.on("auth_failure", (msg) => {
  console.error("❌ [WHATSAPP BOT] Auth failure:", msg);
});

client.on("disconnected", (reason) => {
  console.warn("⚠️ [WHATSAPP BOT] Client disconnected:", reason);
});

client.on("message", async (msg) => {
  const text = msg.body || "";
  if (!text.trim()) return;

  const rawFrom = msg.from; // e.g. "919296003226@c.us" or "@lid"
  const cleanPhone = rawFrom.replace(/\D/g, "");

  console.log(`✉️ [WHATSAPP BOT] Received message from ${rawFrom} (${cleanPhone}): "${text}"`);

  // Prevent loops
  if (text.includes("Whiteroom Verification")) return;

  const match = text.match(/Verify\s+([A-Za-z0-9_-]+)/i);
  if (!match) return;

  const code = match[1];
  console.log(`📩 [WHATSAPP BOT] Found verification code ${code} for phone: ${cleanPhone}`);

  try {
    console.log(`📡 [WHATSAPP BOT] Sending verification request for session ${code} to ${webhookUrl}...`);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret || "",
      },
      body: JSON.stringify({
        from: cleanPhone,
        senderJid: rawFrom,
        rawJid: rawFrom,
        text: text,
        code: code,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as any;

    const replyText = (response.ok && data.success)
      ? `✅ *Whiteroom Verification*\n\nDevice verification request for code *${code}* was successful.\n\nYou can now switch back to the Whiteroom application to complete your sign-in.`
      : `❌ *Whiteroom Verification Failed*\n\n${data.error || "The code is either expired or invalid. Please generate a new verification code from the Whiteroom app."}`;

    // Send reply via Chromium page DOM
    await msg.reply(replyText);
    console.log(`🚀 [WHATSAPP BOT] Reply successfully sent to ${rawFrom}!`);
  } catch (err) {
    console.error(`💥 [WHATSAPP BOT] Error processing verification for code ${code}:`, err);
    try {
      await msg.reply(`⚠️ *Whiteroom Verification Error*\n\nSystem error processing your verification. Please try again.`);
    } catch (replyErr) {
      console.error("❌ [WHATSAPP BOT] Failed to send fallback error reply:", replyErr);
    }
  }
});

client.initialize().catch((err) => {
  console.error("💥 [WHATSAPP BOT] Failed to initialize Chromium client:", err);
});
