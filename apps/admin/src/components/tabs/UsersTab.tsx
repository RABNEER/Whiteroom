import { useState } from "react";
import { Search, Users, RefreshCw } from "lucide-react";
import { User } from "../../types";

interface UsersTabProps {
  userSearchTerm: string;
  setUserSearchTerm: (term: string) => void;
  loadingData: boolean;
  usersList: User[];
  onRefresh?: () => void;
}

export default function UsersTab({
  userSearchTerm,
  setUserSearchTerm,
  loadingData,
  usersList,
  onRefresh,
}: UsersTabProps) {
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  const filteredUsers = usersList.filter((user) => {
    const searchLower = userSearchTerm.toLowerCase();
    const matchesSearch =
      (user?.name || "").toLowerCase().includes(searchLower) ||
      (user?.phone || "").toLowerCase().includes(searchLower) ||
      (user?.role || "").toLowerCase().includes(searchLower) ||
      (user?.tenantName || "").toLowerCase().includes(searchLower);

    const matchesRole =
      roleFilter === "ALL" ||
      user?.role?.toLowerCase() === roleFilter.toLowerCase();

    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    switch (role?.toLowerCase()) {
      case "super_admin":
        return <span className="badge badge-warning">SUPER ADMIN</span>;
      case "school_admin":
      case "tenant_admin":
        return <span className="badge badge-warning">SCHOOL ADMIN</span>;
      case "teacher":
        return <span className="badge badge-indigo">TEACHER</span>;
      case "parent":
        return <span className="badge badge-teal">PARENT</span>;
      case "student":
        return <span className="badge badge-success">STUDENT</span>;
      default:
        return <span className="badge badge-teal">{(role || "USER").toUpperCase()}</span>;
    }
  };

  return (
    <div className="glass-panel" style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Users size={20} color="var(--accent-teal)" />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "white" }}>User Accounts Directory</h2>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {filteredUsers.length} total user records matched
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Role Filter Buttons */}
          <div style={{ display: "flex", background: "rgba(0,0,0,0.3)", padding: 3, borderRadius: 8, border: "1px solid var(--border)" }}>
            {["ALL", "school_admin", "teacher", "parent"].map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                style={{
                  padding: "6px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "none",
                  background: roleFilter === r ? "rgba(14, 165, 233, 0.2)" : "transparent",
                  color: roleFilter === r ? "#38bdf8" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {r === "ALL" ? "All" : r === "school_admin" ? "Admins" : r === "teacher" ? "Teachers" : "Parents"}
              </button>
            ))}
          </div>

          <div style={{ position: "relative", width: 260 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              className="glowing-input"
              placeholder="Search phone, name, institution..."
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
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
              <th>User / Mobile</th>
              <th>Display Name</th>
              <th>Role</th>
              <th>Assigned Institution</th>
              <th>Joined Date</th>
            </tr>
          </thead>
          <tbody>
            {loadingData && usersList.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "40px" }}>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, color: "var(--text-muted)" }}>
                    <RefreshCw className="spin" size={18} color="var(--primary)" />
                    <span>Loading user directory...</span>
                  </div>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  No users found matching search or filter criteria.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2))",
                          border: "1px solid rgba(99, 102, 241, 0.3)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#818cf8",
                        }}
                      >
                        {(user.name || user.phone || "U").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "white", fontFamily: "var(--font-mono)", fontSize: 13 }}>
                          {user.phone}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                          {user.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {user.name || <span style={{ color: "var(--text-dim)" }}>Not specified</span>}
                    </span>
                  </td>
                  <td>{getRoleBadge(user.role)}</td>
                  <td>
                    {user.tenantName ? (
                      <span style={{ color: "#38bdf8", fontWeight: 500 }}>{user.tenantName}</span>
                    ) : (
                      <span style={{ color: "var(--text-dim)" }}>Platform Global</span>
                    )}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {new Date(user.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
