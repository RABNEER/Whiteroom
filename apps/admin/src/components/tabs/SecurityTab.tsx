import React from "react";
import { AlertTriangle, Download, X, ShieldCheck } from "lucide-react";
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
  tenantsList
}: SecurityTabProps) {
  return (
    <>
      <div className="glass-panel" style={{ padding: "24px" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Security & Compliance Audit</h2>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>DPDP & CERT-In Compliant Event Stream</div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <select 
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="glowing-input"
              style={{ width: 140, padding: "8px 12px" }}
            >
              <option value="ALL">All Severities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>

            <button className="action-btn" style={{ padding: "8px 16px", background: "var(--warning)", color: "#000" }} onClick={() => setShowBreachModal(true)}>
              <AlertTriangle size={16} />
              Declare Breach
            </button>
            <button className="action-btn" style={{ padding: "8px 16px" }} onClick={handleExportCertIn} disabled={exportingReport}>
              <Download size={16} />
              {exportingReport ? "Generating CSV..." : "CERT-In Export"}
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>SEVERITY</th>
                <th>EVENT TYPE</th>
                <th>TENANT ID</th>
                <th>USER ID</th>
                <th>IP ADDRESS</th>
              </tr>
            </thead>
            <tbody>
              {securityLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                    No security events found.
                  </td>
                </tr>
              ) : (
                securityLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${log.severity.toLowerCase()}`}>
                        {log.severity}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--text-main)" }}>{log.eventType}</td>
                    <td>{log.tenantId || <span style={{ color: "var(--text-dim)" }}>SYSTEM</span>}</td>
                    <td>{log.userId || <span style={{ color: "var(--text-dim)" }}>-</span>}</td>
                    <td style={{ fontFamily: "monospace", color: "var(--accent-teal)" }}>{log.ipAddress || "Unknown"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showBreachModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ width: 500 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: "rgba(239, 68, 68, 0.1)", padding: 8, borderRadius: 8, color: "var(--error)" }}>
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Declare Security Breach</h3>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>DPDP / GDPR Article 33 72-Hour Notice</div>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setShowBreachModal(false)}><X size={20} /></button>
            </div>

            <div className="modal-body">
              {breachSuccessMsg ? (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <ShieldCheck size={48} style={{ color: "var(--success)", margin: "0 auto 16px auto" }} />
                  <h4 style={{ margin: "0 0 8px 0", color: "var(--success)" }}>Notice Dispatched Successfully</h4>
                  <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{breachSuccessMsg}</p>
                </div>
              ) : (
                <form onSubmit={handleSendBreachNotice}>
                  <div className="input-group">
                    <label className="input-label">Target Affected Tenant</label>
                    <select 
                      className="glowing-input" 
                      value={breachTargetTenant}
                      onChange={(e) => setBreachTargetTenant(e.target.value)}
                    >
                      <option value="ALL">All Tenants (Platform-Wide Breach)</option>
                      {tenantsList.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                      ))}
                    </select>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Executive Summary</label>
                    <textarea 
                      className="glowing-input" 
                      rows={3} 
                      placeholder="Describe the nature of the breach, approximate timestamp, and impacted data types..."
                      value={breachSummary}
                      onChange={(e) => setBreachSummary(e.target.value)}
                      required
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label">Remedial Actions Taken</label>
                    <textarea 
                      className="glowing-input" 
                      rows={3} 
                      placeholder="List steps taken to secure systems and prevent further exposure..."
                      value={breachRemedial}
                      onChange={(e) => setBreachRemedial(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)", padding: 12, borderRadius: 8, marginBottom: 20 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--warning)", display: 'flex', gap: 8 }}>
                      <AlertTriangle size={16} />
                      This will instantly email all admins of the target tenant(s) and log a CRITICAL audit event.
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button type="button" className="action-btn" style={{ background: "transparent", border: "1px solid var(--border-color)" }} onClick={() => setShowBreachModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="action-btn" style={{ background: "var(--error)", color: "#fff" }} disabled={breachSending}>
                      {breachSending ? "Broadcasting..." : "Confirm & Send Notice"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
