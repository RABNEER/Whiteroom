import { useEffect, useState, useRef } from "react";
import { 
  ShieldAlert, 
  Users, 
  School, 
  Crown, 
  Activity, 
  LogOut, 
  Search, 
  Database,
  Building,
  RefreshCw,
  Clock,
  Compass,
  AlertTriangle,
  Download,
  X,
  ShieldCheck
} from "lucide-react";

interface PlatformMetrics {
  totalUsers: number;
  activeTenants: number;
  proTenants: number;
  dailyActiveUsers: number;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  plan: string | null;
  subscriptionEndDate: string | null;
}

interface User {
  id: string;
  phone: string;
  name: string | null;
  role: string;
  createdAt: string;
  tenantName: string | null;
}

interface SecurityAuditLog {
  id: string;
  tenantId: string | null;
  userId: string | null;
  eventType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ipAddress: string | null;
  metadata: any;
  createdAt: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("admin_token"));
  const [isInitializing, setIsInitializing] = useState(true);
  const [phone, setPhone] = useState("+919999999999");
  const [otp, setOtp] = useState("000000");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // API base URL configuration (Production Cloud or Local Dev)
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(
    localStorage.getItem("admin_api_url") || "https://apps.whiteroom.co.in/api/v1"
  );

  const handleApiChange = (url: string) => {
    localStorage.setItem("admin_api_url", url);
    setApiBaseUrl(url);
    // Clear credentials to re-authenticate on the new gateway environment!
    localStorage.removeItem("admin_token");
    setToken(null);
    setMetrics(null);
    setTenantsList([]);
    setUsersList([]);
  };

  // Tab control state
  const [activeTab, setActiveTab] = useState<"MONITOR" | "USERS" | "SECURITY">("MONITOR");

  // Dashboard Data State
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [tenantsList, setTenantsList] = useState<Tenant[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncingPulse, setSyncingPulse] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Security & Compliance State
  const [securityLogs, setSecurityLogs] = useState<SecurityAuditLog[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [showBreachModal, setShowBreachModal] = useState(false);
  const [breachSummary, setBreachSummary] = useState("");
  const [breachRemedial, setBreachRemedial] = useState("");
  const [breachTargetTenant, setBreachTargetTenant] = useState("ALL");
  const [breachSending, setBreachSending] = useState(false);
  const [breachSuccessMsg, setBreachSuccessMsg] = useState<string | null>(null);
  const [exportingReport, setExportingReport] = useState(false);

  // Poll controller
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Auto-Login Bypass Hook ───
  useEffect(() => {
    const attemptAutoLogin = async () => {
      if (token) {
        setIsInitializing(false);
        return;
      }

      setIsInitializing(true);
      try {
        const response = await fetch(`${apiBaseUrl}/auth/otp/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: "+919999999999", otp: "000000" }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          const accessToken = result.data.accessToken;
          localStorage.setItem("admin_token", accessToken);
          setToken(accessToken);
        } else {
          console.warn("Auto bypass login verification unsuccessful, credentials required.");
        }
      } catch (err) {
        console.error("Auto bypass login failed, falling back to manual credentials entry:", err);
      } finally {
        setIsInitializing(false);
      }
    };

    attemptAutoLogin();
  }, [token, apiBaseUrl]);


  // ─── Login Logic ───
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Invalid credentials or unauthorized.");
      }

      const verifiedUser = result.data.user;
      if (verifiedUser.role !== "super_admin") {
        throw new Error("Access Denied: Account does not have administrative privileges.");
      }

      const accessToken = result.data.accessToken;
      localStorage.setItem("admin_token", accessToken);
      setToken(accessToken);
    } catch (err: any) {
      setAuthError(err.message || "Failed to authenticate.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setToken(null);
    setMetrics(null);
    setTenantsList([]);
    setUsersList([]);
    setFetchError(null);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  };

  const fetchSecurityLogs = async (severity = severityFilter) => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${apiBaseUrl}/admin/security/logs?limit=100&severity=${severity}`, { headers });
      if (res.ok) {
        const result = await res.json();
        if (result.success) setSecurityLogs(result.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch security logs:", err);
    }
  };

  useEffect(() => {
    if (token && activeTab === "SECURITY") {
      fetchSecurityLogs();
    }
  }, [token, activeTab, severityFilter]);

  const handleSendBreachNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !breachSummary.trim() || !breachRemedial.trim()) return;

    setBreachSending(true);
    setBreachSuccessMsg(null);
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const res = await fetch(`${apiBaseUrl}/admin/security/breach-notify`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tenantId: breachTargetTenant === "ALL" ? undefined : breachTargetTenant,
          incidentSummary: breachSummary.trim(),
          remedialActions: breachRemedial.trim(),
        }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        setBreachSuccessMsg(`Mandatory breach notice dispatched to ${result.data.affectedUserCount || 0} affected users.`);
        setBreachSummary("");
        setBreachRemedial("");
        fetchSecurityLogs();
        setTimeout(() => {
          setShowBreachModal(false);
          setBreachSuccessMsg(null);
        }, 2500);
      } else {
        alert(`Failed to send breach notification: ${result.error?.message || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Error dispatching breach notice: ${err.message}`);
    } finally {
      setBreachSending(false);
    }
  };

  const handleExportCertIn = async () => {
    if (!token) return;
    setExportingReport(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${apiBaseUrl}/admin/security/certin-export?days=30`, { headers });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `CERT_In_DPDP_Security_Report_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert("Failed to export compliance report.");
      }
    } catch (err) {
      console.error("Export error:", err);
      alert("Error generating CERT-In export report.");
    } finally {
      setExportingReport(false);
    }
  };

  // ─── Data Fetching & Polling Engine ───
  const fetchDashboardData = async (isBackground = false) => {
    if (!token) return;
    if (!isBackground) setLoadingData(true);
    setSyncingPulse(true);

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [metricsRes, tenantsRes, usersRes, secRes] = await Promise.all([
        fetch(`${apiBaseUrl}/admin/metrics`, { headers }),
        fetch(`${apiBaseUrl}/admin/tenants`, { headers }),
        fetch(`${apiBaseUrl}/admin/users`, { headers }),
        fetch(`${apiBaseUrl}/admin/security/logs?limit=100&severity=${severityFilter}`, { headers })
      ]);

      // Detect expired or unauthorized token (401/403) and self-heal by triggering auto-login
      if (
        metricsRes.status === 401 || tenantsRes.status === 401 || usersRes.status === 401 ||
        metricsRes.status === 403 || tenantsRes.status === 403 || usersRes.status === 403
      ) {
        console.warn("API token is expired or unauthorized. Re-authenticating automatically...");
        localStorage.removeItem("admin_token");
        setToken(null);
        setFetchError("Session credentials expired. Attempting secure re-authentication...");
        return;
      }

      if (!metricsRes.ok || !tenantsRes.ok || !usersRes.ok) {
        throw new Error(
          `Gateway API error (Metrics: ${metricsRes.status}, Tenants: ${tenantsRes.status}, Users: ${usersRes.status})`
        );
      }

      const [metricsResult, tenantsResult, usersResult, secResult] = await Promise.all([
        metricsRes.json(),
        tenantsRes.json(),
        usersRes.json(),
        secRes.ok ? secRes.json() : Promise.resolve({ success: false })
      ]);

      if (metricsResult.success) {
        setMetrics(metricsResult.data);
      }
      if (tenantsResult.success) {
        setTenantsList(tenantsResult.data);
      }
      if (usersResult.success) {
        setUsersList(usersResult.data);
      }
      if (secResult.success) {
        setSecurityLogs(secResult.data || []);
      }

      // Success, clear any previous connection errors
      setFetchError(null);
      setLastSynced(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error("Failed to poll dashboard statistics:", err);
      setFetchError(
        err.message && err.message.includes("Gateway API error")
          ? err.message
          : "Could not connect to the API Gateway. Ensure the backend server is running and CORS is configured."
      );
    } finally {
      setLoadingData(false);
      setTimeout(() => setSyncingPulse(false), 800);
    }
  };

  // Trigger initial fetch and start the 10-second polling interval
  useEffect(() => {
    if (!token) return;

    fetchDashboardData();

    pollTimerRef.current = setInterval(() => {
      fetchDashboardData(true);
    }, 10000); // Poll every 10 seconds

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [token, apiBaseUrl]);

  const filteredTenants = tenantsList.filter((tenant) =>
    tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUsers = usersList.filter((user) => {
    const searchLower = userSearchTerm.toLowerCase();
    return (
      (user.name || "").toLowerCase().includes(searchLower) ||
      user.phone.toLowerCase().includes(searchLower) ||
      user.role.toLowerCase().includes(searchLower) ||
      (user.tenantName || "").toLowerCase().includes(searchLower)
    );
  });

  // ─── Render Initializer ───
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

  // ─── Render Auth Card ───
  if (!token) {
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

          {/* Environment Selector under Auth Form */}
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
                💻 Local API
              </button>
            </div>
            <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 10, textAlign: 'center', fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {apiBaseUrl}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render Main Dashboard ───
  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          <div className="brand-header">
            <div className="brand-logo-glow" />
            <div>
              <h2 style={{ fontSize: 20, lineHeight: 1 }}>Whiteroom</h2>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: '0.05em' }}>COMMAND CENTER</span>
            </div>
          </div>

          <nav>
            <div 
              className={`nav-link ${activeTab === "MONITOR" ? "active" : ""}`}
              onClick={() => setActiveTab("MONITOR")}
            >
              <Compass size={18} />
              <span>Real-Time Monitor</span>
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

        <div>
          {/* Dynamic Environment Gateway Selector */}
          <div style={{ marginBottom: 20 }}>
            <label className="input-label" style={{ fontSize: 10, marginBottom: 8, display: 'block', letterSpacing: '0.05em' }}>GATEWAY ENVIRONMENT</label>
            <div style={{ display: 'flex', gap: 4, background: "rgba(0,0,0,0.25)", padding: 4, borderRadius: 8, border: "1px solid var(--border-color)" }}>
              <button 
                onClick={() => handleApiChange("https://whiteroomapi-production-7011.up.railway.app/api/v1")}
                style={{
                  flex: 1,
                  padding: "6px 4px",
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "none",
                  background: apiBaseUrl.includes("production") ? "rgba(99, 102, 241, 0.15)" : "transparent",
                  color: apiBaseUrl.includes("production") ? "var(--primary)" : "var(--text-muted)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                Production
              </button>
              <button 
                onClick={() => handleApiChange("http://localhost:3000/api/v1")}
                style={{
                  flex: 1,
                  padding: "6px 4px",
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "none",
                  background: apiBaseUrl.includes("localhost") ? "rgba(14, 165, 233, 0.15)" : "transparent",
                  color: apiBaseUrl.includes("localhost") ? "var(--accent-teal)" : "var(--text-muted)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                Local Dev
              </button>
            </div>
            <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 6, fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {apiBaseUrl}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid var(--border-color)", marginBottom: 16 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>Super Admin</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)" }}>+91 99999 99999</p>
            </div>
          </div>
          <button onClick={handleLogout} className="action-btn" style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "var(--error)", boxShadow: "none", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <LogOut size={16} />
            <span>Terminate Session</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Navbar */}
        <header className="top-nav">
          <div>
            <h1 style={{ fontSize: 32 }}>
              {activeTab === "MONITOR" 
                ? "Real-Time Monitor" 
                : activeTab === "USERS" 
                ? "Users Directory" 
                : "Security & Compliance"}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
              {activeTab === "MONITOR" 
                ? "Live operational statistics and registered educational institutions."
                : activeTab === "USERS"
                ? "Real-time user accounts and access control roles loaded directly from Supabase."
                : "DPDP Act 2023 & CERT-In compliant real-time security audit trails and mandatory incident reporting."}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {lastSynced && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
                <Clock size={14} />
                <span>Last Sync: {lastSynced}</span>
              </div>
            )}
            <div className="pulse-indicator-container">
              <div className={`pulse-dot ${syncingPulse ? 'syncing' : ''}`} />
              <span>{syncingPulse ? "FETCHING..." : "LIVE UPDATES"}</span>
            </div>
          </div>
        </header>

        {/* Connection Error Banner */}
        {fetchError && (
          <div className="auth-error" style={{ margin: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: "16px 20px", borderRadius: 12 }}>
            <ShieldAlert size={20} style={{ flexShrink: 0 }} />
            <div>
              <p style={{ fontWeight: 600, fontSize: 14 }}>Connection Alert</p>
              <p style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>{fetchError}</p>
            </div>
          </div>
        )}

        {/* Dashboard Performance Metrics Grid */}
        <section className="stats-grid">
          <div className="glass-panel stat-card">
            <div className="stat-label">Total Users</div>
            <div className="stat-value">
              <Users size={24} style={{ color: "var(--primary)" }} />
              <span>{metrics ? metrics.totalUsers : "--"}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>Registered accounts</div>
          </div>

          <div className="glass-panel stat-card teal">
            <div className="stat-label">Active Schools</div>
            <div className="stat-value">
              <School size={24} style={{ color: "var(--accent-teal)" }} />
              <span>{metrics ? metrics.activeTenants : "--"}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>Active database tenants</div>
          </div>

          <div className="glass-panel stat-card violet">
            <div className="stat-label">Pro Institutions</div>
            <div className="stat-value">
              <Crown size={24} style={{ color: "var(--accent-violet)" }} />
              <span>{metrics ? metrics.proTenants : "--"}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>Paid subscribers</div>
          </div>

          <div className="glass-panel stat-card success">
            <div className="stat-label">Daily Active Users</div>
            <div className="stat-value">
              <Activity size={24} style={{ color: "var(--success)" }} />
              <span>{metrics ? metrics.dailyActiveUsers : "--"}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>Authenticated today</div>
          </div>
        </section>

        {activeTab === "MONITOR" ? (
          /* Registered Schools list Table */
          <section className="glass-panel" style={{ padding: "32px", display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <h2 style={{ fontSize: 20, marginBottom: 4 }}>Educational Institutions</h2>
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>List of schools, academies, and coaching centers registered on your platform.</p>
              </div>

              <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
                <Search size={16} style={{ position: 'absolute', left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                <input
                  type="text"
                  className="glowing-input"
                  style={{ paddingLeft: 44, paddingRight: 16 }}
                  placeholder="Filter by school name or slug..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="table-container">
              {loadingData && tenantsList.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: "64px", gap: 16 }}>
                  <RefreshCw className="animate-spin" size={32} style={{ color: "var(--primary)" }} />
                  <p style={{ color: "var(--text-muted)" }}>Connecting to Whiteroom core database...</p>
                </div>
              ) : filteredTenants.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: "64px", textAlign: 'center' }}>
                  <Building size={48} style={{ color: "var(--text-dim)", marginBottom: 16 }} />
                  <p style={{ color: "var(--text-muted)", fontWeight: 500 }}>No schools found.</p>
                  <p style={{ color: "var(--text-dim)", fontSize: 12 }}>Try adjusting your search criteria or register a new school.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>School Name</th>
                      <th>Database ID</th>
                      <th>Unique Slug</th>
                      <th>Subscription Plan</th>
                      <th>Status</th>
                      <th>Created On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map((tenant) => (
                      <tr key={tenant.id}>
                        <td style={{ fontWeight: 600 }}>{tenant.name}</td>
                        <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{tenant.id}</td>
                        <td>
                          <span style={{ background: "rgba(255,255,255,0.03)", padding: "4px 8px", borderRadius: 6, fontSize: 12, border: "1px solid var(--border-color)", color: "var(--text-muted)" }}>
                            {tenant.slug}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${tenant.plan === "pro" ? "violet" : "primary"}`}>
                            {tenant.plan === "pro" ? "Pro Plan" : "Free Tier"}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${tenant.isActive ? "success" : "error"}`}>
                            {tenant.isActive ? "Active" : "Suspended"}
                          </span>
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: 13 }}>
                          {new Date(tenant.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        ) : (
          /* Users Directory list Table */
          <section className="glass-panel" style={{ padding: "32px", display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <h2 style={{ fontSize: 20, marginBottom: 4 }}>Registered Accounts</h2>
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>View and search all registered accounts across all tenant institutions.</p>
              </div>

              <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
                <Search size={16} style={{ position: 'absolute', left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
                <input
                  type="text"
                  className="glowing-input"
                  style={{ paddingLeft: 44, paddingRight: 16 }}
                  placeholder="Filter users by name, phone, role..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="table-container">
              {loadingData && usersList.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: "64px", gap: 16 }}>
                  <RefreshCw className="animate-spin" size={32} style={{ color: "var(--primary)" }} />
                  <p style={{ color: "var(--text-muted)" }}>Connecting to Whiteroom core database...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: "64px", textAlign: 'center' }}>
                  <Users size={48} style={{ color: "var(--text-dim)", marginBottom: 16 }} />
                  <p style={{ color: "var(--text-muted)", fontWeight: 500 }}>No users found.</p>
                  <p style={{ color: "var(--text-dim)", fontSize: 12 }}>Try adjusting your search criteria.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone Number</th>
                      <th>System Role</th>
                      <th>Associated School</th>
                      <th>User ID</th>
                      <th>Registered On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      let roleBadgeClass = "primary";
                      if (user.role === "super_admin") roleBadgeClass = "violet";
                      else if (user.role === "admin") roleBadgeClass = "teal";
                      else if (user.role === "parent") roleBadgeClass = "success";
                      
                      return (
                        <tr key={user.id}>
                          <td style={{ fontWeight: 600 }}>{user.name || "Anonymous User"}</td>
                          <td>
                            <span style={{ color: "var(--text-main)", fontWeight: 500 }}>
                              {user.phone}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${roleBadgeClass}`}>
                              {user.role}
                            </span>
                          </td>
                          <td>
                            {user.tenantName ? (
                              <span style={{ background: "rgba(255,255,255,0.03)", padding: "4px 8px", borderRadius: 6, fontSize: 12, border: "1px solid var(--border-color)", color: "var(--text-main)", fontWeight: 500 }}>
                                {user.tenantName}
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
                                N/A (Global)
                              </span>
                            )}
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                            {user.id}
                          </td>
                          <td style={{ color: "var(--text-muted)", fontSize: 13 }}>
                            {new Date(user.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {activeTab === "SECURITY" && (
          <section className="glass-panel" style={{ padding: "32px", display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, marginBottom: 4 }}>Security Audit & Breach Response</h2>
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Monitor guardrail blocks, unauthorized access, and execute 1-click regulatory breach notifications.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowBreachModal(true)}
                  className="action-btn"
                  style={{
                    background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: "10px 18px",
                    width: 'auto'
                  }}
                >
                  <AlertTriangle size={16} />
                  <span>1-Click Breach Alert (DPDP / CERT-In)</span>
                </button>

                <button
                  onClick={handleExportCertIn}
                  disabled={exportingReport}
                  className="action-btn"
                  style={{
                    background: "rgba(99, 102, 241, 0.15)",
                    border: "1px solid rgba(99, 102, 241, 0.3)",
                    color: "var(--primary)",
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: "10px 18px",
                    width: 'auto'
                  }}
                >
                  <Download size={16} />
                  <span>{exportingReport ? "Exporting..." : "Export CERT-In / DPDP Report"}</span>
                </button>
              </div>
            </div>

            {/* Severity Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border-color)', paddingBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Filter Severity:</span>
              {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid var(--border-color)",
                    background: severityFilter === sev ? "var(--primary)" : "rgba(255,255,255,0.02)",
                    color: severityFilter === sev ? "#fff" : "var(--text-muted)",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  {sev}
                </button>
              ))}
            </div>

            {/* Audit Logs Table */}
            <div className="table-container">
              {securityLogs.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: "64px", textAlign: 'center' }}>
                  <ShieldCheck size={48} style={{ color: "var(--success)", marginBottom: 16 }} />
                  <p style={{ color: "var(--text-main)", fontWeight: 600 }}>No security violations recorded for this filter.</p>
                  <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 4 }}>All tenant endpoints, PII filters, and access controls are nominal.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Event Type</th>
                      <th>Severity</th>
                      <th>Target Tenant</th>
                      <th>IP Address</th>
                      <th>Details / Metadata</th>
                      <th>Logged At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {securityLogs.map((log) => {
                      let badgeClass = "primary";
                      if (log.severity === "CRITICAL") badgeClass = "error";
                      else if (log.severity === "HIGH") badgeClass = "warning";
                      else if (log.severity === "LOW") badgeClass = "success";

                      return (
                        <tr key={log.id}>
                          <td style={{ fontWeight: 600, color: "var(--text-main)" }}>
                            {log.eventType}
                          </td>
                          <td>
                            <span className={`badge ${badgeClass}`}>{log.severity}</span>
                          </td>
                          <td>
                            <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                              {log.tenantId || "Global / System"}
                            </span>
                          </td>
                          <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-dim)" }}>
                            {log.ipAddress || "unknown"}
                          </td>
                          <td style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {log.metadata ? JSON.stringify(log.metadata) : "--"}
                          </td>
                          <td style={{ fontSize: 12, color: "var(--text-dim)" }}>
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* 1-Click Breach Notification Modal */}
        {showBreachModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20
          }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: 580, padding: 32, position: 'relative', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
              <button
                onClick={() => setShowBreachModal(false)}
                style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--error)' }}>
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 style={{ fontSize: 20 }}>Mandatory Breach Notification</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>DPDP Act 2023 (Section 8) & CERT-In 6-Hour Emergency Broadcast</p>
                </div>
              </div>

              {breachSuccessMsg && (
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid var(--success)', color: 'var(--success)', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                  {breachSuccessMsg}
                </div>
              )}

              <form onSubmit={handleSendBreachNotice}>
                <div className="input-group">
                  <label className="input-label">Quick Template Presets</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setBreachSummary("We have detected an unauthorized access attempt affecting personal data records. Immediate containment protocols have been activated.");
                        setBreachRemedial("1. Reset your account password immediately.\n2. Enable Two-Factor Authentication.\n3. Report any suspicious communication to privacy@whiteroom.co.in.");
                      }}
                      style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-main)', cursor: 'pointer' }}
                    >
                      DPDP Act Data Breach Notice
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBreachSummary("CERT-In Advisory: Potential phishing/malware vector detected targeting institutional credentials. System audit and IP blocklists enforced.");
                        setBreachRemedial("1. Do not click links or download attachments from unrecognized senders.\n2. Verify all system login URLs match apps.whiteroom.co.in.\n3. Institutional IT administrators must review firewall rules immediately.");
                      }}
                      style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-main)', cursor: 'pointer' }}
                    >
                      CERT-In Cybersecurity Alert
                    </button>
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Target Audience / Tenant</label>
                  <select
                    className="glowing-input"
                    value={breachTargetTenant}
                    onChange={(e) => setBreachTargetTenant(e.target.value)}
                  >
                    <option value="ALL">🌐 ALL TENANTS (Global Platform Broadcast)</option>
                    {tenantsList.map((t) => (
                      <option key={t.id} value={t.id}>🏫 {t.name} ({t.slug})</option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Incident Summary (Required)</label>
                  <textarea
                    className="glowing-input"
                    rows={3}
                    placeholder="Describe the nature of the security incident or breach..."
                    value={breachSummary}
                    onChange={(e) => setBreachSummary(e.target.value)}
                    required
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Mandatory Remedial Actions (Section 8 Compliance)</label>
                  <textarea
                    className="glowing-input"
                    rows={3}
                    placeholder="List specific steps users must take to protect their accounts..."
                    value={breachRemedial}
                    onChange={(e) => setBreachRemedial(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setShowBreachModal(false)}
                    className="action-btn"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={breachSending}
                    className="action-btn"
                    style={{ background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', flex: 2 }}
                  >
                    {breachSending ? "Broadcasting Notice..." : "🚨 Dispatch 1-Click Breach Notice"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
