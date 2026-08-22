import { RefreshCw, Shield, Globe, Laptop, Server, AlertCircle } from "lucide-react";
import React, { useState } from "react";

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
  const [customUrl, setCustomUrl] = useState("");
  const [showCustomUrl, setShowCustomUrl] = useState(false);

  if (isInitializing) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card glass-panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <RefreshCw className="spin" size={32} color="var(--primary)" />
          <h2 className="auth-title">Whiteroom Command Center</h2>
          <p className="auth-subtitle" style={{ marginBottom: 0 }}>Initializing administrative connection...</p>
        </div>
      </div>
    );
  }

  if (token) return null;

  return (
    <div className="auth-wrapper">
      <div className="auth-card glass-panel">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div className="brand-logo-glow" style={{ width: 52, height: 52, borderRadius: 14 }}>
            <Shield size={28} color="white" />
          </div>
        </div>

        <h2 className="auth-title">Command Center</h2>
        <p className="auth-subtitle">Secure gateway for institution management & marketing broadcasts.</p>

        {authError && (
          <div className="auth-error">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ marginBottom: 20 }}>
          <div className="input-group">
            <label className="input-label">Admin Mobile Number</label>
            <input
              type="tel"
              className="glowing-input"
              placeholder="+919999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="input-group">
            <label className="input-label">WhatsApp OTP / Bypass Code</label>
            <input
              type="text"
              className="glowing-input"
              placeholder="Enter 6-digit code (or 000000 in dev)"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              required
            />
          </div>

          <button type="submit" className="action-btn" disabled={authLoading}>
            {authLoading ? "Authenticating Session..." : "Authorize Dashboard Access"}
          </button>
        </form>

        {/* Server Target Selector */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <label className="input-label" style={{ marginBottom: 0 }}>Target Gateway</label>
            <button
              type="button"
              onClick={() => setShowCustomUrl(!showCustomUrl)}
              style={{ background: "none", border: "none", color: "var(--primary)", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
            >
              {showCustomUrl ? "Hide Custom" : "Custom URL"}
            </button>
          </div>

          {!showCustomUrl ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              <button
                type="button"
                onClick={() => handleApiChange("https://apps.whiteroom.co.in/api/v1")}
                style={{
                  padding: "8px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid " + (apiBaseUrl.includes("whiteroom.co.in") ? "rgba(14, 165, 233, 0.4)" : "var(--border)"),
                  background: apiBaseUrl.includes("whiteroom.co.in") ? "rgba(14, 165, 233, 0.15)" : "rgba(255,255,255,0.02)",
                  color: apiBaseUrl.includes("whiteroom.co.in") ? "#38bdf8" : "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Globe size={14} />
                <span>Production</span>
              </button>

              <button
                type="button"
                onClick={() => handleApiChange("http://66.42.90.144:3000/api/v1")}
                style={{
                  padding: "8px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid " + (apiBaseUrl.includes("66.42.90.144") ? "rgba(99, 102, 241, 0.4)" : "var(--border)"),
                  background: apiBaseUrl.includes("66.42.90.144") ? "rgba(99, 102, 241, 0.15)" : "rgba(255,255,255,0.02)",
                  color: apiBaseUrl.includes("66.42.90.144") ? "#818cf8" : "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Server size={14} />
                <span>Direct VPS</span>
              </button>

              <button
                type="button"
                onClick={() => handleApiChange("http://localhost:3000/api/v1")}
                style={{
                  padding: "8px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid " + (apiBaseUrl.includes("localhost") ? "rgba(16, 185, 129, 0.4)" : "var(--border)"),
                  background: apiBaseUrl.includes("localhost") ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.02)",
                  color: apiBaseUrl.includes("localhost") ? "#34d399" : "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Laptop size={14} />
                <span>Localhost</span>
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                className="glowing-input"
                placeholder="http://..."
                value={customUrl || apiBaseUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                style={{ fontSize: 12, padding: "8px 12px" }}
              />
              <button
                type="button"
                onClick={() => {
                  if (customUrl) handleApiChange(customUrl);
                }}
                className="refresh-btn"
              >
                Set
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
