import pkg from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import path from "node:path";
import { config } from "dotenv";

const makeWASocket = (pkg as any).default || pkg;
const { DisconnectReason, useMultiFileAuthState } = pkg as any;

// Load environment variables from multiple paths to support monorepo running
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });

const webhookUrl =
  process.env.WHATSAPP_WEBHOOK_URL ||
  "http://localhost:3000/api/v1/auth/whatsapp/webhook";
const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;

if (!webhookSecret) {
  console.warn(
    "⚠️  [WARNING] WHATSAPP_WEBHOOK_SECRET is not defined in your environment variables. Webhook calls might fail security checks."
  );
}

console.log("🤖 [WHATSAPP BOT] Target Webhook URL:", webhookUrl);

async function startBot() {
  const authFolder = path.resolve(process.cwd(), "auth_info_baileys");
  console.log("📂 [WHATSAPP BOT] Saving auth state in:", authFolder);

  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  // Fetch the latest WhatsApp Web version to prevent 405 Method Not Allowed connection errors
  let version = [2, 3000, 1019707846]; // Default fallback
  try {
    const { fetchLatestBaileysVersion } = pkg as any;
    if (fetchLatestBaileysVersion) {
      const fetched = await fetchLatestBaileysVersion();
      version = fetched.version;
      console.log(`ℹ️ [WHATSAPP BOT] Using WhatsApp Web version: ${version.join(".")}`);
    }
  } catch (err) {
    console.warn("⚠️ [WHATSAPP BOT] Failed to fetch latest WhatsApp Web version, using fallback:", err);
  }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // We'll print it ourselves using qrcode-terminal with customizable options
  });

  // Save credentials when updated
  sock.ev.on("creds.update", saveCreds);

  // Monitor connection updates
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 [WHATSAPP BOT] Scan this QR code using Linked Devices in WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(
        `❌ [WHATSAPP BOT] Connection closed. Reason Status: ${statusCode}. Reconnecting: ${shouldReconnect}`
      );

      if (shouldReconnect) {
        startBot();
      } else {
        console.log("⚠️ [WHATSAPP BOT] Logged out. Delete 'auth_info_baileys' folder and restart to pair again.");
      }
    } else if (connection === "open") {
      console.log("\n✅ [WHATSAPP BOT] Connected successfully to WhatsApp network!");
    }
  });

  // Listen for incoming messages
  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      // Ignore messages sent by the bot itself or empty messages
      if (msg.key.fromMe || !msg.message) continue;

      const from = msg.key.remoteJid; // JID format: 919999999999@s.whatsapp.net
      if (!from || !from.endsWith("@s.whatsapp.net")) continue;

      // Extract text content from various message types
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      // Match the validation pattern (e.g. WH-XXXX)
      const match = text.match(/WH-[A-Z0-9]{4}/i);

      if (match) {
        const cleanPhone = from.split("@")[0]!;
        const code = match[0].toUpperCase();
        console.log(`📩 [WHATSAPP BOT] Found verification code ${code} from phone: ${cleanPhone}`);

        try {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": webhookSecret || "",
            },
            body: JSON.stringify({
              from: cleanPhone,
              text: text,
            }),
          });

          if (response.ok) {
            console.log(`✅ [WHATSAPP BOT] Webhook success for code ${code}`);
            await sock.sendMessage(from, {
              text: `✅ *Whiteroom Verification*\n\nDevice verification request for code *${code}* was successful.\n\nYou can now switch back to the Whiteroom application to complete your sign-in.`,
            });
          } else {
            const errData = await response.json().catch(() => ({}));
            console.error(`❌ [WHATSAPP BOT] Webhook failed for code ${code}:`, errData);
            await sock.sendMessage(from, {
              text: `❌ *Whiteroom Verification Failed*\n\nThe code *${code}* is either expired or invalid.\n\nPlease generate a new verification code from the Whiteroom app and try again.`,
            });
          }
        } catch (err) {
          console.error(`❌ [WHATSAPP BOT] Webhook request error:`, err);
          await sock.sendMessage(from, {
            text: `⚠️ *Whiteroom Verification Error*\n\nUnable to reach the verification servers right now. Please try again in a few minutes.`,
          });
        }
      }
    }
  });
}

// Start the daemon bot
startBot().catch((err) => {
  console.error("💥 [WHATSAPP BOT] Fatal crash:", err);
});
