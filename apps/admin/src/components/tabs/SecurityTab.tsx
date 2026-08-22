import { AlertTriangle, Download, X, ShieldAlert, CheckCircle } from "lucide-react";
import { SecurityAuditLog, Tenant } from "../../types";

interface SecurityTabProps {
  severityFilter: string;
  setSeverityFilter: (val: string) => void;
  exportingReport: boolean;
  handleExportCertIn: () => void;
  securityLogs: SecurityAuditLog[];
  showBreachModal: boolean;
  setShowBreachModal: (show: boolean) => void;
  breachTargetTenant: string;
  setBreachTargetTenant: (val: string) => void;
  breachSummary: string;
  setBreachSummary: (val: string) => void;
  breachRemedial: string;
  setBreachRemedial: (val: string) => void;
  breachSending: boolean;
  handleSendBreachNotice: (e: React.FormEvent) => void;
  breachSuccessMsg: string | null;
  tenantsList: Tenant[];
}

export default function SecurityTab({
  severityFilter,
  setSeverityFilter,
  exportingReport,
  handleExportCertIn,
  securityLogs,
  showBreachModal,
  setShowBreachModal,
  breachTargetTenant,
  setBreachTargetTenant,
  breachSummary,
  setBreachSummary,
  breachRemedial,
  setBreachRemedial,
  breachSending,
  handleSendBreachNotice,
  breachSuccessMsg,
  tenantsList,
}: SecurityTabProps) {
  const getSeverityBadge = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case "CRITICAL":
        return <span className="badge badge-error">CRITICAL</span>;
      case "HIGH":
        return <span className="badge badge-warning">HIGH</span>;
      case "MEDIUM":
        return <span className="badge badge-indigo">MEDIUM</span>;
      default:
        return <span className="badge badge-teal">LOW</span>;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="glass-panel" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldAlert size={20} color="#f87171" />
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "white" }}>
                Security & DPDP Compliance Audit
              </h2>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Real-time CERT-In & DPDP Act 2023 security telemetry stream
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="glowing-input"
              style={{ width: 140, padding: "8px 12px", fontSize: 12 }}
            >
              <option value="ALL">All Severities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>

            <button
              onClick={() => setShowBreachModal(true)}
              style={{
                padding: "8px 14px",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 8,
                color: "#f87171",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <AlertTriangle size={14} />
              <span>Mandatory Breach Notice</span>
            </button>

            <button
              onClick={handleExportCertIn}
              disabled={exportingReport}
              className="refresh-btn"
              style={{ padding: "8px 14px", fontSize: 12 }}
            >
              <Download size={14} />
              <span>{exportingReport ? "Exporting..." : "CERT-In Audit Export"}</span>
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Severity</th>
                <th>Security Event</th>
                <th>Tenant Scope</th>
                <th>Actor User ID</th>
                <th>Origin IP</th>
              </tr>
            </thead>
            <tbody>
              {securityLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                    No security anomalies recorded in selected severity filter.
                  </td>
                </tr>
              ) : (
                securityLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td>{getSeverityBadge(log.severity)}</td>
                    <td style={{ fontWeight: 600, color: "white" }}>
                      {log.eventType || "AUDIT_LOG_EVENT"}
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                      {log.tenantId || "GLOBAL"}
                    </td>
                    <td style={{ color: "var(--text-dim)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                      {log.userId || "SYSTEM"}
                    </td>
                    <td style={{ color: "#38bdf8", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                      {log.ipAddress || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Breach Notification Modal */}
      {showBreachModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: "100%",
              maxWidth: 540,
              padding: 28,
              background: "#0c101d",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(239, 68, 68, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={22} color="#f87171" />
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "white" }}>
                  DPDP Act Mandatory Breach Notice
                </h3>
              </div>
              <button
                onClick={() => setShowBreachModal(false)}
                className="icon-btn"
                style={{ border: "none" }}
              >
                <X size={18} />
              </button>
            </div>

            {breachSuccessMsg && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: 8,
                  color: "#34d399",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                <CheckCircle size={16} />
                <span>{breachSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSendBreachNotice} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="input-label">Target Institution Scope</label>
                <select
                  className="glowing-input"
                  value={breachTargetTenant}
                  onChange={(e) => setBreachTargetTenant(e.target.value)}
                >
                  <option value="ALL">🌐 All Institutions (Platform Wide)</option>
                  {tenantsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label">Incident Summary *</label>
                <textarea
                  className="glowing-input"
                  placeholder="Describe the nature of the security incident..."
                  value={breachSummary}
                  onChange={(e) => setBreachSummary(e.target.value)}
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="input-label">Remedial Actions Taken *</label>
                <textarea
                  className="glowing-input"
                  placeholder="Steps taken to mitigate and secure affected data..."
                  value={breachRemedial}
                  onChange={(e) => setBreachRemedial(e.target.value)}
                  rows={2}
                  required
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowBreachModal(false)}
                  className="refresh-btn"
                  style={{ flex: 1, padding: "12px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={breachSending}
                  style={{
                    flex: 2,
                    padding: "12px",
                    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    border: "none",
                    borderRadius: 10,
                    color: "white",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: breachSending ? "not-allowed" : "pointer",
                    boxShadow: "0 4px 14px rgba(239, 68, 68, 0.4)",
                  }}
                >
                  {breachSending ? "Disseminating Notice..." : "Dispatch Mandatory Notice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
