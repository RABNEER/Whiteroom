import { RefreshCw, Shield, Globe, Laptop, Server, AlertCircle, Send, CheckCircle } from "lucide-react";
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
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSentMsg, setOtpSentMsg] = useState<string | null>(null);

  const handleSendOtp = async () => {
    if (!phone.trim() || phone.length < 10) {
      alert("Please enter a valid 10-digit mobile number with country code (e.g. +919876543210)");
      return;
    }

    setSendingOtp(true);
    setOtpSentMsg(null);

    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;
      const res = await fetch(`${apiBaseUrl}/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formattedPhone }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to send verification OTP.");
      }

      setOtpSentMsg("✅ OTP dispatched via SMS / WhatsApp! Enter the 6-digit code below.");
    } catch (err: any) {
      alert(`OTP Error: ${err.message}`);
    } finally {
      setSendingOtp(false);
    }
  };

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

        {otpSentMsg && (
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: 8,
              color: "#34d399",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span>{otpSentMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ marginBottom: 20 }}>
          <div className="input-group">
            <label className="input-label">Admin Mobile Number</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="tel"
                className="glowing-input"
                placeholder="+919876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoFocus
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sendingOtp || !phone.trim()}
                className="refresh-btn"
                style={{
                  padding: "0 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  background: "rgba(14, 165, 233, 0.15)",
                  borderColor: "rgba(14, 165, 233, 0.3)",
                  color: "#38bdf8",
                }}
              >
                {sendingOtp ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
                <span>{sendingOtp ? "Sending..." : "Get OTP"}</span>
              </button>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">6-Digit Verification Code</label>
            <input
              type="text"
              className="glowing-input"
              placeholder="Enter 6-digit OTP code"
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
            <label className="input-label" style={{ marginBottom: 0 }}>Target Gateway Environment</label>
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
