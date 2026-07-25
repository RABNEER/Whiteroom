import qrcode from "qrcode-terminal";
import path from "node:path";
import fs from "node:fs/promises";
import { watch as fsWatch } from "node:fs";
import { config } from "dotenv";
import { db } from "../lib/db.js";
import { sql } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  getBinaryNodeChild,
  getBinaryNodeChildren,
} from "@whiskeysockets/baileys";


// Load environment variables from root and app directory
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 1.0,
  });
}

// Global log buffer for diagnostics
export const inMemoryLogs: string[] = [];

if (process.env.DEBUG_WHATSAPP === "true") {
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;

  console.log = (...args) => {
    inMemoryLogs.push(`[LOG] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`);
    if (inMemoryLogs.length > 500) inMemoryLogs.shift();
    origLog(...args);
  };
  console.error = (...args) => {
    inMemoryLogs.push(`[ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`);
    if (inMemoryLogs.length > 500) inMemoryLogs.shift();
    origErr(...args);
  };
  console.warn = (...args) => {
    inMemoryLogs.push(`[WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`);
    if (inMemoryLogs.length > 500) inMemoryLogs.shift();
    origWarn(...args);
  };
}

const port = process.env.PORT || 3000;
// Always use 127.0.0.1 with current process port for internal webhook calls
const webhookUrl = `http://127.0.0.1:${port}/api/v1/auth/whatsapp/webhook`;
const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET || "whiteroom-whatsapp-bot-internal-secret";

export function getLatestQr(): string | null {
  return (globalThis as any).whatsappLatestQr || null;
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
      console.log(`✅ [WHATSAPP BOT] Auth state backed up to database (${updatedCount} changed files).`);
    }
  } catch (err) {
    console.error("❌ [WHATSAPP BOT] Failed to sync auth state to database:", err);
  }
}

let activeWatcher: import("node:fs").FSWatcher | null = null;
let syncTimeout: NodeJS.Timeout | null = null;
let isReconnecting = false;
let isLoggingOut = false;
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | null = null;

function scheduleReconnect(isConflict: boolean) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const delay = isConflict ? 30_000 : 5_000;
  reconnectAttempts++;
  console.log(`🔄 [WHATSAPP BOT] Scheduling reconnect attempt #${reconnectAttempts} in ${Math.round(delay / 1000)}s...`);
  reconnectTimer = setTimeout(() => {
    startBot(true).catch((err) =>
      console.error("❌ [WHATSAPP BOT] Reconnect failed:", err)
    );
  }, delay);
}

function setupFolderWatcher(folder: string) {
  if (activeWatcher) return;
  try {
    activeWatcher = fsWatch(folder, () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        syncAuthFilesToDb(folder);
      }, 3000);
    });
  } catch (err: any) {
    console.warn("⚠️ [WHATSAPP BOT] Folder watcher warning:", err.message);
  }
}

/**
 * Clear WhatsApp session credentials from disk and DB, and restart bot daemon.
 */
export async function logoutBot(options: {
  skipRemoteLogout?: boolean;
  restart?: boolean;
} = {}) {
  const { skipRemoteLogout = false, restart = true } = options;

  if (isLoggingOut) return;
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
          if (!sock.ws || (sock.ws as any).isOpen) {
            await Promise.race([
              Promise.resolve(sock.logout?.()).catch(() => {}),
              new Promise<void>((r) => setTimeout(r, 1500)),
            ]);
          }
        } catch {}
      }
      try {
        sock.end?.(undefined);
      } catch {}
    }

    // Always clear database state
    try {
      await db.execute(sql`DELETE FROM whatsapp_bot_state;`);
      console.log("✅ [WHATSAPP BOT] Cleared bot state from database.");
    } catch (err) {
      console.error("❌ [WHATSAPP BOT] Failed to delete database state:", err);
    }

    if (activeWatcher) {
      try { activeWatcher.close(); } catch {}
      activeWatcher = null;
    }
    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }

    try {
      await fs.rm(authFolder, { recursive: true, force: true });
      console.log("✅ [WHATSAPP BOT] Cleared local auth folder.");
    } catch (err) {
      console.error("❌ [WHATSAPP BOT] Failed to delete local folder:", err);
    }

    (globalThis as any).whatsappBotStarted = false;

    if (restart) {
      await new Promise((r) => setTimeout(r, 1000));
      startBot(false).catch((err) =>
        console.error("Failed to restart bot:", err)
      );
    }
  } finally {
    isLoggingOut = false;
  }
}

