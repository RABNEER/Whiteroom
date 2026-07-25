import qrcode from "qrcode-terminal";
import path from "node:path";
import fs from "node:fs/promises";
import { watch as fsWatch } from "node:fs";
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

let dbTableEnsured = false;

async function ensureDbTable() {
  if (dbTableEnsured) return;
  try {
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
    dbTableEnsured = true;
  } catch {}
}

async function syncAuthFilesFromDb(folder: string, force = false) {
  try {
    await ensureDbTable();
    if (!force) {
      try {
        const existing = await fs.readdir(folder);
        if (existing && existing.length > 5) {
          return;
        }
      } catch {}
    }

    const rows = await db.execute(sql`
      SELECT key, value FROM whatsapp_bot_state;
    `);

    if (rows && rows.length > 0) {
      console.log(`📥 [WHATSAPP BOT] Restoring ${rows.length} auth files from PostgreSQL...`);
      await fs.mkdir(folder, { recursive: true });
      for (const row of rows) {
        const filePath = path.join(folder, row.key as string);
        await fs.writeFile(filePath, row.value as string, "utf8");
      }
      console.log("✅ [WHATSAPP BOT] Auth state restored successfully from database.");
    } else {
      console.log("ℹ️ [WHATSAPP BOT] No saved auth state found in database.");
    }
  } catch (err) {
    console.error("❌ [WHATSAPP BOT] Failed to restore auth state from database:", err);
  }
}

const fileHashCache = new Map<string, string>();

async function syncAuthFilesToDb(folder: string) {
  try {
    let files: string[];
    try {
      files = await fs.readdir(folder);
    } catch {
      return;
    }

    let updatedCount = 0;
    for (const file of files) {
      const filePath = path.join(folder, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        const content = await fs.readFile(filePath, "utf8");
        if (fileHashCache.get(file) === content) {
          continue;
        }
        await db.execute(sql`
          INSERT INTO whatsapp_bot_state (key, value, updated_at)
          VALUES (${file}, ${content}, NOW())
          ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value, updated_at = NOW();
        `);
        fileHashCache.set(file, content);
        updatedCount++;
      }
    }
    
    const dbKeys = await db.execute(sql`SELECT key FROM whatsapp_bot_state;`);
    for (const row of dbKeys) {
      const key = row.key as string;
      if (!files.includes(key)) {
        await db.execute(sql`DELETE FROM whatsapp_bot_state WHERE key = ${key};`);
        fileHashCache.delete(key);
      }
    }
    if (updatedCount > 0) {
      console.log(`✅ [WHATSAPP BOT] Auth state successfully backed up (${updatedCount} changed files).`);
    }
  } catch (err) {
    console.error("❌ [WHATSAPP BOT] Failed to sync auth state to database:", err);
  }
}

let isWatcherActive = false;
let syncTimeout: NodeJS.Timeout | null = null;
let isReconnecting = false;
let isLoggingOut = false;
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | null = null;

function getBackoffMs(attempt: number, isConflict = false): number {
  const base = isConflict ? 30_000 : 3_000;
  const cap = 5 * 60 * 1000;
  const exponential = Math.min(base * Math.pow(2, attempt), cap);
  const jitter = Math.random() * 0.3 * exponential;
  return Math.floor(exponential + jitter);
}

function scheduleReconnect(isConflict: boolean) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const delay = getBackoffMs(reconnectAttempts, isConflict);
  reconnectAttempts++;
  console.log(
    `🔄 [WHATSAPP BOT] Scheduling reconnect attempt #${reconnectAttempts} in ${Math.round(delay / 1000)}s...`
  );
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startBot(true).catch((err) =>
      console.error("💥 [WHATSAPP BOT] Reconnect failed:", err)
    );
  }, delay);
}

