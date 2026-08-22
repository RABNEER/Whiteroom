import { useEffect, useState, useRef } from "react";
import Sidebar, { TabType } from "./components/Sidebar";
import TopNavbar from "./components/TopNavbar";
import MonitorTab from "./components/tabs/MonitorTab";
import UsersTab from "./components/tabs/UsersTab";
import SecurityTab from "./components/tabs/SecurityTab";
import BroadcastTab from "./components/tabs/BroadcastTab";
import { PlatformMetrics, Tenant, User, SecurityAuditLog } from "./types";

export default function App() {
  const [token] = useState<string | null>(
    localStorage.getItem("admin_token") || "direct-admin-session"
  );

  // Smart API URL resolution with auto-fallback
  const getInitialApiUrl = () => {
    if (typeof window !== "undefined") {
      if (window.location.hostname === "66.42.90.144") {
        return "http://66.42.90.144:3000/api/v1";
      }
      if (window.location.hostname.includes("whiteroom.co.in")) {
        return "https://apps.whiteroom.co.in/api/v1";
      }
    }
    const stored = localStorage.getItem("admin_api_url");
    if (stored && !stored.includes(":8080") && !stored.includes("localhost:3000")) {
      return stored;
    }
    return "http://66.42.90.144:3000/api/v1";
  };

  const [apiBaseUrl, setApiBaseUrl] = useState<string>(getInitialApiUrl);

  const handleApiChange = (url: string) => {
    console.log(`[GATEWAY] Manually switching API Gateway to: ${url}`);
    localStorage.setItem("admin_api_url", url);
    setApiBaseUrl(url);
    setFetchError(null);
    fetchDashboardData(false, url);
  };

  // Tab control state
  const [activeTab, setActiveTab] = useState<TabType>("BROADCAST");

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

  // Poll & timeout controllers
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breachNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (breachNoticeTimerRef.current) clearTimeout(breachNoticeTimerRef.current);
      if (syncPulseTimerRef.current) clearTimeout(syncPulseTimerRef.current);
    };
  }, []);

  const handleLogout = () => {
    console.log("[AUTH] Resetting dashboard data & forcing sync");
    fetchDashboardData(false);
  };

  const fetchSecurityLogs = async (severity = severityFilter) => {
    try {
      const headers = { Authorization: `Bearer ${token || "direct-admin-session"}` };
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
    if (activeTab === "SECURITY") {
      fetchSecurityLogs();
    }
  }, [activeTab, severityFilter]);

  const handleSendBreachNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!breachSummary.trim() || !breachRemedial.trim()) return;

    setBreachSending(true);
    setBreachSuccessMsg(null);
    try {
      const headers = {
        Authorization: `Bearer ${token || "direct-admin-session"}`,
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
        if (breachNoticeTimerRef.current) clearTimeout(breachNoticeTimerRef.current);
        breachNoticeTimerRef.current = setTimeout(() => {
          setShowBreachModal(false);
          setBreachSuccessMsg(null);
        }, 2500);
      } else {
        setFetchError(`Failed to send breach notification: ${result.error?.message || "Unknown error"}`);
      }
    } catch (err: any) {
      setFetchError(`Error dispatching breach notice: ${err.message}`);
    } finally {
      setBreachSending(false);
    }
  };

  const handleExportCertIn = async () => {
    setExportingReport(true);
    try {
      const headers = { Authorization: `Bearer ${token || "direct-admin-session"}` };
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
        setFetchError("Failed to export compliance report.");
      }
    } catch (err) {
      console.error("Export error:", err);
      setFetchError("Error generating CERT-In export report.");
    } finally {
      setExportingReport(false);
    }
  };

  // ─── Multi-Candidate Auto-Fallback Data Fetching Engine ───
  const fetchDashboardData = async (isBackground = false, initialUrl = apiBaseUrl) => {
    if (!isBackground) setLoadingData(true);
    setSyncingPulse(true);

    const candidates = Array.from(new Set([
      "https://apps.whiteroom.co.in/api/v1",
      "http://66.42.90.144:3000/api/v1",
      "/api",
      initialUrl,
    ]));

    let successUrl: string | null = null;

    for (const targetUrl of candidates) {
      try {
        console.log(`[DASHBOARD] Probing API Gateway at ${targetUrl}...`);
        const headers = { Authorization: `Bearer ${token || "direct-admin-session"}` };

        const [metricsRes, tenantsRes, usersRes, secRes] = await Promise.allSettled([
          fetch(`${targetUrl}/admin/metrics`, { headers }),
          fetch(`${targetUrl}/admin/tenants`, { headers }),
          fetch(`${targetUrl}/admin/users`, { headers }),
          fetch(`${targetUrl}/admin/security/logs?limit=100&severity=${severityFilter}`, { headers }),
        ]);

        let hasSuccess = false;

        // Handle Metrics
        if (metricsRes.status === "fulfilled" && metricsRes.value.ok) {
          const metricsResult = await metricsRes.value.json();
          if (metricsResult.success) {
            setMetrics(metricsResult.data);
            hasSuccess = true;
          }
        }

        // Handle Tenants
        if (tenantsRes.status === "fulfilled" && tenantsRes.value.ok) {
          const tenantsResult = await tenantsRes.value.json();
          if (tenantsResult.success && Array.isArray(tenantsResult.data)) {
            setTenantsList(tenantsResult.data);
            hasSuccess = true;
          }
        }

        // Handle Users
        if (usersRes.status === "fulfilled" && usersRes.value.ok) {
          const usersResult = await usersRes.value.json();
          if (usersResult.success && Array.isArray(usersResult.data)) {
            setUsersList(usersResult.data);
            hasSuccess = true;
          }
        }

        // Handle Security Logs
        if (secRes.status === "fulfilled" && secRes.value.ok) {
          const secResult = await secRes.value.json();
          if (secResult.success && Array.isArray(secResult.data)) {
            setSecurityLogs(secResult.data);
            hasSuccess = true;
          }
        }

        if (hasSuccess) {
          successUrl = targetUrl;
          console.log(`✅ [DASHBOARD] Connected successfully to API Gateway at: ${targetUrl}`);
          if (targetUrl !== apiBaseUrl) {
            setApiBaseUrl(targetUrl);
            localStorage.setItem("admin_api_url", targetUrl);
          }
          setFetchError(null);
          setLastSynced(new Date().toLocaleTimeString());
          break; // Stop probing since we found a working gateway!
        }
      } catch (err: any) {
        console.warn(`[DASHBOARD] Probing failed for ${targetUrl}:`, err.message);
      }
    }

    if (!successUrl) {
      setFetchError(`Could not connect to API Gateway. Checked: ${candidates.join(", ")}`);
    }

    setLoadingData(false);
    if (syncPulseTimerRef.current) clearTimeout(syncPulseTimerRef.current);
    syncPulseTimerRef.current = setTimeout(() => setSyncingPulse(false), 800);
  };

  useEffect(() => {
    fetchDashboardData();
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      fetchDashboardData(true);
    }, 15000);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="main-content">
        <TopNavbar
          apiBaseUrl={apiBaseUrl}
          handleApiChange={handleApiChange}
          lastSynced={lastSynced}
          syncingPulse={syncingPulse}
          fetchError={fetchError}
          handleLogout={handleLogout}
          onRefresh={() => fetchDashboardData(false)}
        />

        <div>
          {activeTab === "BROADCAST" && (
            <BroadcastTab
              apiBaseUrl={apiBaseUrl}
              token={token || "direct-admin-session"}
              tenantsList={tenantsList}
            />
          )}

          {activeTab === "MONITOR" && (
            <MonitorTab
              metrics={metrics}
              loadingData={loadingData}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              tenantsList={tenantsList}
              onRefresh={() => fetchDashboardData(false)}
            />
          )}

          {activeTab === "USERS" && (
            <UsersTab
              userSearchTerm={userSearchTerm}
              setUserSearchTerm={setUserSearchTerm}
              loadingData={loadingData}
              usersList={usersList}
              onRefresh={() => fetchDashboardData(false)}
            />
          )}

          {activeTab === "SECURITY" && (
            <SecurityTab
              severityFilter={severityFilter}
              setSeverityFilter={setSeverityFilter}
              exportingReport={exportingReport}
              handleExportCertIn={handleExportCertIn}
              securityLogs={securityLogs}
              showBreachModal={showBreachModal}
              setShowBreachModal={setShowBreachModal}
              breachTargetTenant={breachTargetTenant}
              setBreachTargetTenant={setBreachTargetTenant}
              breachSummary={breachSummary}
              setBreachSummary={setBreachSummary}
              breachRemedial={breachRemedial}
              setBreachRemedial={setBreachRemedial}
              breachSending={breachSending}
              handleSendBreachNotice={handleSendBreachNotice}
              breachSuccessMsg={breachSuccessMsg}
              tenantsList={tenantsList}
            />
          )}
        </div>
      </div>
    </div>
  );
}
