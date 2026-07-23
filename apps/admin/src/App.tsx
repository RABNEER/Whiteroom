import React, { useEffect, useState, useRef } from "react";
import AuthScreen from "./components/AuthScreen";
import Sidebar, { TabType } from "./components/Sidebar";
import TopNavbar from "./components/TopNavbar";
import MonitorTab from "./components/tabs/MonitorTab";
import UsersTab from "./components/tabs/UsersTab";
import SecurityTab from "./components/tabs/SecurityTab";
import { PlatformMetrics, Tenant, User, SecurityAuditLog } from "./types";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("admin_token"));
  const [isInitializing, setIsInitializing] = useState(true);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // API base URL configuration (Production Cloud or Local Dev)
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(
    localStorage.getItem("admin_api_url") || "https://apps.whiteroom.co.in/api/v1"
  );

  const handleApiChange = (url: string) => {
    localStorage.setItem("admin_api_url", url);
    setApiBaseUrl(url);
    // Clear credentials to re-authenticate on the new gateway environment
    localStorage.removeItem("admin_token");
    setToken(null);
    setMetrics(null);
    setTenantsList([]);
    setUsersList([]);
  };

  // Tab control state
  const [activeTab, setActiveTab] = useState<TabType>("MONITOR");

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

  // ─── Initializer Hook ───
  useEffect(() => {
    if (token) {
      setIsInitializing(false);
    } else {
      setIsInitializing(false);
    }
  }, [token]);

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
        setFetchError("Failed to export compliance report.");
      }
    } catch (err) {
      console.error("Export error:", err);
      setFetchError("Error generating CERT-In export report.");
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

      if (metricsResult.success) setMetrics(metricsResult.data);
      if (tenantsResult.success) setTenantsList(tenantsResult.data);
      if (usersResult.success) setUsersList(usersResult.data);
      if (secResult.success) setSecurityLogs(secResult.data || []);

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
      if (syncPulseTimerRef.current) clearTimeout(syncPulseTimerRef.current);
      syncPulseTimerRef.current = setTimeout(() => setSyncingPulse(false), 800);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchDashboardData();
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      fetchDashboardData(true);
    }, 10000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [token, apiBaseUrl, severityFilter]);

  if (!token || isInitializing) {
    return (
      <AuthScreen
        isInitializing={isInitializing}
        token={token}
        phone={phone}
        setPhone={setPhone}
        otp={otp}
        setOtp={setOtp}
        authError={authError}
        authLoading={authLoading}
        handleLogin={handleLogin}
        apiBaseUrl={apiBaseUrl}
        handleApiChange={handleApiChange}
      />
    );
  }

  return (
    <div className="layout">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="main-content">
        <TopNavbar
          apiBaseUrl={apiBaseUrl}
          handleApiChange={handleApiChange}
          lastSynced={lastSynced}
          syncingPulse={syncingPulse}
          fetchError={fetchError}
          handleLogout={handleLogout}
        />
        
        <div className="dashboard-content">
          {activeTab === "MONITOR" && (
            <MonitorTab
              metrics={metrics}
              loadingData={loadingData}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              tenantsList={tenantsList}
            />
          )}

          {activeTab === "USERS" && (
            <UsersTab
              userSearchTerm={userSearchTerm}
              setUserSearchTerm={setUserSearchTerm}
              loadingData={loadingData}
              usersList={usersList}
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
