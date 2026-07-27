import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import path from "node:path";
import fs from "node:fs";
import { config } from "dotenv";

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });

// Catch unhandled promise rejections (e.g. internal whatsapp-web.js Client.inject timeouts)
process.on("unhandledRejection", (reason: any) => {
  const reasonMsg = reason?.message || String(reason);
  if (reasonMsg.includes("ProtocolError") || reasonMsg.includes("timed out")) {
    console.warn("⚠️ [WHATSAPP BOT] Caught non-fatal Puppeteer ProtocolError timeout:", reasonMsg);
    return;
  }
  console.error("🛑 [PROCESS] Unhandled Rejection:", reason);
});

// ─── Shared state (exported for route handlers) ───
export const inMemoryLogs: string[] = [];
let latestQr: string | null = null;
let botConnected = false;
let botInitialized = false;
let client: InstanceType<typeof Client> | null = null;

export function getLatestQr(): string | null {
  return latestQr;
}

export function isBotConnected(): boolean {
  return botConnected;
}

export async function logoutBot(
  options: { skipRemoteLogout?: boolean; restart?: boolean } = {}
) {
  try {
    if (client) {
      await client.logout().catch(() => {});
    }
    latestQr = null;
    botConnected = false;
    (globalThis as any).whatsappBotConnected = false;
    await db.delete(whatsappBotStore).catch(() => {});
    console.log("🗑️ [WHATSAPP BOT DB] Cleared auth session from PostgreSQL database.");
  } catch (err) {
    console.error("Failed to logout client:", err);
  }
}

// ─── Chrome detection ───
function findChromeExecutable(): string | undefined {
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/root/.nix-profile/bin/chromium",
    "/nix/var/nix/profiles/default/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          "Google\\Chrome\\Application\\chrome.exe"
        )
      : "",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log(`🌐 [WHATSAPP BOT] Found system Chrome at: ${p}`);
      return p;
    }
  }
  return undefined;
}

// ─── Message handler (shared between 'message' and 'message_create') ───
const processedMessageIds = new Set<string>();

function buildWebhookUrl(): string {
  const port = process.env.PORT || 8080;
  if (process.env.WHATSAPP_WEBHOOK_URL) {
    return process.env.WHATSAPP_WEBHOOK_URL.replace("localhost", "127.0.0.1");
  }
  return `http://127.0.0.1:${port}/api/v1/auth/whatsapp/webhook`;
}

async function handleIncomingMessage(
  msg: any,
  webhookUrl: string,
  webhookSecret: string
) {
  try {
    // Deduplication — both 'message' and 'message_create' may fire for the same msg
    const msgId =
      msg.id?._serialized || msg.id?.id || `${msg.from}-${msg.timestamp}`;
    if (processedMessageIds.has(msgId)) return;
    processedMessageIds.add(msgId);

    // Expire old IDs to prevent memory leak (keep last 500)
    if (processedMessageIds.size > 500) {
      const iter = processedMessageIds.values();
      for (let i = 0; i < 200; i++) iter.next();
      // Delete oldest entries by recreating
      const arr = Array.from(processedMessageIds);
      processedMessageIds.clear();
      arr.slice(-300).forEach((id) => processedMessageIds.add(id));
    }

    // Skip messages sent BY the bot itself
    if (msg.fromMe) {
      return;
    }

    const rawFrom = msg.from || ""; // e.g. "919296003226@c.us"

    // Skip groups, newsletters, and status broadcasts
    if (
      rawFrom.endsWith("@g.us") ||
      rawFrom.endsWith("@newsletter") ||
      rawFrom === "status@broadcast"
    ) {
      return;
    }

    const text = msg.body || "";
    if (!text.trim()) return;

    // Extract phone from JID
    const jidNumber = rawFrom.split("@")[0];
    const cleanPhone = jidNumber.replace(/\D/g, "");

    console.log(
      `✉️ [WHATSAPP BOT] Received message from ${rawFrom} (${cleanPhone}): "${text}"`
    );

    const match = text.match(/Verify\s+([A-Za-z0-9_-]+)/i);
    if (!match) return;

    const code = match[1];
    console.log(
      `📩 [WHATSAPP BOT] Found verification code ${code} for phone: ${cleanPhone}`
    );

    console.log(
      `📡 [WHATSAPP BOT] Sending verification request for session ${code} to ${webhookUrl}...`
    );

    const startTime = Date.now();
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
        isLid: rawFrom.endsWith("@lid"),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as any;
    console.log(`⚡ [WHATSAPP BOT] Webhook request completed in ${Date.now() - startTime}ms!`);

    const replyText =
      response.ok && data.success
        ? `✅ *Whiteroom Verification*\n\nDevice verification request for code *${code}* was successful.\n\nYou can now switch back to the Whiteroom application to complete your sign-in.`
        : `❌ *Whiteroom Verification Failed*\n\n${data.error || "The code is either expired or invalid. Please generate a new verification code from the Whiteroom app."}`;

    // Deliver reply text by resolving the @lid identity to active contact chat via msg.getChat()
    try {
      const chat = await msg.getChat().catch(() => null);
      if (chat) {
        await chat.sendMessage(replyText).catch(() => msg.reply(replyText).catch(() => {}));
        console.log(`🚀 [WHATSAPP BOT] Reply successfully delivered to chat (${rawFrom})!`);
      } else {
        await msg.reply(replyText).catch(() => {});
        console.log(`🚀 [WHATSAPP BOT] Fallback reply sent to ${rawFrom}!`);
      }
    } catch (replyErr: any) {
      console.warn(`⚠️ [WHATSAPP BOT] Non-fatal notice sending text reply:`, replyErr?.message || replyErr);
    }
  } catch (err) {
    console.error(
      `💥 [WHATSAPP BOT] Error processing verification request:`,
      err
    );
  }
}

