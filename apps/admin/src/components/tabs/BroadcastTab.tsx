import React, { useState, useEffect } from "react";
import { 
  Send, 
  Bell, 
  Smartphone, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Layers, 
  Sparkles,
  Zap,
  Image as ImageIcon,
  Link as LinkIcon,
  Users as UsersIcon,
  School
} from "lucide-react";
import { Tenant } from "../../types";

interface BroadcastTabProps {
  apiBaseUrl: string;
  token: string | null;
  tenantsList: Tenant[];
}

interface BroadcastHistoryItem {
  id: string;
  title: string;
  body: string;
  type: string;
  sentAt: string | null;
  createdAt: string;
  tenantId: string;
}

const NOTIFICATION_PRESETS = [
  {
    name: "📢 General Notice",
    title: "📢 Important Announcement",
    body: "Please check the notice board for latest updates regarding upcoming school activities.",
    deepLink: "/bulletins",
  },
  {
    name: "🚨 School Closure",
    title: "🚨 Urgent: School Closed Tomorrow",
    body: "Classes will remain suspended tomorrow due to heavy rainfall and weather advisory. Stay safe!",
    deepLink: "/bulletins",
  },
  {
    name: "📝 Exam Schedule",
    title: "📝 Term Examinations Schedule Released",
    body: "The upcoming term examination datesheet and syllabus guidelines are now published in the app.",
    deepLink: "/bulletins",
  },
  {
    name: "⏰ Attendance Alert",
    title: "⏰ Daily Attendance Reminder",
    body: "Classroom attendance marking is now open. Please record morning student attendance.",
    deepLink: "/attendance",
  },
];

