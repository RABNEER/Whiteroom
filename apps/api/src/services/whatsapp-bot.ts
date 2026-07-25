import qrcode from "qrcode-terminal";
import path from "node:path";
import fs from "node:fs/promises";
import { watch as fsWatch } from "node:fs";
import { config } from "dotenv";

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

import * as Sentry from "@sentry/node";
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 1.0,
  });
}

const port = process.env.PORT || 3000;
let webhookUrl =
  process.env.WHATSAPP_WEBHOOK_URL ||
  `http://127.0.0.1:${port}/api/v1/auth/whatsapp/webhook`;

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
          // Local auth files already exist on disk, avoid overwriting with stale DB state during reconnects
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
let activeWatcher: import("node:fs").FSWatcher | null = null;
let syncTimeout: NodeJS.Timeout | null = null;
let isReconnecting = false;
let isLoggingOut = false;
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let qrTimeout: NodeJS.Timeout | null = null;

/** Exponential backoff with jitter (capped at 5 minutes). */
function getBackoffMs(attempt: number, isConflict = false): number {
  // For 440 conflicts, start with a longer base — 30s, 60s, 120s, 240s, 300s
  const base = isConflict ? 30_000 : 3_000;
  const cap = 5 * 60 * 1000; // 5 minutes max
  const exponential = Math.min(base * Math.pow(2, attempt), cap);
  const jitter = Math.random() * 0.3 * exponential; // ±30% jitter
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
  } catch { /* folder exists */ }
  isWatcherActive = true;
  console.log("👀 [WHATSAPP BOT] Watching auth state folder for real-time PostgreSQL backup...");
  
  try {
    activeWatcher = fsWatch(folder, () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        syncAuthFilesToDb(folder);
      }, 3000); // 3.0 seconds debounce
    });
    activeWatcher.on("error", (err) => {
      console.warn("⚠️ [WHATSAPP BOT] Folder watcher error handled:", err.message);
    });
  } catch (err: any) {
    console.warn("⚠️ [WHATSAPP BOT] Failed to attach folder watcher:", err.message);
    isWatcherActive = false;
  }
}

/**
 * Clear WhatsApp session credentials and optionally restart the bot.
 *
 * IMPORTANT: Never call sock.logout() when the socket is already closed
 * (e.g. after a 401 logged-out). Baileys' logout() tries to send a
 * message on a dead socket, rejects the promise, and an unhandled
 * rejection kills the entire Node process — taking Railway down with it.
 */