import { db } from "../lib/db.js";
import { whatsappBotStore, eq, sql } from "@whiteroom/db";

// ─── Junk Cache Exclusions (Keeps auth session under 2MB and <120MB RAM) ───
function isJunkCacheFile(relPath: string): boolean {
  const norm = relPath.toLowerCase().replace(/\\/g, "/");
  return (
    norm.includes("/cache/") ||
    norm.includes("/code cache/") ||
    norm.includes("/gpucache/") ||
    norm.includes("/service worker/") ||
    norm.includes("/blob storage/") ||
    norm.includes("/crashpad/") ||
    norm.includes("/webrtc") ||
    norm.endsWith("lock") ||
    norm.endsWith("singletonlock")
  );
}

// ─── Database Auth Sync Helpers ───
async function restoreAuthFromDb(authDir: string): Promise<boolean> {
  try {
    console.log("💾 [WHATSAPP BOT DB] Checking for saved auth session in PostgreSQL database...");
    
    await db.execute(
      `CREATE TABLE IF NOT EXISTS whatsapp_bot_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );`
    ).catch(() => {});

    const rows = await db.select().from(whatsappBotStore);
    if (!rows || rows.length === 0) {
      console.log("ℹ️ [WHATSAPP BOT DB] No saved auth session found in database.");
      return false;
    }

    let restoredCount = 0;
    const junkKeysToDelete: string[] = [];

    for (const row of rows) {
      if (isJunkCacheFile(row.key)) {
        junkKeysToDelete.push(row.key);
        continue;
      }
      const filePath = path.join(authDir, row.key);
      const dirName = path.dirname(filePath);
      fs.mkdirSync(dirName, { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(row.value, "base64"));
      restoredCount++;
    }

    // Clean up junk cache entries from PostgreSQL in background
    if (junkKeysToDelete.length > 0) {
      db.execute(
        `DELETE FROM whatsapp_bot_store WHERE key IN (${junkKeysToDelete.map((k) => `'${k.replace(/'/g, "''")}'`).join(",")});`
      ).catch(() => {});
    }

    console.log(`✅ [WHATSAPP BOT DB] Restored ${restoredCount} essential auth session files (purged ${junkKeysToDelete.length} junk cache files)!`);
    return restoredCount > 0;
  } catch (err) {
    console.error("❌ [WHATSAPP BOT DB] Error restoring session from DB:", err);
    return false;
  }
}

const fileMtimeCache = new Map<string, number>();
let tableCreated = false;

async function ensureTableCreated(): Promise<void> {
  if (tableCreated) return;
  try {
    await db.execute(
      `CREATE TABLE IF NOT EXISTS whatsapp_bot_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );`
    );
    tableCreated = true;
  } catch {}
}

