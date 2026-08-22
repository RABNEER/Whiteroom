import { LogOut, RefreshCw, Globe, Server, Laptop, AlertTriangle } from "lucide-react";

interface TopNavbarProps {
  apiBaseUrl: string;
  handleApiChange: (url: string) => void;
  lastSynced: string | null;
  syncingPulse: boolean;
  fetchError: string | null;
  handleLogout: () => void;
  onRefresh?: () => void;
}

export default function TopNavbar({
  apiBaseUrl,
  handleApiChange,
  lastSynced,
  syncingPulse,
  fetchError,
  handleLogout,
  onRefresh,
}: TopNavbarProps) {
  return (
    <header className="topbar">
      {/* Live System Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
        {fetchError ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#f87171" }}>
            <AlertTriangle size={18} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "white" }}>Connection Interrupted</div>
              <div style={{ fontSize: 11, color: "#f87171" }}>{fetchError}</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className={`status-indicator online ${syncingPulse ? "pulse" : ""}`} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "white", display: "flex", alignItems: "center", gap: 6 }}>
                <span>System Nominal</span>
                <span className="badge badge-success" style={{ fontSize: 9, padding: "2px 6px" }}>LIVE</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                Live Stream • Synced {lastSynced || "Just now"}
              </div>
            </div>
          </div>
        )}

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="icon-btn"
            title="Force Data Sync"
            style={{ marginLeft: 8 }}
          >
            <RefreshCw size={14} className={syncingPulse ? "spin" : ""} />
          </button>
        )}
      </div>

      {/* Gateway Environment Switcher */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 16 }}>
        <div style={{ display: "flex", background: "rgba(0,0,0,0.3)", padding: 3, borderRadius: 10, border: "1px solid var(--border)" }}>
          <button
            onClick={() => handleApiChange("https://apps.whiteroom.co.in/api/v1")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: apiBaseUrl.includes("whiteroom.co.in") ? "rgba(14, 165, 233, 0.2)" : "transparent",
              color: apiBaseUrl.includes("whiteroom.co.in") ? "#38bdf8" : "var(--text-muted)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <Globe size={12} />
            <span>Cloud</span>
          </button>

          <button
            onClick={() => handleApiChange("http://66.42.90.144:3000/api/v1")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: apiBaseUrl.includes("66.42.90.144") ? "rgba(99, 102, 241, 0.2)" : "transparent",
              color: apiBaseUrl.includes("66.42.90.144") ? "#818cf8" : "var(--text-muted)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <Server size={12} />
            <span>VPS</span>
          </button>

          <button
            onClick={() => handleApiChange("http://localhost:3000/api/v1")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              background: apiBaseUrl.includes("localhost") ? "rgba(16, 185, 129, 0.2)" : "transparent",
              color: apiBaseUrl.includes("localhost") ? "#34d399" : "var(--text-muted)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <Laptop size={12} />
            <span>Local</span>
          </button>
        </div>
      </div>

      {/* User Badge & Logout */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="user-profile">
          <div className="avatar">WR</div>
          <div className="user-details">
            <p className="user-name">Administrator</p>
            <p className="user-role">Management Console</p>
          </div>
        </div>

        <button className="icon-btn" onClick={handleLogout} title="Sign Out">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
