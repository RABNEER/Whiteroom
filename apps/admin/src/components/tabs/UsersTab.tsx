
import { Search, Activity } from "lucide-react";
import { User } from "../../types";

interface UsersTabProps {
  userSearchTerm: string;
  setUserSearchTerm: (term: string) => void;
  loadingData: boolean;
  usersList: User[];
}

export default function UsersTab({
  userSearchTerm,
  setUserSearchTerm,
  loadingData,
  usersList
}: UsersTabProps) {
  const filteredUsers = usersList.filter((user) => {
    const searchLower = userSearchTerm.toLowerCase();
    return (
      (user?.name || "").toLowerCase().includes(searchLower) ||
      (user?.phone || "").toLowerCase().includes(searchLower) ||
      (user?.role || "").toLowerCase().includes(searchLower) ||
      (user?.tenantName || "").toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="glass-panel" style={{ padding: "24px" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Global Users Directory</h2>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>Cross-tenant user tracking</div>
        </div>
        <div className="search-bar" style={{ width: 350 }}>
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Search phone, name, role, or tenant..." 
            value={userSearchTerm}
            onChange={(e) => setUserSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>PHONE / ID</th>
              <th>NAME</th>
              <th>ROLE</th>
              <th>TENANT / SCHEMA</th>
              <th>JOINED</th>
            </tr>
          </thead>
          <tbody>
            {loadingData && usersList.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "40px" }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                    <Activity className="animate-spin" size={18} style={{ color: "var(--primary)" }} />
                    <span>Syncing cross-tenant identities...</span>
                  </div>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                  No users found matching "{userSearchTerm}"
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span style={{ fontWeight: 600, color: "var(--text-main)", letterSpacing: '0.05em' }}>
                      {user.phone}
                    </span>
                  </td>
                  <td>{user.name || <span style={{ color: "var(--text-muted)" }}>Unknown</span>}</td>
                  <td>
                    {user.role === 'tenant_admin' ? (
                      <span className="badge warning">ADMIN</span>
                    ) : user.role === 'teacher' ? (
                      <span className="badge primary">TEACHER</span>
                    ) : user.role === 'student' ? (
                      <span className="badge">STUDENT</span>
                    ) : (
                      <span className="badge">{user.role.toUpperCase()}</span>
                    )}
                  </td>
                  <td>
                    {user.tenantName ? (
                      <span style={{ color: "var(--accent-teal)" }}>{user.tenantName}</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>N/A (Super Admin)</span>
                    )}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {new Date(user.createdAt).toLocaleDateString()}
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
