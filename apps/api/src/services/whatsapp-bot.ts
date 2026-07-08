import pkg from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import path from "node:path";
import fs from "node:fs";
import { config } from "dotenv";
import { normalizePhone, hashSHA256 } from "../lib/otp.js";
import { db } from "../lib/db.js";
import { sql } from "drizzle-orm";

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

export const inMemoryLogs: string[] = [];

if (process.env.DEBUG_WHATSAPP === "true") {
  console.log = (...args) => {
    inMemoryLogs.push(`[LOG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`);
    if (inMemoryLogs.length > 500) inMemoryLogs.shift();
    originalLog(...args);
  };

  console.error = (...args) => {
    inMemoryLogs.push(`[ERROR] ${args.map(a => {
      if (a instanceof Error) {
        return `${a.name}: ${a.message}\n${a.stack}`;
      }
      if (a && typeof a === 'object') {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return a;
    }).join(' ')}`);
    if (inMemoryLogs.length > 500) inMemoryLogs.shift();
    originalError(...args);
  };

  console.warn = (...args) => {
    inMemoryLogs.push(`[WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`);
    if (inMemoryLogs.length > 500) inMemoryLogs.shift();
    originalWarn(...args);
  };
}

const baileysModule = (pkg as any).default || pkg;

// Load environment variables from multiple paths to support monorepo running
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });

const port = process.env.PORT || 3000;
let webhookUrl =
  process.env.WHATSAPP_WEBHOOK_URL ||
  `http://localhost:${port}/api/v1/auth/whatsapp/webhook`;

// If target is localhost, ensure it uses the correct running port
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

export function getLatestQr(): string | null {
  return (globalThis as any).whatsappLatestQr || null;
}

if (!webhookSecret) {
  console.warn(
    "⚠️  [WARNING] WHATSAPP_WEBHOOK_SECRET is not defined in your environment variables. Webhook calls might fail security checks."
  );
}

console.log("🤖 [WHATSAPP BOT] Target Webhook URL:", webhookUrl);

async function ensureDbTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS whatsapp_bot_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.execute(sql`
    ALTER TABLE whatsapp_bot_state ENABLE ROW LEVEL SECURITY;
  `);
}

async function syncAuthFilesFromDb(folder: string) {
  try {
    await ensureDbTable();
    const rows = await db.execute(sql`
      SELECT key, value FROM whatsapp_bot_state;
    `);

    if (rows && rows.length > 0) {
      console.log(`📥 [WHATSAPP BOT] Restoring ${rows.length} auth files from PostgreSQL...`);
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
      }
      for (const row of rows) {
        const filePath = path.join(folder, row.key as string);
        fs.writeFileSync(filePath, row.value as string, "utf8");
      }
      console.log("✅ [WHATSAPP BOT] Auth state restored successfully from database.");
    } else {
      console.log("ℹ️ [WHATSAPP BOT] No saved auth state found in database.");
    }
  } catch (err) {
    console.error("❌ [WHATSAPP BOT] Failed to restore auth state from database:", err);
  }
}

async function syncAuthFilesToDb(folder: string) {
  try {
    if (!fs.existsSync(folder)) return;
    const files = fs.readdirSync(folder);
    console.log(`📤 [WHATSAPP BOT] Syncing ${files.length} auth files to PostgreSQL...`);
    
    for (const file of files) {
      const filePath = path.join(folder, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const content = fs.readFileSync(filePath, "utf8");
        await db.execute(sql`
          INSERT INTO whatsapp_bot_state (key, value, updated_at)
          VALUES (${file}, ${content}, NOW())
          ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_at = NOW();
        `);
      }
    }
    
    // Clean up deleted files from the database
    const dbKeys = await db.execute(sql`SELECT key FROM whatsapp_bot_state;`);
    for (const row of dbKeys) {
      const key = row.key as string;
      if (!files.includes(key)) {
        await db.execute(sql`DELETE FROM whatsapp_bot_state WHERE key = ${key};`);
      }
    }
    console.log("✅ [WHATSAPP BOT] Auth state successfully backed up in database.");
  } catch (err) {
    console.error("❌ [WHATSAPP BOT] Failed to sync auth state to database:", err);
  }
}

let isWatcherActive = false;
let syncTimeout: NodeJS.Timeout | null = null;

function setupFolderWatcher(folder: string) {
  if (isWatcherActive) return;
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  isWatcherActive = true;
  console.log("👀 [WHATSAPP BOT] Watching auth state folder for real-time PostgreSQL backup...");
  
  fs.watch(folder, (eventType, filename) => {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      syncAuthFilesToDb(folder);
    }, 1500); // 1.5 seconds debounce
  });
}

export async function logoutBot() {
  console.log("🗑️ [WHATSAPP BOT] Resetting session credentials...");
  const authFolder = path.resolve(process.cwd(), "auth_info_baileys");
  
  const sock = (globalThis as any).whatsappSocket;
  if (sock) {
    try {
      sock.logout();
    } catch {}
    try {
      sock.end();
    } catch {}
  }
  
  try {
    await db.execute(sql`DELETE FROM whatsapp_bot_state;`);
    console.log("✅ [WHATSAPP BOT] Cleared bot state from database.");
  } catch (err) {
    console.error("❌ [WHATSAPP BOT] Failed to delete database state:", err);
  }
  
  try {
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
      console.log("✅ [WHATSAPP BOT] Cleared local auth folder.");
    }
  } catch (err) {
    console.error("❌ [WHATSAPP BOT] Failed to delete local folder:", err);
  }
  
  (globalThis as any).whatsappBotConnected = false;
  (globalThis as any).whatsappLatestQr = null;
  (globalThis as any).whatsappBotStarted = false;

  // Start fresh
  startBot(true).catch(err => console.error("Failed to restart bot:", err));
}

