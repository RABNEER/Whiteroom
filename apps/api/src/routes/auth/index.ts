import { Hono } from "hono";
import { otpSendHandler } from "./otp-send.js";
import { otpVerifyHandler } from "./otp-verify.js";
import { registerHandler } from "./register.js";
import { refreshHandler } from "./refresh.js";
import { logoutHandler } from "./logout.js";
import { switchTenantHandler } from "./switch-tenant.js";
import { whatsappSessionCreateHandler } from "./whatsapp-session-create.js";
import { whatsappSessionGetHandler } from "./whatsapp-session-get.js";
import { whatsappSessionPhoneHandler } from "./whatsapp-session-phone.js";
import { whatsappWebhookHandler } from "./whatsapp-webhook.js";
import { whatsappVerifyHandler } from "./whatsapp-verify.js";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getLatestQr, logoutBot, inMemoryLogs } from "../../services/whatsapp-bot.js";

const authRoutes = new Hono();

const otpSendLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 100,
  errorCode: "OTP_RATE_LIMITED",
});

const otpVerifyLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 100,
  errorCode: "VERIFY_RATE_LIMITED",
});

const registerLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 50,
  errorCode: "REGISTER_RATE_LIMITED",
});

const refreshLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 200,
  errorCode: "REFRESH_RATE_LIMITED",
});

const qrRawLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 60,
  errorCode: "QR_RAW_RATE_LIMITED",
});

const qrPageLimiter = rateLimitMiddleware({
  windowMs: 60 * 1000,
  max: 30,
  errorCode: "QR_PAGE_RATE_LIMITED",
});

const pairCodeLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000,
  max: 5,
  errorCode: "PAIR_CODE_RATE_LIMITED",
});

// Public - no auth required
authRoutes.post("/otp/send", otpSendLimiter, otpSendHandler);
authRoutes.post("/otp/verify", otpVerifyLimiter, otpVerifyHandler);
authRoutes.post("/whatsapp/session", otpSendLimiter, whatsappSessionCreateHandler);
authRoutes.get("/whatsapp/session/:id", whatsappSessionGetHandler);
authRoutes.get("/whatsapp/session/:id/phone", whatsappSessionPhoneHandler);
authRoutes.get("/whatsapp/qr/raw", qrRawLimiter, async (c) => {
  return c.json({
    qr: getLatestQr(),
    connected: !!(globalThis as any).whatsappBotConnected,
  });
});

authRoutes.post("/whatsapp/reset", authMiddleware, requireRole("super_admin"), async (c) => {
  await logoutBot();
  return c.json({ success: true, message: "WhatsApp bot credentials cleared and restarted successfully." });
});

authRoutes.get("/whatsapp/logs", authMiddleware, requireRole("super_admin"), async (c) => {
  return c.json({ logs: inMemoryLogs });
});

authRoutes.post("/whatsapp/pair-code", authMiddleware, requireRole("school_admin", "super_admin"), pairCodeLimiter, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const phone = body.phone;
  
  if (!phone) {
    return c.json({ success: false, error: "Phone number is required" }, 400);
  }
  
  const cleanPhone = phone.replace(/\D/g, "");
  if (!cleanPhone) {
    return c.json({ success: false, error: "Invalid phone number format" }, 400);
  }
  
  const sock = (globalThis as any).whatsappSocket;
  if (!sock) {
    return c.json({ success: false, error: "WhatsApp bot service is not running or starting up." }, 503);
  }
  
  if (sock.authState?.creds?.registered) {
    return c.json({ success: false, error: "WhatsApp bot is already paired and connected." }, 400);
  }
  
  try {
    const maskedPhone = cleanPhone.slice(-4).padStart(cleanPhone.length, "*");
    console.log(`🤖 [WHATSAPP BOT] Requesting pairing code for phone: ${maskedPhone}`);
    const code = await sock.requestPairingCode(cleanPhone);
    console.log(`🤖 [WHATSAPP BOT] Pairing code generated successfully (redacted)`);
    return c.json({ success: true, code });
  } catch (err: any) {
    console.error("❌ [WHATSAPP BOT] Failed to generate pairing code:", err);
    return c.json({ success: false, error: "Failed to generate pairing code" }, 500);
  }
});

