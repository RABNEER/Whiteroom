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
authRoutes.get("/whatsapp/qr", async (c) => {
  const qr = getLatestQr();
  if (!qr) {
    return c.text("No QR code available. The bot might already be connected, logged out, or starting.");
  }
  
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
        }
        canvas {
          margin: 20px 0;
          border: 1px solid #ddd;
          padding: 10px;
          background: white;
        }
        h1 { color: #128c7e; margin-top: 0; }
        p { color: #666; max-width: 300px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Pair WhatsApp Bot</h1>
        <p>Scan this QR code with WhatsApp Linked Devices to pair the verification bot.</p>
        <canvas id="qr-canvas"></canvas>
        <div id="status">Generating...</div>
      </div>
      <script>
        const qrData = ${JSON.stringify(qr)};
        QRCode.toCanvas(document.getElementById('qr-canvas'), qrData, { width: 300 }, function (error) {
          if (error) {
            console.error(error);
            document.getElementById('status').innerText = 'Failed to generate QR code';
          } else {
            document.getElementById('status').innerText = 'Ready to scan!';
          }
        });
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