export async function startBot(isReconnect = false) {
  if (!isReconnect && (globalThis as any).whatsappBotStarted) {
    console.log("ℹ️ [WHATSAPP BOT] Bot daemon already running, skipping duplicate start.");
    return;
  }
  if (!isReconnect) {
    (globalThis as any).whatsappBotStarted = true;
  }

  // Load Baileys module dynamically to bypass ESM/CJS named exports interop issues
  const baileys = await import("@whiskeysockets/baileys");
  const useMultiFileAuthState = baileys.useMultiFileAuthState;
  const DisconnectReason = baileys.DisconnectReason;
  let makeWASocket = baileys.default;
  if (typeof makeWASocket === "object" && makeWASocket !== null) {
    makeWASocket = (makeWASocket as any).default || makeWASocket;
  }

  const authFolder = path.resolve(process.cwd(), "auth_info_baileys");
  
  let state, saveCreds;
  try {
    // Restore files from DB before Baileys initializes
    await syncAuthFilesFromDb(authFolder);
    console.log("📂 [WHATSAPP BOT] Saving auth state in:", authFolder);
    const authState = await useMultiFileAuthState(authFolder);
    state = authState.state;
    saveCreds = authState.saveCreds;
  } catch (err: any) {
    const errMsg = err?.message || "";
    if (errMsg.includes("Bad MAC") || errMsg.includes("decryption")) {
      console.error("⚠️ [WHATSAPP BOT] Bad session keys during initialization. Purging session to self-heal...", err);
      await logoutBot();
      return;
    }
    throw err;
  }

  // Watch for updates to sync files back to DB
  setupFolderWatcher(authFolder);

  // Fetch the latest WhatsApp Web version to prevent 405 Method Not Allowed connection errors
  let version: [number, number, number] = [2, 3000, 1015978430]; // Default fallback
  try {
    const fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    if (fetchLatestBaileysVersion) {
      const fetched = await fetchLatestBaileysVersion();
      version = fetched.version as [number, number, number];
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

  (globalThis as any).whatsappSocket = sock;

  // Save credentials when updated
  sock.ev.on("creds.update", saveCreds);

  // Monitor connection updates
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 [WHATSAPP BOT] Scan this QR code using Linked Devices in WhatsApp:");
      qrcode.generate(qr, { small: true });
      (globalThis as any).whatsappLatestQr = qr;
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || "";
      const isBadMac = errorMessage.includes("Bad MAC") || errorMessage.includes("decryption");
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !isBadMac;
      
      console.log(
        `❌ [WHATSAPP BOT] Connection closed. Reason Status: ${statusCode}. Error: ${errorMessage}. Reconnecting: ${shouldReconnect}`
      );
      (globalThis as any).whatsappBotConnected = false;

      if (isBadMac) {
        console.log("⚠️ [WHATSAPP BOT] Detected Bad MAC / decryption error. Clearing session to self-heal...");
        logoutBot();
      } else if (shouldReconnect) {
        startBot(true);
      } else {
        console.log("⚠️ [WHATSAPP BOT] Logged out. Clearing session state to restart cleanly...");
        logoutBot();
      }
    } else if (connection === "open") {
      console.log("\n✅ [WHATSAPP BOT] Connected successfully to WhatsApp network!");
      (globalThis as any).whatsappLatestQr = null;
      (globalThis as any).whatsappBotConnected = true;
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

      console.log(`✉️ [WHATSAPP BOT] Received message from ${from}: "${text}" (Raw: ${JSON.stringify(msg.message)})`);

      // Ignore messages containing our bot's own response template to prevent infinite loops
      if (text.includes("Whiteroom Verification")) continue;

      // Match the validation pattern (e.g. Verify <session_id>)
      const match = text.match(/Verify\s+([A-Za-z0-9_-]+)/i);

      if (match) {
        const code = match[1];
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
        const isLid = from.endsWith("@lid");
        
        try {
          if (isLid) {
            console.log(`ℹ️ [WHATSAPP BOT] Sender is using a LID JID (${from}). Bypassing local phone hash check for compatibility.`);
            isValidSender = true;
          } else {
            const normalizedSenderPhone = normalizePhone(cleanFrom);
            const senderPhoneHash = hashSHA256(normalizedSenderPhone);
            
            console.log(`🔍 [WHATSAPP BOT] Comparing sender phone hash with registered phone hash`);
            console.log(`🔍 [WHATSAPP BOT] Sender JID: ${from} -> Cleaned JID: ${cleanFrom} -> Normalized: ${normalizedSenderPhone}`);
            console.log(`🔍 [WHATSAPP BOT] Sender Phone Hash: ${senderPhoneHash}`);
            console.log(`🔍 [WHATSAPP BOT] Registered Phone Hash: ${registeredPhoneHash}`);
            if (senderPhoneHash === registeredPhoneHash) {
              isValidSender = true;
            }
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
              isLid: isLid,
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
