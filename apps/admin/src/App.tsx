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
  Compass
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

const API_BASE_URL = "https://whiteroomapi-production.up.railway.app/api/v1";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("admin_token"));
  const [isInitializing, setIsInitializing] = useState(true);
  const [phone, setPhone] = useState("+919999999999");
  const [otp, setOtp] = useState("000000");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Dashboard Data State
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [tenantsList, setTenantsList] = useState<Tenant[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [syncingPulse, setSyncingPulse] = useState(false);

  // Poll controller
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Auto-Login Bypass Hook ───
  useEffect(() => {
    const attemptAutoLogin = async () => {
      if (token) {
        setIsInitializing(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: "+919999999999", otp: "000000" }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          const accessToken = result.data.accessToken;
          localStorage.setItem("admin_token", accessToken);
          setToken(accessToken);
        }
      } catch (err) {
        console.error("Auto bypass login failed, falling back to manual credentials entry:", err);
      } finally {
        setIsInitializing(false);
      }
    };

    attemptAutoLogin();
  }, [token]);


  // ─── Login Logic ───
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
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
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  };

  // ─── Data Fetching & Polling Engine ───
  const fetchDashboardData = async (isBackground = false) => {
    if (!token) return;
    if (!isBackground) setLoadingData(true);
    setSyncingPulse(true);

    try {
      // 1. Fetch live metrics
      const metricsRes = await fetch(`${API_BASE_URL}/admin/metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const metricsResult = await metricsRes.json();

      // 2. Fetch live tenants
      const tenantsRes = await fetch(`${API_BASE_URL}/admin/tenants`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const tenantsResult = await tenantsRes.json();

      if (metricsRes.ok && metricsResult.success) {
        setMetrics(metricsResult.data);
      }
      if (tenantsRes.ok && tenantsResult.success) {
        setTenantsList(tenantsResult.data);
      }

      setLastSynced(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Failed to poll dashboard statistics:", err);
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
  }, [token]);

  const filteredTenants = tenantsList.filter((tenant) =>
    tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

          <form onSubmit={handleLogin}>
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
            <div className="nav-link active">
              <Compass size={18} />
              <span>Real-Time Monitor</span>
            </div>
            <a 
              href="https://database.supabase.com/" 
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
            <h1 style={{ fontSize: 32 }}>Real-Time Monitor</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Live operational statistics and registered educational institutions.</p>
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

        {/* Registered Schools list Table */}
        <section className="glass-panel" style={{ padding: "32px", display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: "64px", textCenter: 'center' }}>
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
      </main>
    </div>
  );
}