authRoutes.get("/whatsapp/qr", qrPageLimiter, async (c) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Whiteroom WhatsApp Pairing</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          background-color: #f0f2f5;
        }
        .card {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 400px;
        }
        .tabs {
          display: flex;
          margin-bottom: 20px;
          border-bottom: 2px solid #eee;
          width: 100%;
        }
        .tab {
          flex: 1;
          padding: 12px;
          cursor: pointer;
          font-weight: bold;
          color: #666;
          transition: all 0.3s;
        }
        .tab.active {
          color: #128c7e;
          border-bottom: 2px solid #128c7e;
        }
        .tab-content {
          display: none;
          flex-direction: column;
          align-items: center;
          width: 100%;
        }
        .tab-content.active {
          display: flex;
        }
        input {
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 6px;
          margin-bottom: 12px;
          width: 250px;
          font-size: 16px;
          text-align: center;
        }
        button {
          background-color: #128c7e;
          color: white;
          border: none;
          padding: 10px 20px;
          font-size: 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          transition: background 0.3s;
        }
        button:hover {
          background-color: #0b665c;
        }
        .pairing-code-display {
          font-size: 32px;
          font-weight: bold;
          color: #128c7e;
          letter-spacing: 4px;
          background: #e8f5e9;
          padding: 15px 30px;
          border-radius: 8px;
          margin: 20px 0;
          border: 2px dashed #128c7e;
        }
        img {
          margin: 20px 0;
          border: 1px solid #ddd;
          padding: 10px;
          background: white;
          display: none;
        }
        h1 { color: #128c7e; margin-top: 0; }
        p { color: #666; font-size: 14px; line-height: 1.5; margin-bottom: 20px; }
        .loading {
          width: 50px;
          height: 50px;
          border: 5px solid #f3f3f3;
          border-top: 5px solid #128c7e;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 20px 0;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Pair WhatsApp Bot</h1>
        
        <div id="setup-container">
          <div class="tabs">
            <div id="tab-qr" class="tab active" onclick="switchTab('qr')">QR Code</div>
            <div id="tab-phone" class="tab" onclick="switchTab('phone')">Phone Link</div>
          </div>

          <div id="content-qr" class="tab-content active">
            <p>Scan this QR code with WhatsApp Linked Devices to pair the verification bot.</p>
            <div id="loader" class="loading"></div>
            <img id="qr-image" width="300" height="300" alt="WhatsApp QR Code" />
          </div>

          <div id="content-phone" class="tab-content">
            <p>Enter your phone number with country code (e.g. 919876543210 for India) to generate a pairing code.</p>
            <input type="text" id="phone-input" placeholder="e.g. 919876543210" />
            <button id="code-btn" onclick="requestPairingCode()">Generate Code</button>
            <div id="code-display-container" style="display: none; width: 100%; display: flex; flex-direction: column; align-items: center;">
              <p style="margin-top: 15px;">Enter this code on your phone when prompted:</p>
              <div id="pairing-code" class="pairing-code-display"></div>
            </div>
          </div>
        </div>

        <div id="status" style="margin-top: 20px; font-weight: bold; color: #555;">Waiting for QR code generation...</div>
      </div>
      <script>
        let currentQr = null;
        const img = document.getElementById('qr-image');
        const loader = document.getElementById('loader');
        const statusDiv = document.getElementById('status');
        const setupContainer = document.getElementById('setup-container');

        function switchTab(tab) {
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          
          document.getElementById('tab-' + tab).classList.add('active');
          document.getElementById('content-' + tab).classList.add('active');
        }

        async function requestPairingCode() {
          const phoneInput = document.getElementById('phone-input');
          const btn = document.getElementById('code-btn');
          const displayContainer = document.getElementById('code-display-container');
          const codeDiv = document.getElementById('pairing-code');
          
          const phone = phoneInput.value.trim();
          if (!phone) {
            alert('Please enter your phone number.');
            return;
          }
          
          btn.disabled = true;
          btn.innerText = 'Generating...';
          statusDiv.innerText = 'Requesting pairing code...';
          
          try {
            const res = await fetch('/api/v1/auth/whatsapp/pair-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone })
            });
            const data = await res.json();
            
            if (data.success && data.code) {
              codeDiv.innerText = data.code;
              displayContainer.style.display = 'flex';
              statusDiv.innerText = 'Code generated successfully! Enter it on WhatsApp.';
            } else {
              alert(data.error || 'Failed to generate pairing code.');
              statusDiv.innerText = 'Failed to generate code.';
            }
          } catch (err) {
            console.error(err);
            alert('Error generating pairing code.');
            statusDiv.innerText = 'Network error.';
          } finally {
            btn.disabled = false;
            btn.innerText = 'Generate Code';
          }
        }

        function renderQr(qrData) {
          if (qrData === currentQr) return;
          currentQr = qrData;
          loader.style.display = 'none';
          img.style.display = 'block';
          img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(qrData);
          statusDiv.innerText = 'Ready to scan! (Auto-updates in real-time)';
        }

        async function pollQr() {
          try {
            const res = await fetch('/api/v1/auth/whatsapp/qr/raw');
            const data = await res.json();
            if (data.connected) {
              currentQr = null;
              setupContainer.style.display = 'none';
              statusDiv.innerHTML = '<span style="color: #128c7e; font-size: 24px; font-weight: bold;">✅ Connected!</span><br/><br/>The WhatsApp bot is paired and ready.';
            } else if (data.qr) {
              renderQr(data.qr);
            } else {
              currentQr = null;
              img.style.display = 'none';
              loader.style.display = 'block';
              statusDiv.innerText = 'No QR code available. Already connected or starting up...';
            }
          } catch (err) {
            console.error('Error polling QR:', err);
          }
        }

        window.onload = function() {
          pollQr();
          // Poll every 2 seconds for updates
          setInterval(pollQr, 2000);
        };
      </script>
    </body>
    </html>
  `;
  return c.html(html);
});
authRoutes.post("/whatsapp/webhook", whatsappWebhookHandler);
authRoutes.post("/whatsapp/verify", registerLimiter, whatsappVerifyHandler);
authRoutes.post("/register", registerLimiter, registerHandler);
authRoutes.post("/refresh", refreshLimiter, refreshHandler);

// Protected - requires valid access token
authRoutes.post("/logout", authMiddleware, logoutHandler);
authRoutes.post("/switch-tenant", authMiddleware, switchTenantHandler);

export { authRoutes };
