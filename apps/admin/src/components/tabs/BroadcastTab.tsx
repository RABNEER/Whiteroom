import React, { useState, useEffect } from "react";
import { Send, Bell, Smartphone, CheckCircle, AlertCircle, RefreshCw, Layers } from "lucide-react";
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
      {/* Compose & Preview Section */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 24 }}>
        {/* Form Card */}
        <div className="glass-panel" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(56, 189, 248, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-teal)",
              }}
            >
              <Bell size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Push Custom Notifications</h2>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                Instant FCM Broadcast to mobile devices & web clients
              </div>
            </div>
          </div>

          {successMsg && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(34, 197, 94, 0.15)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: 8,
                color: "#4ade80",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <CheckCircle size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div
              style={{
                padding: "12px 16px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 8,
                color: "#f87171",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSendBroadcast} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-dim)", marginBottom: 6 }}>
                Notification Title *
              </label>
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

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-dim)", marginBottom: 6 }}>
                Message Body *
              </label>
              <textarea
                className="glowing-input"
                placeholder="e.g. Classes will remain suspended tomorrow due to heavy rainfall. Stay safe!"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={500}
                required
                style={{ resize: "vertical" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-dim)", marginBottom: 6 }}>
                  Target Role
                </label>
                <select
                  className="glowing-input"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as any)}
                >
                  <option value="all">👥 All Users (Everyone)</option>
                  <option value="parents">👨‍👩‍👧 Parents Only</option>
                  <option value="teachers">👨‍🏫 Teachers Only</option>
                  <option value="admins">🏫 School Admins Only</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-dim)", marginBottom: 6 }}>
                  Target Institution
                </label>
                <select
                  className="glowing-input"
                  value={targetTenantId}
                  onChange={(e) => setTargetTenantId(e.target.value)}
                >
                  <option value="ALL">🌐 All Schools / Tenants</option>
                  {tenantsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-dim)", marginBottom: 6 }}>
                  Deep Link Route (Optional)
                </label>
                <input
                  type="text"
                  className="glowing-input"
                  placeholder="e.g. /attendance or /chat"
                  value={deepLink}
                  onChange={(e) => setDeepLink(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text-dim)", marginBottom: 6 }}>
                  Image URL (Optional Banner)
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

            <button
              type="submit"
              disabled={sending}
              style={{
                marginTop: 8,
                padding: "12px 24px",
                background: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
                border: "none",
                borderRadius: 8,
                color: "white",
                fontSize: 14,
                fontWeight: 600,
                cursor: sending ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: sending ? 0.7 : 1,
                boxShadow: "0 4px 14px rgba(14, 165, 233, 0.4)",
              }}
            >
              <Send size={16} />
              <span>{sending ? "Delivering Notification Blast..." : "Dispatch Broadcast Push"}</span>
            </button>
          </form>
        </div>

        {/* Live Mobile Device Preview */}
        <div className="glass-panel" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Smartphone size={18} color="var(--accent-teal)" />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Mobile Lock Screen Preview</h3>
          </div>

          <div
            style={{
              flex: 1,
              background: "#090d16",
              borderRadius: 16,
              border: "1px solid rgba(255, 255, 255, 0.1)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 280,
            }}
          >
            <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 12 }}>
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>

            {/* Notification Banner */}
            <div
              style={{
                background: "rgba(30, 41, 59, 0.8)",
                backdropFilter: "blur(12px)",
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.15)",
                padding: 14,
                boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    background: "#0ea5e9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  W
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: "white" }}>WHITEROOM</span>
                <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: "auto" }}>now</span>
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, color: "white", marginBottom: 2 }}>
                {title.trim() || "Notification Title"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                {body.trim() || "Your push notification message will appear here on students' and parents' devices..."}
              </div>

              {imageUrl.trim() && (
                <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", maxHeight: 120 }}>
                  <img
                    src={imageUrl.trim()}
                    alt="Preview"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => ((e.target as HTMLElement).style.display = "none")}
                  />
                </div>
              )}
            </div>

            <div style={{ marginTop: "auto", fontSize: 11, color: "var(--text-dim)", textAlign: "center" }}>
              Target: <span style={{ color: "var(--accent-teal)" }}>{targetRole.toUpperCase()}</span> • Tenant:{" "}
              <span style={{ color: "var(--accent-teal)" }}>{targetTenantId === "ALL" ? "GLOBAL" : targetTenantId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Broadcast History */}
      <div className="glass-panel" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Layers size={18} color="var(--accent-teal)" />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Recent Dispatches</h3>
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
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-dim)", fontSize: 13 }}>
            No recent broadcast logs found.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Body Snippet</th>
                  <th>Type</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: "white" }}>{item.title}</td>
                    <td style={{ color: "var(--text-secondary)", maxWidth: 300 }}>
                      {item.body.length > 60 ? item.body.slice(0, 60) + "..." : item.body}
                    </td>
                    <td>
                      <span className="badge badge-teal">{item.type}</span>
                    </td>
                    <td style={{ color: "var(--text-dim)", fontSize: 12 }}>
                      {new Date(item.sentAt || item.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <span className="badge badge-success">Delivered</span>
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
