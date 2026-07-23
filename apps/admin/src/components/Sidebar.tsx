import { 
  Activity, 
  Database, 
  ShieldAlert, 
  Users 
} from "lucide-react";

export type TabType = "MONITOR" | "USERS" | "SECURITY";

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  return (
    <div className="sidebar glass-panel">
      <div className="brand">
        <div className="brand-logo-glow">
          <ShieldAlert size={20} color="white" />
        </div>
        <div className="brand-text">
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: '-0.03em', color: "white" }}>
            Whiteroom
          </h1>
          <div style={{ fontSize: 10, color: "var(--accent-teal)", fontWeight: 600, letterSpacing: '0.1em' }}>
            COMMAND CENTER
          </div>
        </div>
      </div>

      <nav className="nav-menu">
        <div className="nav-section-title">PLATFORM CONTROL</div>
        <div 
          className={`nav-link ${activeTab === "MONITOR" ? "active" : ""}`}
          onClick={() => setActiveTab("MONITOR")}
        >
          <Activity size={18} />
          <span>System Monitor</span>
        </div>
        <div 
          className={`nav-link ${activeTab === "USERS" ? "active" : ""}`}
          onClick={() => setActiveTab("USERS")}
        >
          <Users size={18} />
          <span>Users Directory</span>
        </div>
        <div 
          className={`nav-link ${activeTab === "SECURITY" ? "active" : ""}`}
          onClick={() => setActiveTab("SECURITY")}
        >
          <ShieldAlert size={18} style={{ color: activeTab === "SECURITY" ? "var(--error)" : undefined }} />
          <span>Security & Compliance</span>
        </div>
        <a 
          href="https://supabase.com/dashboard/project/tcjepmsvkrexzvtzuopd" 
          target="_blank" 
          rel="noreferrer" 
          className="nav-link"
        >
          <Database size={18} />
          <span>Direct Database</span>
        </a>
      </nav>
    </div>
  );
}
