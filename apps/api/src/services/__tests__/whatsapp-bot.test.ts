import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/env.js', () => ({
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

vi.mock('../../lib/db.js', () => ({
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should skip duplicate start if daemon already running', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Override the global property before loading the module
    (globalThis as any).whatsappBotStarted = true;

    const { startBot } = await import('../whatsapp-bot.js');

    // Explicitly call the function being tested
    await startBot(false);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "ℹ️ [WHATSAPP BOT] Bot daemon already running, skipping duplicate start."
    );
  });

  it('should skip duplicate start if already reconnecting', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (globalThis as any).whatsappBotStarted = false;

    const { startBot } = await import('../whatsapp-bot.js');

    // First call sets isReconnecting = true internally
    const pendingStart = startBot(true);

    // Tick event loop to let startBot hit the synchronous part
    await Promise.resolve();

    // Second explicit call hits the isReconnecting check
    await startBot(true);

    await pendingStart.catch(() => {});

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "ℹ️ [WHATSAPP BOT] Already reconnecting, skipping duplicate start."
    );
  });
});

describe('whatsapp-bot logoutBot crash safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (globalThis as any).whatsappSocket = null;
    (globalThis as any).whatsappBotStarted = false;
    (globalThis as any).whatsappBotConnected = false;
    (globalThis as any).whatsappLatestQr = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    (globalThis as any).whatsappSocket = null;
  });

  it('must not call sock.logout when skipRemoteLogout is true (401 path)', async () => {
    const logout = vi.fn().mockRejectedValue(
      Object.assign(new Error('Connection Closed'), {
        output: { statusCode: 428 },
      })
    );
    const end = vi.fn();
    (globalThis as any).whatsappSocket = { logout, end };

    const { db } = await import('../../lib/db.js');
    (db.execute as any).mockResolvedValue([]);

    const { logoutBot } = await import('../whatsapp-bot.js');
    // restart:false so we do not spin up a real bot during the unit test
    await logoutBot({ skipRemoteLogout: true, restart: false });

    expect(logout).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalled();
    expect(db.execute).toHaveBeenCalled();
    expect((globalThis as any).whatsappSocket).toBeNull();
  });

  it('must not crash when sock.logout rejects (closed connection)', async () => {
    const logout = vi.fn().mockRejectedValue(
      Object.assign(new Error('Connection Closed'), {
        output: { statusCode: 428 },
      })
    );
    const end = vi.fn();
    (globalThis as any).whatsappSocket = { logout, end };

    const { db } = await import('../../lib/db.js');
    (db.execute as any).mockResolvedValue([]);

    const { logoutBot } = await import('../whatsapp-bot.js');

    await expect(
      logoutBot({ skipRemoteLogout: false, restart: false })
    ).resolves.toBeUndefined();

    expect(logout).toHaveBeenCalled();
    expect(db.execute).toHaveBeenCalled();
  });
});