export async function logoutBot(options: {
  /** Skip remote logout when WhatsApp already disconnected us (401). */
  skipRemoteLogout?: boolean;
  /** Restart bot after clearing so a new QR can be scanned. Default true. */
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

    // Cancel any pending backoff reconnect before we restart fresh
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = 0;
    isReconnecting = false;

    const authFolder = path.resolve(process.cwd(), "auth_info_baileys");

    // Detach socket reference first so concurrent handlers cannot use it
    const sock = (globalThis as any).whatsappSocket;
    (globalThis as any).whatsappSocket = null;
    (globalThis as any).whatsappBotConnected = false;
    (globalThis as any).whatsappLatestQr = null;

    if (sock) {
      // Only attempt remote logout when the session is still alive and socket is open.
      // On 401/logged-out or closed connection, calling logout() throws Boom('Connection Closed')
      // and crashes the process.
      if (!skipRemoteLogout) {
        try {
          if (!sock.ws || (sock.ws as any).isOpen) {
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
      } catch {
        // ignore
      }
    }

    // Always wipe persisted credentials so we do not restore a dead session
    try {
      await db.execute(sql`DELETE FROM whatsapp_bot_state;`);
      console.log("✅ [WHATSAPP BOT] Cleared bot state from database.");
    } catch (err) {
      console.error("❌ [WHATSAPP BOT] Failed to delete database state:", err);
    }

    if (activeWatcher) {
      try {
        activeWatcher.close();
      } catch {}
      activeWatcher = null;
    }
    isWatcherActive = false;
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
    isReconnecting = false;

    if (restart) {
      // Brief pause so any in-flight Baileys teardown settles
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

  // Load Baileys module dynamically to bypass ESM/CJS named exports interop issues
  const baileys = await import("@whiskeysockets/baileys");
  const useMultiFileAuthState = baileys.useMultiFileAuthState;
  const DisconnectReason = baileys.DisconnectReason;
  const getBinaryNodeChild = baileys.getBinaryNodeChild;
  const getBinaryNodeChildren = baileys.getBinaryNodeChildren;
  let makeWASocket = baileys.default;
  if (typeof makeWASocket === "object" && makeWASocket !== null) {
    makeWASocket = (makeWASocket as any).default || makeWASocket;
  }

  const authFolder = path.resolve(process.cwd(), "auth_info_baileys");
  
  let state, saveCreds;
  try {
    // Restore files from DB before Baileys initializes (only force overwrite on fresh start)
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
    syncFullHistory: false, // Prevents rate limit check unavailable errors
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
    retryRequestDelayMs: 500,
  });

  // Wrap internal Baileys send functions to prevent "Connection Closed" unhandled rejections when socket drops during internal background tasks (e.g. sendRetryRequest)
  const originalSendNode = sock.sendNode;
  if (originalSendNode) {
    sock.sendNode = async (...args: any[]) => {
      try {
        return await originalSendNode.apply(sock, args as any);
      } catch (err: any) {
        if (
          err?.message?.includes("Connection Closed") ||
          err?.output?.statusCode === DisconnectReason.connectionClosed
        ) {
          // Silently absorb or debug log since socket is disconnecting/reconnecting
          return undefined as any;
        }
        throw err;
      }
    };
  }

  const originalRelayMessage = sock.relayMessage;
  if (originalRelayMessage) {
    sock.relayMessage = async (...args: any[]) => {
      try {
        return await originalRelayMessage.apply(sock, args as any);
      } catch (err: any) {
        if (
          err?.message?.includes("Connection Closed") ||
          err?.output?.statusCode === DisconnectReason.connectionClosed
        ) {
          return undefined as any;
        }
        throw err;
      }
    };
  }

  const originalSendMessage = sock.sendMessage;
  if (originalSendMessage) {
    sock.sendMessage = async (...args: any[]) => {
      try {
        return await originalSendMessage.apply(sock, args as any);
      } catch (err: any) {
        if (
          err?.message?.includes("Connection Closed") ||
          err?.output?.statusCode === DisconnectReason.connectionClosed
        ) {
          console.warn("⚠️ [WHATSAPP BOT] sendMessage skipped: Connection Closed (socket reconnecting)");
          return undefined as any;
        }
        throw err;
      }
    };
  }

  (globalThis as any).whatsappSocket = sock;

  // Prevent unhandled socket/emitter errors from crashing the Node.js process
  (sock.ev as any).on("error", (err: unknown) => {
    console.warn("⚠️ [WHATSAPP BOT] Socket ev error caught safely:", err);
  });
  if (sock.ws) {
    (sock.ws as any).on("error", (err: unknown) => {
      console.warn("⚠️ [WHATSAPP BOT] WebSocket error caught safely:", err);
    });
  }

  // Save credentials when updated
  sock.ev.on("creds.update", saveCreds);

  // Monitor connection updates
  sock.ev.on("connection.update", async (update) => {
    try {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n📱 [WHATSAPP BOT] Scan this QR code using Linked Devices in WhatsApp:");
        qrcode.generate(qr, { small: true });
        (globalThis as any).whatsappLatestQr = qr;
        if (qrTimeout) clearTimeout(qrTimeout);
        qrTimeout = setTimeout(() => {
          if (!(globalThis as any).whatsappBotConnected && (globalThis as any).whatsappLatestQr) {
            console.log("⏰ [WHATSAPP BOT] QR code has been available for 60s — visit /api/v1/auth/whatsapp/qr to view and scan on your phone.");
          }
        }, 60_000);
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
        const isConflict = statusCode === 440; // another WA Web session opened
        // 401 = loggedOut. Also treat generic "Connection Failure" with 401 as dead session.
        const isLoggedOut =
          statusCode === DisconnectReason.loggedOut ||
          statusCode === 401;
        const shouldReconnect = !isLoggedOut && !isBadMac;

        console.log(
          `❌ [WHATSAPP BOT] Connection closed. Reason Status: ${statusCode}. Error: ${errorMessage}. Reconnecting: ${shouldReconnect}`
        );
        (globalThis as any).whatsappBotConnected = false;
        isReconnecting = false; // Allow scheduleReconnect to set its own guard

        if (isBadMac || isRateLimit) {
          console.warn(
            "⚠️ [WHATSAPP BOT] Detected Bad MAC / Rate Limit error. Wiping corrupted session state to self-heal..."
          );
          // Session is corrupted — do not attempt remote logout on a dead socket
          await logoutBot({ skipRemoteLogout: true });
        } else if (isLoggedOut) {
          console.log(
            "⚠️ [WHATSAPP BOT] Logged out (401). Clearing dead session WITHOUT remote logout to avoid process crash..."
          );
          // CRITICAL: skipRemoteLogout — socket is already closed; sock.logout() would
          // throw Boom('Connection Closed') and kill the Railway process in a restart loop.
          await logoutBot({ skipRemoteLogout: true });
        } else if (isConflict) {
          // Status 440: another WhatsApp Web session took over. Reconnecting immediately
          // would kick that session and start an infinite conflict loop. Wait with backoff.
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
            scheduleReconnect(true /* isConflict */);
          }
        } else if (shouldReconnect) {
          scheduleReconnect(false);
        }
      } else if (connection === "open") {
        console.log("\n✅ [WHATSAPP BOT] Connected successfully to WhatsApp network!");
        (globalThis as any).whatsappLatestQr = null;
        (globalThis as any).whatsappBotConnected = true;
        isReconnecting = false;
        // Delay resetting backoff counter so if we get kicked by another session (440 conflict),
        // we correctly increment attempts instead of ping-ponging at attempt 0
        setTimeout(() => {
          if ((globalThis as any).whatsappBotConnected) {
            reconnectAttempts = 0;
          }
        }, 120_000); // 2 minutes to ensure stability before resetting counter
      }
    } catch (err) {
      // Never let connection handler errors take down the whole API process
      console.error("❌ [WHATSAPP BOT] Unhandled error in connection.update:", err);
      isReconnecting = false;
    }
  });

  // Listen for incoming messages
  sock.ev.on("messages.upsert", async (m) => {
    try {
      console.log(`✉️ [WHATSAPP BOT] Message event: type = ${m.type}, messages = ${m.messages.length}`);
      if (m.type !== "notify" && m.type !== "append") return;

      for (const msg of m.messages) {
        console.log(`📥 [WHATSAPP BOT] Processing message key:`, JSON.stringify(msg.key));

        // Skip messages without content
        if (!msg.message) {
          console.log("ℹ️ [WHATSAPP BOT] Message content is empty/undefined, skipping.");
          continue;
        }

        const from = msg.key.remoteJid;
        if (!from || (!from.endsWith("@s.whatsapp.net") && !from.endsWith("@lid"))) {
          console.log(`ℹ️ [WHATSAPP BOT] Skipping unsupported JID: ${from}`);
          continue;
        }

        // Unwrap all known Baileys v6 message wrappers
        const innerMsg =
          msg.message.ephemeralMessage?.message ||
          msg.message.viewOnceMessage?.message ||
          msg.message.deviceSentMessage?.message ||
          msg.message;

        const text =
          innerMsg.conversation ||
          innerMsg.extendedTextMessage?.text ||
          "";

        console.log(`✉️ [WHATSAPP BOT] Received message from ${from}: "${text}"`);

        // Skip empty text
        if (!text) {
          console.log(`ℹ️ [WHATSAPP BOT] Empty text from ${from}, skipping.`);
          continue;
        }

        // Skip bot's own reply templates
        if (
          text.includes("Whiteroom Verification") ||
          text.trim().startsWith("🤖 *Whiteroom") ||
          text.trim().startsWith("❌ *Whiteroom") ||
          text.trim().startsWith("✅ *Whiteroom") ||
          text.trim().startsWith("⚠️ *Whiteroom")
        ) {
          console.log(`ℹ️ [WHATSAPP BOT] Skipping bot automated reply template.`);
          continue;
        }

        // Respond to ping/greeting commands
        const cleanText = text.trim().toLowerCase();
        if (cleanText === "ping" || cleanText === "hi" || cleanText === "hello" || cleanText === "help") {
          console.log(`🤖 [WHATSAPP BOT] Replying to greeting/ping from ${from}`);
          await sock.sendMessage(from, {
            text: `🤖 *Whiteroom Verification Bot is Online!*\n\nTo verify your device, send your verification code in the format:\n\n*Verify <code>*`,
          });
          continue;
        }

        // Match verification code
        const match = text.match(/Verify\s+([A-Za-z0-9_-]+)/i);

        if (!match) {
          console.log(`ℹ️ [WHATSAPP BOT] Message from ${from} did not match syntax ("Verify <code>"). Ignoring.`);
          continue;
        }

        const code = match[1];
        console.log(`📩 [WHATSAPP BOT] Found verification code ${code} from sender: ${from}`);

        // ── Step 1: Resolve session phone ──
        let registeredPhone: string | null = null;
        try {
          const resolveUrl = webhookUrl.replace(/\/webhook\/?$/, `/session/${code}/phone`);
          console.log(`🔍 [WHATSAPP BOT] Resolving session phone via: GET ${resolveUrl}`);

          const resolveRes = await fetch(resolveUrl, {
            method: "GET",
            headers: { "x-webhook-secret": webhookSecret || "" },
          });

          const rawBody = await resolveRes.text();
          console.log(`🔍 [WHATSAPP BOT] Session phone resolve response: HTTP ${resolveRes.status}`);

          if (resolveRes.ok) {
            const resolveData = JSON.parse(rawBody) as any;
            registeredPhone = resolveData.data?.phone || null;
          } else {
            console.warn(`⚠️ [WHATSAPP BOT] Could not resolve phone for code ${code}: HTTP ${resolveRes.status} - ${rawBody}`);
          }
        } catch (err) {
          console.error(`❌ [WHATSAPP BOT] Failed to fetch session phone for code ${code}:`, err);
        }

        if (!registeredPhone) {
          console.warn(`⚠️ [WHATSAPP BOT] Ignoring code ${code} because no active session phone number matches it.`);
          await sock.sendMessage(from, {
            text: `❌ *Whiteroom Verification Failed*\n\nThe code *${code}* is either expired or invalid.\n\nPlease generate a new verification code from the Whiteroom app and try again.`,
          });
          continue;
        }

        // ── Step 2: Validate sender identity ──
        let isValidSender = false;
        const cleanFrom = from.split("@")[0]?.split(":")[0] || "";
        const isLid = from.endsWith("@lid");
        const registeredDigits = registeredPhone.replace(/^\+/, "");

        try {
          if (cleanFrom === registeredDigits) {
            console.log(`✅ [WHATSAPP BOT] Sender JID directly matches registered phone digits (${cleanFrom}).`);
            isValidSender = true;
          } else {
            console.log(`ℹ️ [WHATSAPP BOT] Checking sender mapping (${from}) against registered phone (${registeredDigits})...`);

            // 1. Check Baileys onWhatsApp helper
            const waInfoList = await sock.onWhatsApp(registeredDigits).catch(() => [] as any[]);
            const waInfo = waInfoList?.[0];
            if (waInfo && waInfo.exists) {
              const registeredJid = waInfo.jid?.split("@")[0]?.split(":")[0];
              const registeredLid = waInfo.lid?.split("@")[0]?.split(":")[0];
              console.log(`🔍 [WHATSAPP BOT] onWhatsApp(${registeredDigits}) => JID: ${waInfo.jid}, LID: ${waInfo.lid}`);
              if (cleanFrom === registeredLid || cleanFrom === registeredJid) {
                console.log(`✅ [WHATSAPP BOT] Sender (${cleanFrom}) matches registered phone LID/JID.`);
                isValidSender = true;
              }
            }

            // 2. USync query for phone
            if (!isValidSender && sock.query && sock.generateMessageTag) {
              try {
                const iqPhone = {
                  tag: 'iq',
                  attrs: { to: '@s.whatsapp.net', type: 'get', xmlns: 'usync' },
                  content: [{
                    tag: 'usync',
                    attrs: { context: 'interactive', mode: 'query', sid: sock.generateMessageTag(), last: 'true', index: '0' },
                    content: [
                      { tag: 'query', attrs: {}, content: [{ tag: 'contact', attrs: {} }] },
                      { tag: 'list', attrs: {}, content: [{ tag: 'user', attrs: {}, content: [{ tag: 'contact', attrs: {}, content: `+${registeredDigits}` }] }] },
                    ],
                  }],
                };
                const resultPhone = await sock.query(iqPhone);
                const usyncNode = getBinaryNodeChild(resultPhone, 'usync');
                const listNode = getBinaryNodeChild(usyncNode, 'list');
                const userNodes = getBinaryNodeChildren(listNode, 'user');
                for (const uNode of userNodes) {
                  if (uNode?.attrs) {
                    const attrJid = uNode.attrs.jid?.split("@")[0]?.split(":")[0];
                    const attrLid = uNode.attrs.lid?.split("@")[0]?.split(":")[0];
                    console.log(`🔍 [WHATSAPP BOT] USync phone query => JID: ${uNode.attrs.jid}, LID: ${uNode.attrs.lid}`);
                    if (cleanFrom === attrJid || cleanFrom === attrLid) {
                      console.log(`✅ [WHATSAPP BOT] Sender (${cleanFrom}) matches USync attributes.`);
                      isValidSender = true;
                      break;
                    }
                  }
                }
              } catch (err) {
                console.warn(`⚠️ [WHATSAPP BOT] USync phone query failed:`, err);
              }
            }

            // 3. Reverse LID query
            if (!isValidSender && isLid && sock.query && sock.generateMessageTag) {
              try {
                const iqLid = {
                  tag: 'iq',
                  attrs: { to: '@s.whatsapp.net', type: 'get', xmlns: 'usync' },
                  content: [{
                    tag: 'usync',
                    attrs: { context: 'interactive', mode: 'query', sid: sock.generateMessageTag(), last: 'true', index: '0' },
                    content: [
                      { tag: 'query', attrs: {}, content: [{ tag: 'contact', attrs: {} }] },
                      { tag: 'list', attrs: {}, content: [{ tag: 'user', attrs: { jid: from } }] },
                    ],
                  }],
                };
                const resultLid = await sock.query(iqLid);
                const usyncNode = getBinaryNodeChild(resultLid, 'usync');
                const listNode = getBinaryNodeChild(usyncNode, 'list');
                const userNodes = getBinaryNodeChildren(listNode, 'user');
                for (const uNode of userNodes) {
                  if (uNode?.attrs) {
                    const attrJid = uNode.attrs.jid?.split("@")[0]?.split(":")[0];
                    console.log(`🔍 [WHATSAPP BOT] USync LID reverse query (${from}) => JID: ${uNode.attrs.jid}`);
                    if (attrJid === registeredDigits) {
                      console.log(`✅ [WHATSAPP BOT] Reverse LID query proved ${from} belongs to ${registeredDigits}.`);
                      isValidSender = true;
                      break;
                    }
                  }
                }
              } catch (err) {
                console.warn(`⚠️ [WHATSAPP BOT] USync LID reverse query failed:`, err);
              }
            }

            if (!isValidSender) {
              console.log(`❌ [WHATSAPP BOT] Sender mismatch! Sender: ${cleanFrom} (${from}), Registered for session: ${registeredDigits}`);
            }
          }
        } catch (err) {
          console.error(`❌ [WHATSAPP BOT] Phone verification check error:`, err);
        }

        if (!isValidSender) {
          console.warn(`⚠️ [WHATSAPP BOT] Ignoring code ${code} because sender JID ${from} is not authorized for session phone ${registeredPhone}`);
          await sock.sendMessage(from, {
            text: `❌ *Whiteroom Verification Failed*\n\nThe phone number associated with your WhatsApp account does not match the phone number entered inside the Whiteroom app.\n\nPlease verify you entered your own WhatsApp phone number and try again.`,
          });
          continue;
        }

        // ── Step 3: Call webhook to complete verification ──
        console.log(`📩 [WHATSAPP BOT] Verified code ${code} for sender JID: ${from} (Phone: ${registeredPhone})`);

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
              phone: registeredPhone,
              code: code,
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
    } catch (err) {
      console.error("❌ [WHATSAPP BOT] Unhandled error in messages.upsert:", err);
      Sentry.captureException(err, { extra: { context: "messages.upsert" } });
    }
  });

  isReconnecting = false;
}

// Start the daemon bot
startBot().catch((err) => {
  console.error("💥 [WHATSAPP BOT] Fatal crash:", err);
  Sentry.captureException(err, { extra: { context: "startBot fatal crash" } });
});
