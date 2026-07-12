import type { Context } from "hono";

export function pilotDashboardHtmlHandler(c: Context) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Whiteroom — 100-Student Pilot Live Telemetry</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(23, 30, 46, 0.7);
      --border: rgba(255, 255, 255, 0.08);
      --primary: #00d2ff;
      --accent: #3a7bd5;
      --success: #00e676;
      --text: #f1f5f9;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      padding: 2rem;
      background-image: 
        radial-gradient(at 0% 0%, rgba(0, 210, 255, 0.08) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(58, 123, 213, 0.1) 0px, transparent 50%);
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
    }
    h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 1.8rem;
      font-weight: 700;
      background: linear-gradient(90deg, #fff, var(--primary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .badge {
      background: rgba(0, 230, 118, 0.15);
      color: var(--success);
      padding: 0.4rem 0.8rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .badge::before {
      content: '';
      width: 8px;
      height: 8px;
      background: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--success);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      backdrop-filter: blur(12px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }
    .card-title {
      font-size: 0.85rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    .card-value {
      font-family: 'Outfit', sans-serif;
      font-size: 2.4rem;
      font-weight: 700;
      color: #fff;
    }
    .section-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.3rem;
      margin-bottom: 1rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card-bg);
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid var(--border);
    }
    th, td {
      padding: 1rem 1.2rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 0.9rem;
    }
    th {
      background: rgba(255, 255, 255, 0.03);
      color: var(--muted);
      font-weight: 600;
    }
    tr:last-child td { border-bottom: none; }
    .status-up { color: var(--success); font-weight: 600; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Whiteroom Pilot Telemetry</h1>
      <p style="color: var(--muted); font-size: 0.9rem; margin-top: 4px;">Live Monitoring Dashboard for 100-Student Pilot</p>
    </div>
    <div style="display: flex; gap: 1rem; align-items: center;">
      <div class="badge">LIVE RUNNING</div>
      <span id="uptime" style="font-size: 0.85rem; color: var(--muted);">Updating...</span>
    </div>
  </header>

  <div class="grid">
    <div class="card">
      <div class="card-title">Enrolled Students</div>
      <div class="card-value" id="val-students">-</div>
    </div>
    <div class="card">
      <div class="card-title">Total Active Accounts</div>
      <div class="card-value" id="val-users">-</div>
    </div>
    <div class="card">
      <div class="card-title">Attendance Sessions</div>
      <div class="card-value" id="val-attendance">-</div>
    </div>
    <div class="card">
      <div class="card-title">Announcements / Notices</div>
      <div class="card-value" id="val-announcements">-</div>
    </div>
    <div class="card">
      <div class="card-title">Chat Messages</div>
      <div class="card-value" id="val-messages">-</div>
    </div>
    <div class="card">
      <div class="card-title">Storage Files (G:\\ Drive)</div>
      <div class="card-value" id="val-files">-</div>
    </div>
  </div>

  <h2 class="section-title">Live System Activity & Audit Feed</h2>
  <table>
    <thead>
      <tr>
        <th>Action</th>
        <th>Resource</th>
        <th>Timestamp</th>
      </tr>
    </thead>
    <tbody id="audit-table">
      <tr><td colspan="3" style="text-align:center; color: var(--muted);">Loading feed...</td></tr>
    </tbody>
  </table>

  <script>
    async function fetchStats() {
      try {
        const res = await fetch('/api/v1/pilot-stats');
        const json = await res.json();
        if (!json.success) return;
        const d = json.data;
        document.getElementById('val-students').textContent = d.metrics.students;
        document.getElementById('val-users').textContent = d.metrics.totalUsers;
        document.getElementById('val-attendance').textContent = d.metrics.attendanceSessions;
        document.getElementById('val-announcements').textContent = d.metrics.announcements;
        document.getElementById('val-messages').textContent = d.metrics.chatMessages;
        document.getElementById('val-files').textContent = d.metrics.studyMaterials;
        document.getElementById('uptime').textContent = 'Uptime: ' + Math.floor(d.uptimeSeconds / 60) + ' min';

        const tbody = document.getElementById('audit-table');
        if (d.recentActivity && d.recentActivity.length > 0) {
          tbody.innerHTML = d.recentActivity.map(item => \`
            <tr>
              <td><strong>\${item.action}</strong></td>
              <td><span style="color: var(--primary);">\${item.resource}</span></td>
              <td style="color: var(--muted);">\${new Date(item.createdAt).toLocaleTimeString()}</td>
            </tr>
          \`).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--muted);">No recent audit actions logged yet.</td></tr>';
        }
      } catch (err) {
        console.error('Failed to fetch telemetry', err);
      }
    }

    fetchStats();
    setInterval(fetchStats, 5000); // Live refresh every 5 seconds
  </script>
</body>
</html>`;
  return c.html(html);
}
