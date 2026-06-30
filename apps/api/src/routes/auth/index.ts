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
import { authMiddleware } from "../../middleware/auth.js";
import { rateLimitMiddleware } from "../../middleware/rate-limit.js";
import { getLatestQr } from "../../services/whatsapp-bot.js";

const authRoutes = new Hono();

const otpSendLimiter = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 requests per 15 mins
});

// Public - no auth required
authRoutes.post("/otp/send", otpSendLimiter, otpSendHandler);
authRoutes.post("/otp/verify", otpVerifyHandler);
authRoutes.post("/whatsapp/session", otpSendLimiter, whatsappSessionCreateHandler);
authRoutes.get("/whatsapp/session/:id", whatsappSessionGetHandler);
authRoutes.get("/whatsapp/session/:id/phone", whatsappSessionPhoneHandler);
authRoutes.get("/whatsapp/qr/raw", async (c) => {
  return c.json({ qr: getLatestQr() });
});

authRoutes.get("/whatsapp/qr", async (c) => {
  const qr = getLatestQr();
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Whiteroom WhatsApp Pairing</title>
      <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
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
        }
        canvas {
          margin: 20px 0;
          border: 1px solid #ddd;
          padding: 10px;
          background: white;
          display: none;
        }
        h1 { color: #128c7e; margin-top: 0; }
        p { color: #666; max-width: 300px; line-height: 1.5; }
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
        <p>Scan this QR code with WhatsApp Linked Devices to pair the verification bot.</p>
        <div id="loader" class="loading"></div>
        <canvas id="qr-canvas"></canvas>
        <div id="status">Waiting for QR code generation...</div>
      </div>
      <script>
        let currentQr = null;
        let pendingQr = null;
        const canvas = document.getElementById('qr-canvas');
        const loader = document.getElementById('loader');
        const statusDiv = document.getElementById('status');

        function renderQr(qrData) {
          if (qrData === currentQr) return;
          if (typeof QRCode === 'undefined') {
            console.log('QRCode library not loaded yet, queueing...');
            pendingQr = qrData;
            return;
          }
          currentQr = qrData;
          loader.style.display = 'none';
          canvas.style.display = 'block';
          
          QRCode.toCanvas(canvas, qrData, { width: 300 }, function (error) {
            if (error) {
              console.error(error);
              statusDiv.innerText = 'Failed to render QR code';
            } else {
              statusDiv.innerText = 'Ready to scan! (Auto-updates in real-time)';
            }
          });
        }

        async function pollQr() {
          try {
            const res = await fetch('/api/v1/auth/whatsapp/qr/raw');
            const data = await res.json();
            if (data.qr) {
              renderQr(data.qr);
            } else {
              currentQr = null;
              canvas.style.display = 'none';
              loader.style.display = 'block';
              statusDiv.innerText = 'No QR code available. Already connected or starting up...';
            }
          } catch (err) {
            console.error('Error polling QR:', err);
          }
        }

        window.onload = function() {
          console.log('Library loaded and window ready.');
          const initialQr = ${JSON.stringify(qr)};
          if (initialQr) {
            renderQr(initialQr);
          } else if (pendingQr) {
            renderQr(pendingQr);
          }
          
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
authRoutes.post("/whatsapp/verify", whatsappVerifyHandler);
authRoutes.post("/register", registerHandler);
authRoutes.post("/refresh", refreshHandler);

// Protected - requires valid access token
authRoutes.post("/logout", authMiddleware, logoutHandler);
authRoutes.post("/switch-tenant", authMiddleware, switchTenantHandler);

export { authRoutes };
