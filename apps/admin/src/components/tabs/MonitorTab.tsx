import { Users, Building, Activity, Crown, Search, RefreshCw, Layers } from "lucide-react";
import { PlatformMetrics, Tenant } from "../../types";

interface MonitorTabProps {
  metrics: PlatformMetrics | null;
  loadingData: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  tenantsList: Tenant[];
  onRefresh?: () => void;
}

export default function MonitorTab({
  metrics,
  loadingData,
  searchTerm,
  setSearchTerm,
  tenantsList,
  onRefresh,
}: MonitorTabProps) {
  const filteredTenants = tenantsList.filter((tenant) =>
    (tenant?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tenant?.slug || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Metrics Row */}
      <div className="stats-grid">
        <div className="glass-panel stat-card teal">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="stat-label">Total Platform Users</div>
              <div className="stat-value">{metrics ? metrics.totalUsers.toLocaleString() : "—"}</div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 12,
                background: "rgba(14, 165, 233, 0.15)",
                color: "#38bdf8",
              }}
            >
              <Users size={22} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#34d399", marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <span>●</span> Active registered accounts
          </div>
        </div>

        <div className="glass-panel stat-card violet">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="stat-label">Active Institutions</div>
              <div className="stat-value">{metrics ? metrics.activeTenants.toLocaleString() : "—"}</div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 12,
                background: "rgba(99, 102, 241, 0.15)",
                color: "#818cf8",
              }}
            >
              <Building size={22} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#818cf8", marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <span>●</span> Multi-tenant isolated databases
          </div>
        </div>

        <div className="glass-panel stat-card success">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="stat-label">Daily Active Sessions</div>
              <div className="stat-value">{metrics ? metrics.dailyActiveUsers.toLocaleString() : "—"}</div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 12,
                background: "rgba(16, 185, 129, 0.15)",
                color: "#34d399",
              }}
            >
              <Activity size={22} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#34d399", marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <span>●</span> Active in last 24 hours
          </div>
        </div>

        <div className="glass-panel stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="stat-label">Pro Subscribers</div>
              <div className="stat-value">{metrics ? metrics.proTenants.toLocaleString() : "—"}</div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 12,
                background: "rgba(245, 158, 11, 0.15)",
                color: "#fbbf24",
              }}
            >
              <Crown size={22} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <span>●</span> Premium tier subscriptions
          </div>
        </div>
      </div>

      {/* Tenants Table Section */}
      <div className="glass-panel" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Layers size={20} color="var(--accent-teal)" />
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "white" }}>Institution Database Tenancy</h2>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {filteredTenants.length} institutions registered on platform
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ position: "relative", width: 260 }}>
              <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                className="glowing-input"
                placeholder="Search institutions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 34, fontSize: 12, padding: "8px 12px 8px 34px" }}
              />
            </div>

            {onRefresh && (
              <button
                onClick={onRefresh}
                className="refresh-btn"
                disabled={loadingData}
                style={{ padding: "8px 12px", fontSize: 12 }}
              >
                <RefreshCw size={14} className={loadingData ? "spin" : ""} />
                <span>Refresh</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Institution Name</th>
                <th>Tenant Slug</th>
                <th>Plan Tier</th>
                <th>Data Isolation</th>
                <th>Created Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingData && tenantsList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px" }}>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, color: "var(--text-muted)" }}>
                      <RefreshCw className="spin" size={18} color="var(--primary)" />
                      <span>Loading institution records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                    No institutions found matching "{searchTerm}"
                  </td>
                </tr>
              ) : (
                filteredTenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: "linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.2))",
                            border: "1px solid rgba(14, 165, 233, 0.3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#38bdf8",
                          }}
                        >
                          {tenant.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: "white" }}>{tenant.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{tenant.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", fontSize: 12 }}>
                        {tenant.slug}
                      </span>
                    </td>
                    <td>
                      {tenant.plan === "pro" ? (
                        <span className="badge badge-warning">
                          <Crown size={12} /> PRO
                        </span>
                      ) : (
                        <span className="badge badge-teal">TRIAL / FREE</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-indigo">ISOLATED</span>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {new Date(tenant.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td>
                      <span className={`badge ${tenant.isActive ? "badge-success" : "badge-error"}`}>
                        {tenant.isActive ? "ACTIVE" : "SUSPENDED"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