export default function BroadcastTab({
  apiBaseUrl,
  token,
  tenantsList,
}: BroadcastTabProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetRole, setTargetRole] = useState<"all" | "parents" | "teachers" | "admins">("all");
  const [targetTenantId, setTargetTenantId] = useState<string>("ALL");
  const [deepLink, setDeepLink] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [previewPlatform, setPreviewPlatform] = useState<"android" | "ios">("android");

  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    if (!token) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/broadcast-notification/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setHistory(data.data);
      }
    } catch {
      // Ignored
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [apiBaseUrl, token]);

  const applyPreset = (preset: typeof NOTIFICATION_PRESETS[0]) => {
    setTitle(preset.title);
    setBody(preset.body);
    setDeepLink(preset.deepLink);
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setErrorMsg("Please enter both a title and message body.");
      return;
    }

    setSending(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload: any = {
        title: title.trim(),
        body: body.trim(),
        targetRole,
      };

      if (targetTenantId !== "ALL") {
        payload.targetTenantId = targetTenantId;
      }
      if (deepLink.trim()) {
        payload.deepLink = deepLink.trim();
      }
      if (imageUrl.trim()) {
        payload.imageUrl = imageUrl.trim();
      }

      const res = await fetch(`${apiBaseUrl}/admin/broadcast-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error?.message || "Failed to deliver broadcast notification.");
      }

      setSuccessMsg(`🚀 Broadcast delivered successfully to ${result.data?.deliveredCount ?? 0} devices!`);
      setTitle("");
      setBody("");
      setDeepLink("");
      setImageUrl("");
      fetchHistory();
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Top Quick Presets */}
      <div className="glass-panel" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Sparkles size={16} color="var(--primary)" />
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
            Quick Template Presets
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {NOTIFICATION_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              style={{
                padding: "8px 14px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-primary)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--primary)";
                e.currentTarget.style.background = "rgba(14, 165, 233, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
              }}
            >
              <Zap size={12} color="#38bdf8" />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Composer & Live Device Preview */}
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 0.75fr", gap: 24, alignItems: "start" }}>
        {/* Composer Form Card */}
        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.2))",
                border: "1px solid rgba(14, 165, 233, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#38bdf8",
              }}
            >
              <Bell size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "white" }}>Push Broadcast Studio</h2>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Instant Firebase Cloud Messaging (FCM) dispatch to iOS & Android devices
              </div>
            </div>
          </div>

          {successMsg && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: 10,
                color: "#34d399",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 18,
              }}
            >
              <CheckCircle size={18} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 10,
                color: "#f87171",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 18,
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSendBroadcast} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Title */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <label className="input-label" style={{ marginBottom: 0 }}>Notification Title *</label>
                <span style={{ fontSize: 11, color: title.length > 90 ? "#f87171" : "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {title.length}/100
                </span>
              </div>
              <input
                type="text"
                className="glowing-input"
                placeholder="e.g. 📢 Important School Update"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
              />
            </div>

            {/* Message Body */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <label className="input-label" style={{ marginBottom: 0 }}>Message Body *</label>
                <span style={{ fontSize: 11, color: body.length > 450 ? "#f87171" : "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {body.length}/500
                </span>
              </div>
              <textarea
                className="glowing-input"
                placeholder="Type your push notification message..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={500}
                required
                style={{ resize: "vertical", minHeight: 80 }}
              />
            </div>

            {/* Target Audience & Target Institution */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label className="input-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <UsersIcon size={12} /> Target Audience
                </label>
                <select
                  className="glowing-input"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as any)}
                  style={{ cursor: "pointer" }}
                >
                  <option value="all">👥 All Accounts (Everyone)</option>
                  <option value="parents">👨‍👩‍👧 Parents Only</option>
                  <option value="teachers">👨‍🏫 Teachers Only</option>
                  <option value="admins">🏫 School Admins Only</option>
                </select>
              </div>

              <div>
                <label className="input-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <School size={12} /> Target Institution
                </label>
                <select
                  className="glowing-input"
                  value={targetTenantId}
                  onChange={(e) => setTargetTenantId(e.target.value)}
                  style={{ cursor: "pointer" }}
                >
                  <option value="ALL">🌐 All Schools (Platform-Wide)</option>
                  {tenantsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Deep Link & Image URL */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label className="input-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <LinkIcon size={12} /> In-App Deep Link
                </label>
                <input
                  type="text"
                  className="glowing-input"
                  placeholder="e.g. /bulletins or /attendance"
                  value={deepLink}
                  onChange={(e) => setDeepLink(e.target.value)}
                />
              </div>

              <div>
                <label className="input-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ImageIcon size={12} /> Image Banner URL
                </label>
                <input
                  type="url"
                  className="glowing-input"
                  placeholder="https://.../banner.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>
            </div>

            {/* Dispatch Button */}
            <button
              type="submit"
              disabled={sending}
              className="action-btn"
              style={{
                marginTop: 8,
                padding: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                fontSize: 14,
              }}
            >
              <Send size={18} />
              <span>{sending ? "Dispersing Push Broadcast..." : "Dispatch Broadcast Push"}</span>
            </button>
          </form>
        </div>

        {/* Live Mobile Device Frame Mockup */}
        <div className="glass-panel" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Smartphone size={18} color="var(--accent-teal)" />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "white" }}>Device Live Mockup</h3>
            </div>

            <div style={{ display: "flex", background: "rgba(0,0,0,0.3)", padding: 2, borderRadius: 6, border: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() => setPreviewPlatform("android")}
                style={{
                  padding: "4px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: "none",
                  background: previewPlatform === "android" ? "rgba(14, 165, 233, 0.2)" : "transparent",
                  color: previewPlatform === "android" ? "#38bdf8" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                Android
              </button>
              <button
                type="button"
                onClick={() => setPreviewPlatform("ios")}
                style={{
                  padding: "4px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: "none",
                  background: previewPlatform === "ios" ? "rgba(99, 102, 241, 0.2)" : "transparent",
                  color: previewPlatform === "ios" ? "#818cf8" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                iOS
              </button>
            </div>
          </div>

          {/* Smartphone Frame */}
          <div
            style={{
              background: "#080c14",
              borderRadius: previewPlatform === "ios" ? 28 : 18,
              border: "2px solid rgba(255, 255, 255, 0.15)",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(255,255,255,0.05)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 340,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Notch / Dynamic Island */}
            {previewPlatform === "ios" ? (
              <div
                style={{
                  width: 80,
                  height: 18,
                  background: "#000",
                  borderRadius: 20,
                  margin: "0 auto 8px auto",
                }}
              />
            ) : (
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#111",
                  border: "1px solid #333",
                  margin: "0 auto 8px auto",
                }}
              />
            )}

            {/* Lock Screen Clock */}
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "white", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </div>
            </div>

            {/* Simulated Push Card */}
            <div
              style={{
                marginTop: 8,
                background: "rgba(22, 30, 49, 0.85)",
                backdropFilter: "blur(16px)",
                borderRadius: 14,
                border: "1px solid rgba(255, 255, 255, 0.12)",
                padding: 14,
                boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: 10,
                    fontWeight: 800,
                  }}
                >
                  W
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "white", letterSpacing: "0.02em" }}>WHITEROOM</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: "auto" }}>now</span>
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 3 }}>
                {title.trim() || "Notification Title"}
              </div>

              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>
                {body.trim() || "Your push notification message text will appear here on recipients' phones..."}
              </div>

              {imageUrl.trim() && (
                <div style={{ marginTop: 10, borderRadius: 8, overflow: "hidden", maxHeight: 110 }}>
                  <img
                    src={imageUrl.trim()}
                    alt="Preview banner"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => ((e.target as HTMLElement).style.display = "none")}
                  />
                </div>
              )}
            </div>

            {/* Target Footer */}
            <div style={{ marginTop: "auto", paddingTop: 10, textAlign: "center", fontSize: 10, color: "var(--text-dim)" }}>
              Audience: <span style={{ color: "#38bdf8", fontWeight: 600 }}>{targetRole.toUpperCase()}</span> • Tenant:{" "}
              <span style={{ color: "#818cf8", fontWeight: 600 }}>{targetTenantId === "ALL" ? "GLOBAL" : targetTenantId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Broadcast History Log */}
      <div className="glass-panel" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Layers size={18} color="var(--accent-teal)" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "white" }}>Past Broadcast Dispatches</h3>
          </div>
          <button
            onClick={fetchHistory}
            className="refresh-btn"
            disabled={loadingHistory}
            style={{ padding: "6px 12px", fontSize: 12 }}
          >
            <RefreshCw size={14} className={loadingHistory ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>

        {history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>
            No recent broadcast logs found.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Headline</th>
                  <th>Message Snippet</th>
                  <th>Target Type</th>
                  <th>Dispatched At</th>
                  <th>Delivery Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: "white" }}>{item.title}</td>
                    <td style={{ color: "var(--text-secondary)", maxWidth: 320 }}>
                      {item.body.length > 70 ? item.body.slice(0, 70) + "..." : item.body}
                    </td>
                    <td>
                      <span className="badge badge-teal">{item.type}</span>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {new Date(item.sentAt || item.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      <span className="badge badge-success">DELIVERED</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
