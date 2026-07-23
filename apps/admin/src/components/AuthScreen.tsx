import { RefreshCw, ShieldAlert } from "lucide-react";
import React from "react";

interface AuthScreenProps {
  isInitializing: boolean;
  token: string | null;
  phone: string;
  setPhone: (val: string) => void;
  otp: string;
  setOtp: (val: string) => void;
  authError: string | null;
  authLoading: boolean;
  handleLogin: (e: React.FormEvent) => void;
  apiBaseUrl: string;
  handleApiChange: (url: string) => void;
}

export default function AuthScreen({
  isInitializing,
  token,
  phone,
  setPhone,
  otp,
  setOtp,
  authError,
  authLoading,
  handleLogin,
  apiBaseUrl,
  handleApiChange,
}: AuthScreenProps) {
  if (isInitializing) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <RefreshCw className="animate-spin" size={32} style={{ color: "var(--primary)" }} />
          <h2 className="auth-title">Command Center</h2>
          <p className="auth-subtitle" style={{ marginBottom: 0 }}>Establishing secure administrative gateway...</p>
        </div>
      </div>
    );
  }

  if (token) return null;

  return (
    <div className="auth-wrapper">
      <div className="auth-card glass-panel">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div className="brand-logo-glow" style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={24} color="white" />
          </div>
        </div>
        <h2 className="auth-title">Command Center</h2>
        <p className="auth-subtitle">Verify administrator credentials to access platform dashboard.</p>

        {authError && <div className="auth-error">{authError}</div>}

        <form onSubmit={handleLogin} style={{ marginBottom: 20 }}>
          <div className="input-group">
            <label className="input-label">Admin Phone Number</label>
            <input
              type="text"
              className="glowing-input"
              placeholder="+919999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Bypass OTP</label>
            <input
              type="text"
              className="glowing-input"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              required
            />
          </div>

          <button type="submit" className="action-btn" disabled={authLoading}>
            {authLoading ? "Decrypting Session..." : "Authorize Access"}
          </button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border-color)" }}>
          <label className="input-label" style={{ fontSize: 10, textAlign: 'center', marginBottom: 8, letterSpacing: '0.05em' }}>TARGET API GATEWAY</label>
          <div style={{ display: 'flex', gap: 6, background: "rgba(0,0,0,0.2)", padding: 4, borderRadius: 8, border: "1px solid var(--border-color)" }}>
            <button 
              type="button"
              onClick={() => handleApiChange("https://whiteroomapi-production-7011.up.railway.app/api/v1")}
              style={{
                flex: 1,
                padding: "8px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: "none",
                background: apiBaseUrl.includes("production") ? "rgba(99, 102, 241, 0.15)" : "transparent",
                color: apiBaseUrl.includes("production") ? "var(--primary)" : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              🌐 Cloud API
            </button>
            <button 
              type="button"
              onClick={() => handleApiChange("http://localhost:3000/api/v1")}
              style={{
                flex: 1,
                padding: "8px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: "none",
                background: apiBaseUrl.includes("localhost") ? "rgba(14, 165, 233, 0.15)" : "transparent",
                color: apiBaseUrl.includes("localhost") ? "var(--accent-teal)" : "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              🖥️ Local Node
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