async function saveAuthToDb(authDir: string): Promise<void> {
  try {
    if (!fs.existsSync(authDir)) return;
    await ensureTableCreated();

    function getFiles(dir: string): string[] {
      let results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(fullPath));
          } else {
            results.push(fullPath);
          }
        } catch {}
      }
      return results;
    }

    const files = getFiles(authDir);
    const pendingItems: Array<{ key: string; value: string; updatedAt: Date }> = [];

    for (const file of files) {
      const relPath = path.relative(authDir, file).replace(/\\/g, "/");
      if (isJunkCacheFile(relPath)) continue;

      try {
        const stat = fs.statSync(file);
        const lastMtime = fileMtimeCache.get(relPath);
        if (lastMtime && lastMtime === stat.mtimeMs) {
          continue; // Skip unchanged file
        }

        const content = fs.readFileSync(file).toString("base64");
        pendingItems.push({
          key: relPath,
          value: content,
          updatedAt: new Date(),
        });
        fileMtimeCache.set(relPath, stat.mtimeMs);
      } catch (fileErr) {
        // Ignore temporary locked files
      }
    }

    if (pendingItems.length === 0) return;

    // Bulk upsert in chunks of 50 items per SQL query (reduces 180 queries to 3 queries = 300ms)
    const chunkSize = 50;
    for (let i = 0; i < pendingItems.length; i += chunkSize) {
      const chunk = pendingItems.slice(i, i + chunkSize);
      await db
        .insert(whatsappBotStore)
        .values(chunk)
        .onConflictDoUpdate({
          target: whatsappBotStore.key,
          set: {
            value: sql`excluded.value`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    console.log(`✅ [WHATSAPP BOT DB] Bulk synced ${pendingItems.length} essential auth session files in background.`);
  } catch (err) {
    console.error("❌ [WHATSAPP BOT DB] Error saving session to DB:", err);
  }
}

// ─── Lazy initialization (called ONCE from index.ts) ───
export async function initWhatsAppBot(): Promise<void> {
  if (botInitialized) {
    console.log(
      "⚠️ [WHATSAPP BOT] initWhatsAppBot() called again — already initialized, skipping."
    );
    return;
  }
  botInitialized = true;

  const executablePath = findChromeExecutable();
  const authDataPath =
    process.env.WHATSAPP_AUTH_DATA_PATH ||
    path.resolve(process.cwd(), ".wwebjs_auth");

  const webhookUrl = buildWebhookUrl();
  const webhookSecret =
    process.env.WHATSAPP_WEBHOOK_SECRET ||
    "whiteroom-whatsapp-bot-internal-secret";

  console.log("🤖 [WHATSAPP BOT] Target Webhook URL:", webhookUrl);
  console.log("💾 [WHATSAPP BOT] Auth session path:", authDataPath);

  // Restore session from DB before starting Chromium
  await restoreAuthFromDb(authDataPath);

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: authDataPath,
    }),
    webVersionCache: {
      type: "remote",
      remotePath:
        "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018949826-alpha.html",
    },
    puppeteer: {
      headless: true,
      executablePath,
      protocolTimeout: 120000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-audio-output",
        "--disable-breakpad",
        "--disable-client-side-phishing-detection",
        "--disable-component-extensions-with-background-pages",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-ipc-flooding-protection",
        "--disable-notifications",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--blink-settings=imagesEnabled=false",
        "--disable-remote-fonts",
        "--disable-component-update",
        "--metrics-recording-only",
        "--no-default-browser-check",
        "--no-pings",
        "--password-store=basic",
        "--use-mock-keychain",
        "--disk-cache-size=1",
        "--media-cache-size=1",
        "--js-flags=--max-old-space-size=256",
      ],
    },
  });

  // ─── QR event ───
  client.on("qr", (qr: string) => {
    latestQr = qr;
    (globalThis as any).whatsappLatestQr = qr;
    console.log(
      "\n📱 [WHATSAPP BOT] Scan this QR code using Linked Devices in WhatsApp:"
    );
    qrcode.generate(qr, { small: true });
  });

  // ─── Ready event ───
  client.on("ready", async () => {
    latestQr = null;
    botConnected = true;
    (globalThis as any).whatsappLatestQr = null;
    (globalThis as any).whatsappBotConnected = true;
    console.log(
      "\n✅ [WHATSAPP BOT] Connected successfully to WhatsApp network via Chromium!"
    );

    // Immediate sync
    await saveAuthToDb(authDataPath);

    // Active CDP keep-alive ping every 10 seconds to keep Chromium main thread & WebSocket socket polling 100% active
    setInterval(async () => {
      if (botConnected && client?.pupPage) {
        await client.pupPage.evaluate(() => Date.now()).catch(() => {});
      }
    }, 10_000);

    // Delayed sync (15 seconds later) after Chromium flushes tokens to IndexedDB/LocalStorage
    setTimeout(async () => {
      console.log("⏰ [WHATSAPP BOT DB] Running post-auth delayed session sync...");
      await saveAuthToDb(authDataPath);
    }, 15_000);

    // Periodic sync & connection heartbeat every 2 minutes
    setInterval(async () => {
      if (botConnected && client) {
        const state = await client.getState().catch(() => "UNKNOWN");
        console.log(`💓 [WHATSAPP BOT] Heartbeat: Connected (State: ${state}) — Active and listening for messages...`);
        await saveAuthToDb(authDataPath).catch(() => {});
      }
    }, 2 * 60 * 1000);
  });

  // ─── Authenticated event ───
  client.on("authenticated", async () => {
    latestQr = null;
    (globalThis as any).whatsappLatestQr = null;
    console.log("🔒 [WHATSAPP BOT] Authenticated successfully.");
    await saveAuthToDb(authDataPath);
  });

  // Graceful shutdown sync when Railway stops or redeploys container
  const handleShutdown = async (signal: string) => {
    console.log(`🛑 [WHATSAPP BOT] Received ${signal}, saving auth session before exit...`);
    await saveAuthToDb(authDataPath).catch(() => {});
  };
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));

  // ─── Auth failure ───
  client.on("auth_failure", (msg: string) => {
    console.error("❌ [WHATSAPP BOT] Auth failure:", msg);
  });

  // ─── Disconnected ───
  client.on("disconnected", (reason: string) => {
    botConnected = false;
    (globalThis as any).whatsappBotConnected = false;
    console.warn("⚠️ [WHATSAPP BOT] Client disconnected:", reason);

    // Auto-reconnect after 10 seconds
    console.log("🔄 [WHATSAPP BOT] Will attempt reconnect in 10 seconds...");
    setTimeout(() => {
      console.log("🔄 [WHATSAPP BOT] Attempting reconnect...");
      client
        ?.initialize()
        .catch((err: Error) =>
          console.error(
            "💥 [WHATSAPP BOT] Reconnect failed:",
            err
          )
        );
    }, 10_000);
  });

  // ─── Message events (BOTH for maximum reliability) ───
  const messageHandler = (msg: any) =>
    handleIncomingMessage(msg, webhookUrl, webhookSecret);

  client.on("message", messageHandler);
  client.on("message_create", messageHandler);

  // ─── Diagnostic: log ALL events for debugging ───
  client.on("loading_screen", (percent: number, message: string) => {
    console.log(
      `⏳ [WHATSAPP BOT] Loading: ${percent}% — ${message}`
    );
  });

  client.on("change_state", (state: string) => {
    console.log(`🔀 [WHATSAPP BOT] State changed: ${state}`);
  });

  // ─── Initialize with Self-Healing Fallback ───
  console.log("🚀 [WHATSAPP BOT] Initializing Chromium client...");
  try {
    await client.initialize();
  } catch (err: any) {
    console.error(
      "💥 [WHATSAPP BOT] Failed to initialize Chromium client (corrupt session or protocol error):",
      err?.message || err
    );

    console.log("🧹 [WHATSAPP BOT] Wiping corrupted session from local disk & PostgreSQL database...");
    try {
      if (fs.existsSync(authDataPath)) {
        fs.rmSync(authDataPath, { recursive: true, force: true });
      }
      await db.delete(whatsappBotStore).catch(() => {});
    } catch (cleanupErr) {
      console.error("⚠️ [WHATSAPP BOT] Cleanup error:", cleanupErr);
    }

    console.log("🔄 [WHATSAPP BOT] Re-launching fresh Chromium client for QR pairing...");
    botInitialized = false;
    botConnected = false;
    latestQr = null;
    (globalThis as any).whatsappLatestQr = null;
    (globalThis as any).whatsappBotConnected = false;

    // Small 2-second delay before fresh start
    setTimeout(() => {
      initWhatsAppBot().catch((retryErr) => {
        console.error("💥 [WHATSAPP BOT] Fresh initialization retry failed:", retryErr);
      });
    }, 2000);
  }
}

// ─── Standalone mode: `pnpm whatsapp:bot` ───
// When run directly via tsx, auto-initialize
const isDirectRun =
  process.argv[1]?.includes("whatsapp-bot") ||
  process.argv[1]?.endsWith("whatsapp-bot.ts");

if (isDirectRun) {
  console.log("🤖 [WHATSAPP BOT] Running in standalone mode...");
  initWhatsAppBot().catch((err) => {
    console.error("💥 [WHATSAPP BOT] Standalone init failed:", err);
    process.exit(1);
  });
}