/**
 * Main Baileys WhatsApp bot daemon initializer.
 */
export async function startBot(isReconnect = false) {
  if (isReconnecting && !isReconnect) return;
  if ((globalThis as any).whatsappBotStarted && !isReconnect) return;

  isReconnecting = true;
  (globalThis as any).whatsappBotStarted = true;

  console.log("🤖 [WHATSAPP BOT] Initializing Baileys WhatsApp daemon...");

  const authFolder = path.resolve(process.cwd(), "auth_info_baileys");
  await fs.mkdir(authFolder, { recursive: true });

  let state, saveCreds;
  try {
    await syncAuthFilesFromDb(authFolder, !isReconnect);
    const authState = await useMultiFileAuthState(authFolder);
    state = authState.state;
    saveCreds = authState.saveCreds;
  } catch (err: any) {
    isReconnecting = false;
    console.error("⚠️ [WHATSAPP BOT] Bad session keys during initialization. Purging to self-heal...", err?.message);
    await logoutBot({ skipRemoteLogout: true });
    return;
  }

  setupFolderWatcher(authFolder);

  let version: [number, number, number] = [2, 3000, 1015978430];
  try {
    if (fetchLatestBaileysVersion) {
      const fetched = await fetchLatestBaileysVersion();
      version = fetched.version as [number, number, number];
      console.log(`ℹ️ [WHATSAPP BOT] WhatsApp Web version: ${version.join(".")}`);
    }
  } catch {}

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
  });

  (globalThis as any).whatsappSocket = sock;

  (sock.ev as any).on("error", (err: unknown) => {
    console.warn("⚠️ [WHATSAPP BOT] Socket ev error:", err);
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("📱 [WHATSAPP BOT] QR Code generated! Scan via Linked Devices.");
        qrcode.generate(qr, { small: true });
        (globalThis as any).whatsappLatestQr = qr;
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || "";
        const isConflict = statusCode === 440;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

        console.log(`❌ [WHATSAPP BOT] Connection closed. Status: ${statusCode}, Error: ${errorMessage}`);
        (globalThis as any).whatsappBotConnected = false;
        isReconnecting = false;

        if (isLoggedOut || isConflict) {
          console.warn("⚠️ [WHATSAPP BOT] Session logged out or conflict (440). Purging credentials to self-heal...");
          await logoutBot({ skipRemoteLogout: true });
        } else {
          scheduleReconnect(false);
        }
      } else if (connection === "open") {
        console.log("✅ [WHATSAPP BOT] Connected successfully to WhatsApp network!");
        (globalThis as any).whatsappLatestQr = null;
        (globalThis as any).whatsappBotConnected = true;
        isReconnecting = false;
        reconnectAttempts = 0;
      }
    } catch (err) {
      console.error("❌ [WHATSAPP BOT] Error in connection.update:", err);
      isReconnecting = false;
    }
  });

  // Listen for incoming WhatsApp messages
  sock.ev.on("messages.upsert", async (m) => {
    try {
      if (m.type !== "notify" && m.type !== "append") return;

      for (const msg of m.messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const from = msg.key.remoteJid;
        if (!from || (!from.endsWith("@s.whatsapp.net") && !from.endsWith("@lid"))) continue;

        // Unwrap Baileys v6 wrappers
        const innerMsg =
          msg.message.ephemeralMessage?.message ||
          msg.message.viewOnceMessage?.message ||
          msg.message.deviceSentMessage?.message ||
          msg.message;

        const text =
          innerMsg.conversation ||
          innerMsg.extendedTextMessage?.text ||
          "";

        if (!text) continue;

        // Skip bot's own response templates to avoid loop
        if (text.includes("Whiteroom Verification") || text.trim().startsWith("🤖 *Whiteroom")) continue;

        console.log(`✉️ [WHATSAPP BOT] Received message from ${from}: "${text}"`);

        // Check for verification code matching "Verify <code>" or raw code
        const match = text.match(/Verify\s+([A-Za-z0-9_-]+)/i) || [null, text.trim()];
        const code = match[1];

        if (!code || code.length < 5) {
          // LLM Fallback / Ping greeting for non-verification queries
          const clean = text.trim().toLowerCase();
          if (clean === "ping" || clean === "hi" || clean === "hello" || clean === "help") {
            await sock.sendMessage(from, {
              text: `🤖 *Whiteroom Verification Bot is Online!*\n\nTo verify your device, send your verification code in the format:\n\n*Verify <code>*`,
            }, { quoted: msg });
          }
          continue;
        }

        console.log(`📩 [WHATSAPP BOT] Processing verification code ${code} from ${from}`);

        // Step 1: Resolve session phone number
        let registeredPhone: string | null = null;
        try {
          const resolveUrl = `${webhookUrl.replace(/\/webhook\/?$/, '')}/session/${code}/phone`;
          const resolveRes = await fetch(resolveUrl, {
            headers: { "x-webhook-secret": webhookSecret },
          });

          if (resolveRes.ok) {
            const data = (await resolveRes.json()) as any;
            registeredPhone = data.data?.phone || null;
          }
        } catch (err) {
          console.error(`❌ [WHATSAPP BOT] Failed to resolve session phone:`, err);
        }

        if (!registeredPhone) {
          console.warn(`⚠️ [WHATSAPP BOT] Session code ${code} not found or expired.`);
          await sock.sendMessage(from, {
            text: `❌ *Whiteroom Verification Failed*\n\nThe code *${code}* is either expired or invalid.\n\nPlease generate a new code from the Whiteroom app and try again.`,
          }, { quoted: msg });
          continue;
        }

        // Step 2: Validate sender identity matches session phone
        let isValidSender = false;
        const cleanFrom = from.split("@")[0]?.split(":")[0] || "";
        const registeredDigits = registeredPhone.replace(/^\+/, "");
        const isLid = from.endsWith("@lid");

        if (isLid) {
          // If the sender is using a privacy LID, we bypass the phone number check.
          // Since the code is a secure, short-lived one-time token, possessing it is proof enough.
          isValidSender = true;
          console.log(`ℹ️ [WHATSAPP BOT] Bypassing phone validation for @lid sender ${from}`);
        } else if (cleanFrom === registeredDigits) {
          isValidSender = true;
        }

        if (!isValidSender) {
          console.warn(`⚠️ [WHATSAPP BOT] Sender ${from} mismatch for phone ${registeredPhone}`);
          await sock.sendMessage(from, {
            text: `❌ *Whiteroom Verification Failed*\n\nThe phone number associated with your WhatsApp account does not match the number entered in Whiteroom.`,
          }, { quoted: msg });
          continue;
        }

        // Step 3: Complete verification via webhook
        try {
          const webhookRes = await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": webhookSecret,
            },
            body: JSON.stringify({
              from: cleanFrom,
              text,
              isLid: from.endsWith("@lid"),
              phone: registeredPhone,
              code,
            }),
          });

          if (webhookRes.ok) {
            console.log(`✅ [WHATSAPP BOT] Webhook verification success for code ${code}`);
            await sock.sendMessage(from, {
              text: `✅ *Whiteroom Verification*\n\nDevice verification request for code *${code}* was successful.\n\nYou can now return to the Whiteroom application.`,
            }, { quoted: msg });
          } else {
            await sock.sendMessage(from, {
              text: `❌ *Whiteroom Verification Failed*\n\nThe code *${code}* could not be verified. Please try again.`,
            }, { quoted: msg });
          }
        } catch (err) {
          console.error(`❌ [WHATSAPP BOT] Webhook call error:`, err);
          await sock.sendMessage(from, {
            text: `⚠️ *Whiteroom Verification Error*\n\nServer error. Please try again in a few minutes.`,
          }, { quoted: msg });
        }
      }
    } catch (err) {
      console.error("❌ [WHATSAPP BOT] Error processing messages:", err);
    }
  });

  isReconnecting = false;
}

// Start the daemon
startBot().catch((err) => {
  console.error("💥 [WHATSAPP BOT] Fatal daemon start crash:", err);
});