async function setupFolderWatcher(folder: string) {
  if (isWatcherActive) return;
  try {
    await fs.mkdir(folder, { recursive: true });
  } catch {}
  isWatcherActive = true;
  console.log("👀 [WHATSAPP BOT] Watching auth state folder for real-time PostgreSQL backup...");
  
  fsWatch(folder, () => {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      syncAuthFilesToDb(folder);
    }, 3000);
  });
}

export async function logoutBot(options: {
  skipRemoteLogout?: boolean;
  restart?: boolean;
} = {}) {
  const { skipRemoteLogout = false, restart = true } = options;

  if (isLoggingOut) {
    console.log("ℹ️ [WHATSAPP BOT] Logout already in progress, skipping duplicate.");
    return;
  }
  isLoggingOut = true;

  console.log("🗑️ [WHATSAPP BOT] Resetting session credentials...");

  try {
    fileHashCache.clear();

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = 0;
    isReconnecting = false;

    const authFolder = path.resolve(process.cwd(), "auth_info_baileys");

    const sock = (globalThis as any).whatsappSocket;
    (globalThis as any).whatsappSocket = null;
    (globalThis as any).whatsappBotConnected = false;
    (globalThis as any).whatsappLatestQr = null;

    if (sock) {
      if (!skipRemoteLogout) {
        try {
          if (sock.ws && (sock.ws as any).isOpen) {
            await Promise.race([
              Promise.resolve(sock.logout?.()).catch((e) => {
                console.warn("⚠️ [WHATSAPP BOT] Ignored error during sock.logout():", e?.message || e);
              }),
              new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
            ]);
          }
        } catch (e: any) {
          console.warn("⚠️ [WHATSAPP BOT] Socket logout ignored:", e?.message || e);
        }
      }
      try {
        sock.end?.(undefined);
      } catch {}
    }

    try {
      await db.execute(sql`DELETE FROM whatsapp_bot_state;`);
      console.log("✅ [WHATSAPP BOT] Cleared bot state from database.");
    } catch (err) {
      console.error("❌ [WHATSAPP BOT] Failed to delete database state:", err);
    }

    try {
      await fs.rm(authFolder, { recursive: true, force: true });
      console.log("✅ [WHATSAPP BOT] Cleared local auth folder.");
    } catch (err) {
      console.error("❌ [WHATSAPP BOT] Failed to delete local folder:", err);
    }

    (globalThis as any).whatsappBotStarted = false;
    isReconnecting = false;

    if (restart) {
      await new Promise((r) => setTimeout(r, 500));
      startBot(false).catch((err) =>
        console.error("Failed to restart bot:", err)
      );
    }
  } finally {
    isLoggingOut = false;
  }
}

