
import { Users, Building, Activity, Crown, Search } from "lucide-react";
import { PlatformMetrics, Tenant } from "../../types";

interface MonitorTabProps {
  metrics: PlatformMetrics | null;
  loadingData: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  tenantsList: Tenant[];
}

export default function MonitorTab({
  metrics,
  loadingData,
  searchTerm,
  setSearchTerm,
  tenantsList
}: MonitorTabProps) {
  const filteredTenants = tenantsList.filter((tenant) =>
    (tenant?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (tenant?.slug || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <div className="metrics-grid">
        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-title">Platform Users</div>
            <div className="metric-icon" style={{ background: "rgba(99, 102, 241, 0.15)", color: "var(--primary)" }}>
              <Users size={20} />
            </div>
          </div>
          <div className="metric-value">{metrics ? metrics.totalUsers.toLocaleString() : "..."}</div>
          <div className="metric-trend positive">Registered globally</div>
        </div>
        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-title">Active Tenants</div>
            <div className="metric-icon" style={{ background: "rgba(14, 165, 233, 0.15)", color: "var(--accent-teal)" }}>
              <Building size={20} />
            </div>
          </div>
          <div className="metric-value">{metrics ? metrics.activeTenants.toLocaleString() : "..."}</div>
          <div className="metric-trend positive">Isolated DB schemas</div>
        </div>
        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-title">Daily Activity</div>
            <div className="metric-icon" style={{ background: "rgba(236, 72, 153, 0.15)", color: "var(--accent-pink)" }}>
              <Activity size={20} />
            </div>
          </div>
          <div className="metric-value">{metrics ? metrics.dailyActiveUsers.toLocaleString() : "..."}</div>
          <div className="metric-trend positive">Unique sessions 24h</div>
        </div>
        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-title">Pro Subscribers</div>
            <div className="metric-icon" style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--warning)" }}>
              <Crown size={20} />
            </div>
          </div>
          <div className="metric-value">{metrics ? metrics.proTenants.toLocaleString() : "..."}</div>
          <div className="metric-trend">Premium tier</div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "24px", marginTop: "24px" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Tenant Infrastructure</h2>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>Active database tenants</div>
          </div>
          <div className="search-bar" style={{ width: 300 }}>
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Search by slug or name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>TENANT SLUG</th>
                <th>DISPLAY NAME</th>
                <th>PLAN</th>
                <th>SCHEMA ISOLATION</th>
                <th>DATE CREATED</th>
              </tr>
            </thead>
            <tbody>
              {loadingData && tenantsList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "40px" }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                      <Activity className="animate-spin" size={18} style={{ color: "var(--primary)" }} />
                      <span>Syncing tenant schemas...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                    No tenants found matching "{searchTerm}"
                  </td>
                </tr>
              ) : (
                filteredTenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={`status-indicator ${tenant.isActive ? 'online' : 'offline'}`}></div>
                        <span style={{ fontWeight: 600, color: "var(--text-main)" }}>{tenant.slug}</span>
                      </div>
                    </td>
                    <td>{tenant.name}</td>
                    <td>
                      {tenant.plan === "pro" ? (
                        <span className="badge warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Crown size={12} /> PRO
                        </span>
                      ) : (
                        <span className="badge">FREE</span>
                      )}
                    </td>
                    <td><span className="badge success">ISOLATED</span></td>
                    <td style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
