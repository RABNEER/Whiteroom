import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import path from "node:path";
import fs from "node:fs";
import { config } from "dotenv";

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env") });
config({ path: path.resolve(process.cwd(), "../../.env") });

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
  const port = process.env.PORT || 3000;
  let url =
    process.env.WHATSAPP_WEBHOOK_URL ||
    `http://localhost:${port}/api/v1/auth/whatsapp/webhook`;

  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    try {
      const urlObj = new URL(url);
      urlObj.port = String(port);
      url = urlObj.toString().replace(/\/$/, "");
    } catch (err) {
      console.error("Failed to parse webhookUrl:", err);
    }
  }
  return url;
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

    const replyText =
      response.ok && data.success
        ? `✅ *Whiteroom Verification*\n\nDevice verification request for code *${code}* was successful.\n\nYou can now switch back to the Whiteroom application to complete your sign-in.`
        : `❌ *Whiteroom Verification Failed*\n\n${data.error || "The code is either expired or invalid. Please generate a new verification code from the Whiteroom app."}`;

    await msg.reply(replyText);
    console.log(`🚀 [WHATSAPP BOT] Reply successfully sent to ${rawFrom}!`);
  } catch (err) {
    console.error(
      `💥 [WHATSAPP BOT] Error processing message:`,
      err
    );
    try {
      await msg.reply(
        `⚠️ *Whiteroom Verification Error*\n\nSystem error processing your verification. Please try again.`
      );
    } catch (replyErr) {
      console.error(
        "❌ [WHATSAPP BOT] Failed to send fallback error reply:",
        replyErr
      );
    }
  }
}

import { db } from "../lib/db.js";
import { whatsappBotStore, eq } from "@whiteroom/db";

// ─── Database Auth Sync Helpers ───
async function restoreAuthFromDb(authDir: string): Promise<boolean> {
  try {
    console.log("💾 [WHATSAPP BOT DB] Checking for saved auth session in PostgreSQL database...");
    
    // Ensure table exists
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

    for (const row of rows) {
      const filePath = path.join(authDir, row.key);
      const dirName = path.dirname(filePath);
      fs.mkdirSync(dirName, { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(row.value, "base64"));
    }

    // Remove any stale lock files restored from disk that might block Chromium
    function removeLockFiles(dir: string) {
      if (!fs.existsSync(dir)) return;
      const list = fs.readdirSync(dir);
      for (const item of list) {
        const full = path.join(dir, item);
        if (fs.statSync(full).isDirectory()) {
          removeLockFiles(full);
        } else if (item === "LOCK" || item.endsWith(".lock")) {
          try { fs.unlinkSync(full); } catch {}
        }
      }
    }
    removeLockFiles(authDir);

    console.log(`✅ [WHATSAPP BOT DB] Restored ${rows.length} session files from PostgreSQL database!`);
    return true;
  } catch (err) {
    console.error("❌ [WHATSAPP BOT DB] Error restoring session from DB:", err);
    return false;
  }
}

async function saveAuthToDb(authDir: string): Promise<void> {
  try {
    if (!fs.existsSync(authDir)) return;
    console.log("💾 [WHATSAPP BOT DB] Syncing auth session files to PostgreSQL database...");

    // Ensure table exists
    await db.execute(
      `CREATE TABLE IF NOT EXISTS whatsapp_bot_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );`
    ).catch(() => {});

    function getFiles(dir: string): string[] {
      let results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);
      for (const file of list) {
        // Skip active lock files
        if (file === "LOCK" || file.endsWith(".lock") || file === "SingletonLock") continue;
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
    let count = 0;
    for (const file of files) {
      const relPath = path.relative(authDir, file).replace(/\\/g, "/");
      try {
        const content = fs.readFileSync(file).toString("base64");

        await db
          .insert(whatsappBotStore)
          .values({
            key: relPath,
            value: content,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: whatsappBotStore.key,
            set: {
              value: content,
              updatedAt: new Date(),
            },
          });
        count++;
      } catch (fileErr) {
        // Ignore temporary locked files
      }
    }
    console.log(`✅ [WHATSAPP BOT DB] Successfully saved ${count} session files to PostgreSQL database!`);
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
        "https://raw.githubusercontent.com/AliMortazavi83/test/refs/heads/main/AliMortazavi83/test/WWebJS/wwebjs-version/",
    },
    puppeteer: {
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-audio-output",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-client-side-phishing-detection",
        "--disable-component-extensions-with-background-pages",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-features=Translate,BackForwardCache,AcceptCHFrame",
        "--disable-ipc-flooding-protection",
        "--disable-notifications",
        "--disable-renderer-backgrounding",
        "--disable-sync",
        "--metrics-recording-only",
        "--no-default-browser-check",
        "--no-pings",
        "--password-store=basic",
        "--use-mock-keychain",
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

    // Delayed sync (15 seconds later) after Chromium flushes tokens to IndexedDB/LocalStorage
    setTimeout(async () => {
      console.log("⏰ [WHATSAPP BOT DB] Running post-auth delayed session sync...");
      await saveAuthToDb(authDataPath);
    }, 15_000);

    // Periodic sync & connection heartbeat every 1 minute
    setInterval(async () => {
      if (botConnected && client) {
        const state = await client.getState().catch(() => "UNKNOWN");
        console.log(`💓 [WHATSAPP BOT] Heartbeat: Connected (State: ${state}) — Active and listening for messages...`);
        await saveAuthToDb(authDataPath).catch(() => {});
      }
    }, 60 * 1000);
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