export async function startBot(isReconnect = false) {
  if (isReconnecting) {
    console.log("ℹ️ [WHATSAPP BOT] Already reconnecting, skipping duplicate start.");
    return;
  }
  if (!isReconnect && (globalThis as any).whatsappBotStarted) {
    console.log("ℹ️ [WHATSAPP BOT] Bot daemon already running, skipping duplicate start.");
    return;
  }
  if (!isReconnect) {
    (globalThis as any).whatsappBotStarted = true;
  }
  isReconnecting = true;

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
    await syncAuthFilesFromDb(authFolder, !isReconnect);
    console.log("📂 [WHATSAPP BOT] Saving auth state in:", authFolder);
    const authState = await useMultiFileAuthState(authFolder);
    state = authState.state;
    saveCreds = authState.saveCreds;
  } catch (err: any) {
    isReconnecting = false;
    const errMsg = err?.message || "";
    if (errMsg.includes("Bad MAC") || errMsg.includes("decryption")) {
      console.error("⚠️ [WHATSAPP BOT] Bad session keys during initialization. Purging session to self-heal...", err);
      await logoutBot({ skipRemoteLogout: true });
      return;
    }
    throw err;
  }

  setupFolderWatcher(authFolder);

  let version: [number, number, number] = [2, 3000, 1015978430];
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
    printQRInTerminal: false,
    syncFullHistory: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
    retryRequestDelayMs: 500,
  });

  (globalThis as any).whatsappSocket = sock;

  (sock.ev as any).on("error", (err: unknown) => {
    console.warn("⚠️ [WHATSAPP BOT] Socket ev error caught safely:", err);
  });
  if (sock.ws) {
    (sock.ws as any).on("error", (err: unknown) => {
      console.warn("⚠️ [WHATSAPP BOT] WebSocket error caught safely:", err);
    });
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n📱 [WHATSAPP BOT] Scan this QR code using Linked Devices in WhatsApp:");
        qrcode.generate(qr, { small: true });
        (globalThis as any).whatsappLatestQr = qr;
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || "";
        const isBadMac =
          errorMessage.includes("Bad MAC") || errorMessage.includes("decryption");
        const isRateLimit =
          statusCode === 429 ||
          errorMessage.toLowerCase().includes("rate") ||
          errorMessage.toLowerCase().includes("unavailable");
        const isConflict = statusCode === 440;
        const isLoggedOut =
          statusCode === DisconnectReason.loggedOut ||
          statusCode === 401;
        const shouldReconnect = !isLoggedOut && !isBadMac;

        console.log(
          `❌ [WHATSAPP BOT] Connection closed. Reason Status: ${statusCode}. Error: ${errorMessage}. Reconnecting: ${shouldReconnect}`
        );
        (globalThis as any).whatsappBotConnected = false;
        isReconnecting = false;

        if (isBadMac || isRateLimit) {
          console.warn(
            "⚠️ [WHATSAPP BOT] Detected Bad MAC / Rate Limit error. Wiping corrupted session state to self-heal..."
          );
          await logoutBot({ skipRemoteLogout: true });
        } else if (isLoggedOut) {
          console.log(
            "⚠️ [WHATSAPP BOT] Logged out (401). Clearing dead session WITHOUT remote logout to avoid process crash..."
          );
          await logoutBot({ skipRemoteLogout: true });
        } else if (isConflict) {
          console.log(
            `⚠️ [WHATSAPP BOT] Conflict (440) — another WhatsApp Web session opened. ` +
              `Backing off before retry (Attempt #${reconnectAttempts}) to avoid conflict death-spiral.`
          );
          if (reconnectAttempts >= 4) {
            console.warn(
              "💥 [WHATSAPP BOT] Persistent 440 conflicts detected. Clearing stale session credentials to self-heal..."
            );
            await logoutBot({ skipRemoteLogout: true });
          } else {
            scheduleReconnect(true);
          }
        } else if (shouldReconnect) {
          scheduleReconnect(false);
        }
      } else if (connection === "open") {
        console.log("\n✅ [WHATSAPP BOT] Connected successfully to WhatsApp network!");
        (globalThis as any).whatsappLatestQr = null;
        (globalThis as any).whatsappBotConnected = true;
        isReconnecting = false;
        setTimeout(() => {
          if ((globalThis as any).whatsappBotConnected) {
            reconnectAttempts = 0;
          }
        }, 30_000);
      }
    } catch (err) {
      console.error("❌ [WHATSAPP BOT] Unhandled error in connection.update:", err);
      isReconnecting = false;
    }
  });

  // Listen for incoming messages
  sock.ev.on("messages.upsert", async (m) => {
    console.log(`✉️ [WHATSAPP BOT] Message event: type = ${m.type}, messages = ${m.messages.length}`);
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      if (!msg.message) continue;

      // Skip messages sent by us
      if (msg.key.fromMe) continue;

      const rawFrom = msg.key.remoteJid;
      if (!rawFrom) continue;

      if (!rawFrom.endsWith("@s.whatsapp.net") && !rawFrom.endsWith("@lid")) continue;

      // 1. ROBUST JID & PHONE RESOLUTION (3-Tier Fallback)
      const senderPn = (msg.key as any)?.senderPn || (msg as any)?.senderPn;
      const participant = msg.key.participant || (msg as any).participant;
      const remoteJidAlt = (msg.key as any)?.remoteJidAlt;

      let targetJid = rawFrom;
      
      if (senderPn) {
        targetJid = `${senderPn.replace(/\D/g, "")}@s.whatsapp.net`;
      } else if (remoteJidAlt && remoteJidAlt.endsWith("@s.whatsapp.net")) {
        targetJid = remoteJidAlt;
      } else if (participant && participant.endsWith("@s.whatsapp.net")) {
        targetJid = participant;
      }

      // If we are STILL stuck with an @lid JID, try to extract digits or log a warning
      const isStillLid = targetJid.endsWith("@lid");
      const cleanPhone = targetJid.split("@")[0].split(":")[0].replace(/\D/g, "");

      // 2. UNWRAP MESSAGE CONTENT
      const innerMsg =
        msg.message.ephemeralMessage?.message ||
        msg.message.viewOnceMessage?.message ||
        msg.message.viewOnceMessageV2?.message ||
        msg.message;

      const text =
        innerMsg.conversation ||
        innerMsg.extendedTextMessage?.text ||
        innerMsg.imageMessage?.caption ||
        innerMsg.videoMessage?.caption ||
        innerMsg.buttonsResponseMessage?.selectedDisplayText ||
        innerMsg.listResponseMessage?.singleSelectReply?.selectedRowId ||
        innerMsg.templateButtonReplyMessage?.selectedDisplayText ||
        "";

      if (!text.trim()) continue;

      console.log(`✉️ [WHATSAPP BOT] Received message from ${rawFrom} (Target JID: ${targetJid}, Phone: ${cleanPhone}): "${text}"`);

      // Prevent infinite loops
      if (text.includes("Whiteroom Verification")) continue;

      // Match "Verify <code_or_session>"
      const match = text.match(/Verify\s+([A-Za-z0-9_-]+)/i);

      if (match) {
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
              senderJid: targetJid,
              rawJid: rawFrom,
              text: text,
              code: code,
              isLid: isStillLid,
            }),
          });

          const data = (await response.json().catch(() => ({}))) as any;

          if (response.ok && data.success) {
            console.log(`✅ [WHATSAPP BOT] Verification success for code ${code}! Sending confirmation to ${targetJid}...`);
            
            await sock.sendMessage(
              targetJid,
              {
                text: `✅ *Whiteroom Verification*\n\nDevice verification request for code *${code}* was successful.\n\nYou can now switch back to the Whiteroom application to complete your sign-in.`,
              },
              { quoted: msg }
            );
            
            console.log(`🚀 [WHATSAPP BOT] Success message sent to ${targetJid}`);
          } else {
            console.warn(`❌ [WHATSAPP BOT] Verification failed for code ${code}:`, data);
            
            await sock.sendMessage(
              targetJid,
              {
                text: `❌ *Whiteroom Verification Failed*\n\nThe code *${code}* is either expired or invalid.\n\nPlease generate a new verification code from the Whiteroom app and try again.`,
              },
              { quoted: msg }
            );
          }
        } catch (err) {
          console.error(`💥 [WHATSAPP BOT] Error during verification execution for code ${code}:`, err);
          
          try {
            await sock.sendMessage(
              targetJid,
              {
                text: `⚠️ *Whiteroom Verification Error*\n\nSystem error processing your verification. Please try again in a few minutes.`,
              },
              { quoted: msg }
            );
          } catch (sendErr) {
            console.error("❌ [WHATSAPP BOT] Failed to send error message:", sendErr);
          }
        }
      }
    }
  });

  isReconnecting = false;
}

// Start the daemon bot
startBot().catch((err) => {
  console.error("💥 [WHATSAPP BOT] Fatal crash:", err);
});
