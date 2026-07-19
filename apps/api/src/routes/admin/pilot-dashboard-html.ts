import type { Context } from "hono";

export function pilotDashboardHtmlHandler(c: Context) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Whiteroom — Pilot Telemetry Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #4f46e5;
      --primary-light: #e0e7ff;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
      --emerald: #10b981;
      --emerald-light: #ecfdf5;
      --emerald-border: #d1fae5;
      --amber: #f59e0b;
      --amber-light: #fef3c7;
      --amber-border: #fde68a;
      --sky: #0ea5e9;
      --sky-light: #e0f2fe;
      --sky-border: #bae6fd;
      --rose: #ef4444;
      --rose-light: #fef2f2;
      --rose-border: #fee2e2;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      padding: 2rem;
      line-height: 1.5;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    /* Header */
    .header {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 2.5rem;
    }
    @media (min-width: 640px) {
      .header {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
      }
    }
    .header-title-wrapper {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .header-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .header-subtitle {
      font-size: 0.875rem;
      color: var(--muted);
      font-weight: 500;
    }
    .header-badge-wrapper {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .badge-live {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background-color: var(--emerald-light);
      color: #047857;
      border: 1px solid var(--emerald-border);
      padding: 0.4rem 0.8rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      background-color: var(--emerald);
      border-radius: 50%;
      animation: pulse 1.6s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    .uptime-badge {
      font-size: 0.75rem;
      color: var(--muted);
      font-weight: 600;
      background-color: #ffffff;
      padding: 0.4rem 0.8rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }

    /* Grid layout */
    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;
      margin-bottom: 3rem;
    }
    @media (min-width: 640px) {
      .metrics-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 1024px) {
      .metrics-grid { grid-template-columns: repeat(4, 1fr); }
    }

    /* Card */
    .card {
      background-color: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 10px 15px -3px rgba(0, 0, 0, 0.03);
      transition: all 0.2s ease-in-out;
    }
    .card:hover {
      border-color: rgba(79, 70, 229, 0.2);
      box-shadow: 0 10px 20px rgba(0,0,0,0.05);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .card-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .card-icon {
      font-size: 1.25rem;
    }
    .card-value {
      font-family: 'Outfit', sans-serif;
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 0.5rem;
    }
    .card-footer {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--muted);
    }

    /* Progress bar */
    .progress-container {
      width: 100%;
      background-color: #f1f5f9;
      height: 6px;
      border-radius: 9999px;
      margin-bottom: 0.5rem;
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      background-color: var(--primary);
      border-radius: 9999px;
      width: 0%;
      transition: width 0.6s ease;
    }

    /* Layout column wrapper */
    .layout-columns {
      display: grid;
      grid-template-columns: 1fr;
      gap: 2.5rem;
    }
    @media (min-width: 1024px) {
      .layout-columns {
        grid-template-columns: 1fr 2fr;
      }
    }

    .column-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 0.25rem;
    }
    .column-subtitle {
      font-size: 0.75rem;
      color: var(--muted);
      font-weight: 500;
      margin-bottom: 1.5rem;
    }

    /* School cards */
    .schools-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .school-card {
      background-color: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    .school-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .school-name {
      font-family: 'Outfit', sans-serif;
      font-size: 0.875rem;
      font-weight: 700;
      color: var(--text);
    }
    .badge-status {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      background-color: var(--emerald-light);
      color: #047857;
      border: 1px solid var(--emerald-border);
    }
    .school-address {
      font-size: 0.75rem;
      color: var(--muted);
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .school-footer {
      display: flex;
      justify-content: space-between;
      font-size: 0.65rem;
      font-family: monospace;
      color: var(--muted);
      border-top: 1px solid #f1f5f9;
      padding-top: 0.75rem;
    }

    /* Compliance Banner */
    .compliance-card {
      background-color: #f5f3ff;
      border: 1px solid #e0e7ff;
      padding: 1.25rem;
      border-radius: 12px;
    }
    .compliance-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .compliance-text {
      font-size: 0.75rem;
      color: #4f46e5;
      line-height: 1.5;
    }

    /* Right column log header */
    .feed-header-row {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    @media (min-width: 640px) {
      .feed-header-row {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
      }
    }
    .search-wrapper {
      position: relative;
      width: 100%;
    }
    @media (min-width: 640px) {
      .search-wrapper {
        width: 260px;
      }
    }
    .search-input {
      width: 100%;
      background-color: #ffffff;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.5rem 1rem 0.5rem 2.25rem;
      font-size: 0.75rem;
      color: var(--text);
      outline: none;
      box-shadow: 0 1px 2px rgba(0,0,0,0.02);
    }
    .search-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
    }
    .search-icon {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      font-size: 0.85rem;
      pointer-events: none;
    }

    /* Table styles */
    .table-wrapper {
      background-color: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
      overflow: hidden;
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      background-color: #f8fafc;
      color: var(--muted);
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 1rem;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 1rem;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.75rem;
      color: #334155;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .actor-name-wrapper {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .actor-name {
      font-weight: 700;
      color: var(--text);
    }
    .actor-phone {
      font-size: 0.65rem;
      color: var(--muted);
      font-weight: 400;
    }
    .role-tag {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      display: inline-block;
      align-self: flex-start;
      margin-top: 0.2rem;
    }
    .role-super_admin { background-color: var(--rose-light); color: #b91c1c; border: 1px solid var(--rose-border); }
    .role-school_admin { background-color: var(--amber-light); color: #b45309; border: 1px solid var(--amber-border); }
    .role-teacher { background-color: var(--sky-light); color: #0369a1; border: 1px solid var(--sky-border); }
    .role-parent { background-color: var(--emerald-light); color: #047857; border: 1px solid var(--emerald-border); }
    .role-system { background-color: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }

    .action-text {
      font-weight: 600;
      color: var(--text);
    }
    .resource-text {
      font-family: monospace;
      color: var(--muted);
      font-weight: 500;
    }
    .time-text {
      font-family: monospace;
      color: var(--muted);
    }
  </style>
</head>
<body>

  <div class="container">
    
    <!-- ─── HEADER ─── -->
    <header class="header">
      <div class="header-title-wrapper">
        <div class="header-title">
          <span>⚙️</span>
          <span>Whiteroom Telemetry Control</span>
        </div>
        <p class="header-subtitle">Live pilot telemetry report for district administration & incubator review</p>
      </div>
      
      <div class="header-badge-wrapper">
        <div class="badge-live">
          <span class="pulse-dot"></span>
          LIVE TELEMETRY
        </div>
        <div id="uptime" class="uptime-badge">
          Uptime: --
        </div>
      </div>
    </header>

    <!-- ─── METRICS GRID ─── -->
    <section class="metrics-grid">
      
      <!-- Student Rollout -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Student Rollout</span>
          <span class="card-icon">👥</span>
        </div>
        <div class="card-value" id="val-students">-</div>
        <div class="progress-container">
          <div id="progress-bar-students" class="progress-bar"></div>
        </div>
        <div class="card-footer" style="display:flex; justify-content:space-between">
          <span>Target: 100 students</span>
          <span id="percent-students" style="color: var(--primary)">0%</span>
        </div>
      </div>

      <!-- Active Users -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Active Accounts</span>
          <span class="card-icon">👤</span>
        </div>
        <div class="card-value" id="val-users">-</div>
        <div class="card-footer" id="val-users-roles">
          0 Teachers | 0 Parents
        </div>
      </div>

      <!-- Secure Messages -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Secure Messages</span>
          <span class="card-icon">💬</span>
        </div>
        <div class="card-value" id="val-messages">-</div>
        <div class="card-footer" style="color: var(--emerald)">
          WhatsApp Sandboxed
        </div>
      </div>

      <!-- Attendance Pushes -->
      <div class="card">
        <div class="card-header">
          <span class="card-label">Attendance Pushes</span>
          <span class="card-icon">☑️</span>
        </div>
        <div class="card-value" id="val-attendance">-</div>
        <div class="card-footer" id="val-announcements">
          0 notices published
        </div>
      </div>

    </section>

    <!-- ─── DETAIL VIEW columns ─── -->
    <div class="layout-columns">
      
      <!-- Left: School List -->
      <div class="left-column">
        <h2 class="column-title">Participating Schools</h2>
        <p class="column-subtitle">Verified tenant workspaces active in the pre-pilot</p>

        <div class="schools-list" id="schools-list">
          <div class="school-card" style="text-align: center; color: var(--muted)">
            Onboarding institutions...
          </div>
        </div>

        <div class="compliance-card">
          <div class="compliance-title">
            <span>🛡️</span>
            Compliance & Legal Scoping
          </div>
          <p class="compliance-text">
            This platform strictly operates under the guidelines of the <strong>DPDP Act 2023</strong>. Personal Identifiable Information (PII) of minors is sandboxed and only shared with verified legal guardians.
          </p>
        </div>
      </div>

      <!-- Right: Audit Logs -->
      <div class="right-column">
        <div class="feed-header-row">
          <div>
            <h2 class="column-title">Pilot Activity Feed</h2>
            <p class="column-subtitle">Real-time log of security events and user interactions</p>
          </div>
          
          <div class="search-wrapper">
            <span class="search-icon">🔍</span>
            <input 
              type="text" 
              id="search-activities" 
              placeholder="Search actors, roles, or actions..."
              class="search-input"
            />
          </div>
        </div>

        <div class="table-wrapper">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Action Event</th>
                  <th>Resource Scope</th>
                  <th style="text-align: right">Time</th>
                </tr>
              </thead>
              <tbody id="audit-table">
                <tr>
                  <td colspan="4" style="text-align: center; padding: 2rem; color: var(--muted)">
                    Loading live activity feed...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function escapeHtml(unsafe) {
      if (typeof unsafe !== 'string') return unsafe;
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    let rawActivity = [];

    function getRoleBadgeClass(role) {
      if (!role) return 'role-system';
      const cleanRole = role.toLowerCase();
      if (['super_admin', 'school_admin', 'teacher', 'parent', 'system'].includes(cleanRole)) {
        return 'role-' + cleanRole;
      }
      return 'role-system';
    }

    function renderAuditTable(filteredLogs) {
      const tbody = document.getElementById('audit-table');
      if (filteredLogs && filteredLogs.length > 0) {
        tbody.innerHTML = filteredLogs.map(item => {
          const badgeClass = escapeHtml(getRoleBadgeClass(item.role));
          const formattedRole = escapeHtml(item.role ? item.role.replace('_', ' ').toUpperCase() : 'SYSTEM');
          const cleanPhone = escapeHtml(item.actorPhone ? ' (' + item.actorPhone.slice(-4) + ')' : '');
          const displayActor = escapeHtml(item.actorName ? item.actorName : (item.actor || 'System'));
          const actionText = escapeHtml(item.action ? item.action.replace(/_/g, ' ').toUpperCase() : '');
          const resourceText = escapeHtml(item.resource || '');
          const timeText = escapeHtml(new Date(item.createdAt).toLocaleTimeString());
          
          return \`
            <tr>
              <td>
                <div class="actor-name-wrapper">
                  <span class="actor-name">
                    \${displayActor}
                    <span class="actor-phone">\${cleanPhone}</span>
                  </span>
                  <span class="role-tag \${badgeClass}">
                    \${formattedRole}
                  </span>
                </div>
              </td>
              <td>
                <span class="action-text">\${actionText}</span>
              </td>
              <td>
                <span class="resource-text">\${resourceText}</span>
              </td>
              <td style="text-align: right" class="time-text">
                \${timeText}
              </td>
            </tr>
          \`;
        }).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--muted)">No matching audit logs found.</td></tr>';
      }
    }

    async function fetchStats() {
      try {
        const res = await fetch('/api/v1/pilot-stats');
        const json = await res.json();
        if (!json.success) return;
        const d = json.data;
        
        // Populate stats
        const studentsCount = d.metrics.students || 0;
        document.getElementById('val-students').textContent = studentsCount;
        document.getElementById('val-users').textContent = d.metrics.totalUsers;
        document.getElementById('val-messages').textContent = d.metrics.chatMessages;
        document.getElementById('val-attendance').textContent = d.metrics.attendanceSessions;
        
        // Update progress bar
        const target = 100;
        const percentage = Math.min(Math.round((studentsCount / target) * 100), 100);
        document.getElementById('progress-bar-students').style.width = percentage + '%';
        document.getElementById('percent-students').textContent = percentage + '%';

        const rb = d.metrics.rolesBreakdown || {};
        document.getElementById('val-users-roles').textContent = 
          \`\${rb.teacher || 0} Teachers | \${rb.parent || 0} Parents | \${rb.school_admin || 0} Admins\`;
        document.getElementById('val-announcements').textContent = 
          \`\${d.metrics.announcements || 0} notices published\`;
        
        document.getElementById('uptime').textContent = 
          'Uptime: ' + Math.floor(d.uptimeSeconds / 60) + ' min';

        // Render Schools
        const schoolsDiv = document.getElementById('schools-list');
        if (d.activeSchools && d.activeSchools.length > 0) {
          schoolsDiv.innerHTML = d.activeSchools.map(school => {
            const schoolName = escapeHtml(school.name || '');
            const schoolAddress = escapeHtml(school.address || 'Address unconfigured');
            const schoolSlug = escapeHtml(school.slug || '');
            const schoolPhone = school.phone ? escapeHtml(school.phone.slice(0, 3) + '***' + school.phone.slice(-3)) : '';
            return \`
            <div class="school-card">
              <div class="school-card-header">
                <span class="school-name">\${schoolName}</span>
                <span class="badge-status">ONBOARDED</span>
              </div>
              <div class="school-address">
                <span>📍</span>
                \${schoolAddress}
              </div>
              <div class="school-footer">
                <span>Domain: /\${schoolSlug}</span>
                <span>Owner: \${schoolPhone}</span>
              </div>
            </div>
          \`}).join('');
        } else {
          schoolsDiv.innerHTML = '<div class="school-card" style="text-align: center; color: var(--muted)">No active schools onboarded.</div>';
        }

        // Store and render audit logs
        rawActivity = d.recentActivity || [];
        filterAndRenderActivities();

      } catch (err) {
        console.error('Failed to fetch telemetry', err);
      }
    }

    function filterAndRenderActivities() {
      const searchVal = document.getElementById('search-activities').value.toLowerCase();
      if (!searchVal) {
        renderAuditTable(rawActivity);
        return;
      }
      const filtered = rawActivity.filter(item => {
        const displayActor = (item.actorName || item.actor || 'System').toLowerCase();
        const action = item.action.toLowerCase();
        const resource = item.resource.toLowerCase();
        const role = (item.actorRole || 'system').toLowerCase();
        return displayActor.includes(searchVal) || 
               action.includes(searchVal) || 
               resource.includes(searchVal) || 
               role.includes(searchVal);
      });
      renderAuditTable(filtered);
    }

    document.getElementById('search-activities').addEventListener('input', filterAndRenderActivities);

    fetchStats();
    setInterval(fetchStats, 5000); // Live refresh every 5 seconds
  </script>
</body>
</html>`;
  return c.html(html);
}
