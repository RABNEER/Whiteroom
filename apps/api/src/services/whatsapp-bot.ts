import pkg from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import path from "node:path";
import { config } from "dotenv";
import { normalizePhone, hashSHA256 } from "../lib/otp.js";

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
    console.log(`✉️ [WHATSAPP BOT] Message event: type = ${m.type}, messages = ${m.messages.length}`);
    if (m.type !== "notify" && m.type !== "append") return;

    for (const msg of m.messages) {
      if (!msg.message) continue;

      const from = msg.key.remoteJid; // JID format: 919999999999@s.whatsapp.net or LID format
      if (!from || (!from.endsWith("@s.whatsapp.net") && !from.endsWith("@lid"))) continue;

      // Extract text content from various message types
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      // Ignore messages containing our bot's own response template to prevent infinite loops
      if (text.includes("Whiteroom Verification")) continue;

      // Match the validation pattern (e.g. WH-XXXX)
      const match = text.match(/WH-[A-Z0-9]{4}/i);

      if (match) {
        const code = match[0].toUpperCase();
        console.log(`📩 [WHATSAPP BOT] Found verification code ${code} from sender: ${from}`);

        // Resolve phone number corresponding to the verification session from backend
        let registeredPhoneHash: string | null = null;
        try {
          const resolveUrl = webhookUrl.replace(/\/webhook\/?$/, `/session/${code}/phone`);
          console.log(`🔍 [WHATSAPP BOT] Resolving session phone via: GET ${resolveUrl}`);

          const resolveRes = await fetch(resolveUrl, {
            method: "GET",
            headers: {
              "x-webhook-secret": webhookSecret || "",
            },
          });

          const rawBody = await resolveRes.text();
          console.log(`🔍 [WHATSAPP BOT] Session phone resolve response: HTTP ${resolveRes.status}`);

          if (resolveRes.ok) {
            const resolveData = JSON.parse(rawBody) as any;
            registeredPhoneHash = resolveData.data?.phone || null;
          } else {
            console.warn(`⚠️ [WHATSAPP BOT] Could not resolve phone for code ${code}: HTTP ${resolveRes.status} - ${rawBody}`);
          }
        } catch (err) {
          console.error(`❌ [WHATSAPP BOT] Failed to fetch session phone for code ${code}:`, err);
        }

        if (!registeredPhoneHash) {
          console.warn(`⚠️ [WHATSAPP BOT] Ignoring code ${code} because no active session phone number matches it.`);
          await sock.sendMessage(from, {
            text: `❌ *Whiteroom Verification Failed*\n\nThe code *${code}* is either expired or invalid.\n\nPlease generate a new verification code from the Whiteroom app and try again.`,
          });
          continue;
        }

        // Verify that the sender JID belongs to the registered phone number
        let isValidSender = false;
        const cleanFrom = from.split("@")[0]?.split(":")[0];
        
        try {
          const normalizedSenderPhone = normalizePhone(cleanFrom);
          const senderPhoneHash = hashSHA256(normalizedSenderPhone);
          
          console.log(`🔍 [WHATSAPP BOT] Comparing sender phone hash with registered phone hash`);
          if (senderPhoneHash === registeredPhoneHash) {
            isValidSender = true;
          }
        } catch (err) {
          console.error(`❌ [WHATSAPP BOT] Phone normalization or hashing error:`, err);
        }

        if (!isValidSender) {
          console.warn(`⚠️ [WHATSAPP BOT] Ignoring code ${code} because sender JID ${from} is not authorized for phone hash ${registeredPhoneHash}`);
          await sock.sendMessage(from, {
            text: `❌ *Whiteroom Verification Failed*\n\nThe phone number associated with your WhatsApp account does not match the phone number registered in the Whiteroom session.\n\nPlease verify you are using the same phone number in the app.`,
          });
          continue;
        }

        console.log(`📩 [WHATSAPP BOT] Verified code ${code} for sender JID: ${from}`);

        try {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": webhookSecret || "",
            },
            body: JSON.stringify({
              from: cleanFrom,
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
