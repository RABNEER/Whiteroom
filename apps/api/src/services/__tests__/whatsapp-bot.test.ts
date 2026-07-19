import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/env.js', () => ({
  env: {
    DATABASE_URL: 'postgres://localhost/test',
    JWT_ACCESS_SECRET: 'test-secret-12345678901234567890',
    JWT_REFRESH_SECRET: 'test-secret-12345678901234567890',
    DM_ENCRYPTION_SECRET: 'test-secret-12345678901234567890'
  }
}));

// Provide proper mocks to avoid runtime errors when the real startBot executes
vi.mock('@whiskeysockets/baileys', () => ({
  default: vi.fn().mockReturnValue({
    ev: { on: vi.fn() },
    logout: vi.fn(),
    end: vi.fn()
  }),
  useMultiFileAuthState: vi.fn().mockResolvedValue({ state: {}, saveCreds: vi.fn() }),
  DisconnectReason: {},
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 1015978430] })
}));

vi.mock('qrcode-terminal', () => ({
  default: { generate: vi.fn() }
}));

vi.mock('../lib/db.js', () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis()
  }
}));

vi.mock('drizzle-orm', () => ({ sql: vi.fn(), eq: vi.fn() }));
vi.mock('../lib/otp.js', () => ({ normalizePhone: vi.fn(), hashSHA256: vi.fn() }));
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
    rm: vi.fn(),
    readFile: vi.fn()
  }
}));

vi.mock('../whatsapp-bot.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    setupFolderWatcher: vi.fn()
  };
});

describe('whatsapp-bot startBot duplication checks', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should skip duplicate start if daemon already running', async () => {
    // Override the global property before loading the module
    (globalThis as any).whatsappBotStarted = true;

    const { startBot } = await import('../whatsapp-bot.js');

    // Explicitly call the function being tested
    await startBot(false);

    expect(console.log).toHaveBeenCalledWith(
      "ℹ️ [WHATSAPP BOT] Bot daemon already running, skipping duplicate start."
    );
  });

  it('should skip duplicate start if already reconnecting', async () => {
    (globalThis as any).whatsappBotStarted = false;

    const { startBot } = await import('../whatsapp-bot.js');

    // First call sets isReconnecting = true internally
    const pendingStart = startBot(true);

    // Tick event loop to let startBot hit the synchronous part
    await Promise.resolve();

    // Second explicit call hits the isReconnecting check
    await startBot(true);

    expect(console.log).toHaveBeenCalledWith(
      "ℹ️ [WHATSAPP BOT] Already reconnecting, skipping duplicate start."
    );
  });
});
