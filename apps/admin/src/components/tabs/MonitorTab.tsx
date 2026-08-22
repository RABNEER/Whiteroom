import { useState } from "react";
import { 
  Users, 
  Building2, 
  Activity, 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  Layers
} from "lucide-react";
import { PlatformMetrics, Tenant } from "../../types";

interface MonitorTabProps {
  metrics: PlatformMetrics | null;
  loadingData: boolean;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
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
  const [filterActive, setFilterActive] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const filteredTenants = tenantsList.filter((tenant) => {
    const matchesSearch =
      tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tenant.id.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterActive === "ACTIVE") return matchesSearch && tenant.isActive;
    if (filterActive === "INACTIVE") return matchesSearch && !tenant.isActive;
    return matchesSearch;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPI Top Cards */}
      <div className="stats-grid">
        <div className="glass-panel stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="stat-label">Total Registered Users</div>
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
          <div style={{ fontSize: 12, color: "#38bdf8", marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <span>●</span> Across all institutions
          </div>
        </div>

        <div className="glass-panel stat-card">
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
              <Building2 size={22} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#818cf8", marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <span>●</span> Multi-tenant database clusters
          </div>
        </div>

        <div className="glass-panel stat-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="stat-label">Daily Active Users</div>
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
              <div className="stat-label">System Gateway</div>
              <div className="stat-value" style={{ color: "#34d399", fontSize: 20, fontWeight: 700 }}>OPERATIONAL</div>
            </div>
            <div
              style={{
                padding: 10,
                borderRadius: 12,
                background: "rgba(16, 185, 129, 0.15)",
                color: "#34d399",
              }}
            >
              <ShieldCheck size={22} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#34d399", marginTop: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <span>●</span> 100% Core Services Online
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
            <div style={{ display: "flex", gap: 6, background: "rgba(15, 23, 42, 0.6)", padding: 3, borderRadius: 8, border: "1px solid var(--border-subtle)" }}>
              <button
                onClick={() => setFilterActive("ALL")}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: filterActive === "ALL" ? "var(--primary)" : "transparent",
                  color: filterActive === "ALL" ? "white" : "var(--text-muted)",
                }}
              >
                All
              </button>
              <button
                onClick={() => setFilterActive("ACTIVE")}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: filterActive === "ACTIVE" ? "var(--primary)" : "transparent",
                  color: filterActive === "ACTIVE" ? "white" : "var(--text-muted)",
                }}
              >
                Active
              </button>
            </div>

            <div style={{ position: "relative", width: 240 }}>
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
                <th>Data Isolation</th>
                <th>Created Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingData && tenantsList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "40px" }}>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, color: "var(--text-muted)" }}>
                      <RefreshCw className="spin" size={18} color="var(--primary)" />
                      <span>Loading institution records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
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
                      <span className="badge badge-indigo">RLS ISOLATED</span>
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
                        {tenant.isActive ? "ACTIVE" : "DISABLED"}
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
