
import { LogOut } from "lucide-react";

interface TopNavbarProps {
  apiBaseUrl: string;
  handleApiChange: (url: string) => void;
  lastSynced: string | null;
  syncingPulse: boolean;
  fetchError: string | null;
  handleLogout: () => void;
}

export default function TopNavbar({
  apiBaseUrl,
  handleApiChange,
  lastSynced,
  syncingPulse,
  fetchError,
  handleLogout,
}: TopNavbarProps) {
  return (
    <header className="topbar">
      {fetchError && (
        <div className="status-banner error" style={{ flex: 1, marginRight: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="status-indicator offline"></div>
            <div>
              <p style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>System Offline</p>
              <p style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>{fetchError}</p>
            </div>
          </div>
        </div>
      )}

      {!fetchError && (
        <div className="status-banner active" style={{ flex: 1, marginRight: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={`status-indicator online ${syncingPulse ? 'pulse' : ''}`}></div>
            <div>
              <p style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>System Nominal</p>
              <p style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                Live sync active • Last updated: {lastSynced || "Syncing..."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Gateway Environment Selector */}
      <div style={{ marginRight: 20, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: 'flex', gap: 4, background: "rgba(0,0,0,0.25)", padding: 4, borderRadius: 8, border: "1px solid var(--border-color)" }}>
          <button 
            onClick={() => handleApiChange("https://whiteroomapi-production-7011.up.railway.app/api/v1")}
            style={{
              padding: "6px 12px",
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
            Cloud Gateway
          </button>
          <button 
            onClick={() => handleApiChange("http://localhost:3000/api/v1")}
            style={{
              padding: "6px 12px",
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
            Local Gateway
          </button>
        </div>
      </div>

      <div className="user-profile">
        <div className="avatar">SA</div>
        <div className="user-details">
          <p className="user-name">Super Admin</p>
          <p className="user-role">Full Access</p>
        </div>
      </div>

      <button className="icon-btn" onClick={handleLogout} title="Terminate Session" style={{ marginLeft: 16 }}>
        <LogOut size={18} />
      </button>
    </header>
  );
}
