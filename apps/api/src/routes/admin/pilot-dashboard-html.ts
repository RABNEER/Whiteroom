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
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://code.iconify.design/3/3.1.0/iconify.min.js"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            outfit: ['Outfit', 'sans-serif'],
            sans: ['Plus Jakarta Sans', 'sans-serif'],
          },
          colors: {
            brand: {
              primary: '#4f46e5',     /* Indigo */
              primaryLight: '#818cf8',
              bg: '#f8fafc',          /* Slate 50 */
              card: '#ffffff',
              border: '#e2e8f0',      /* Slate 200 */
              text: '#0f172a',        /* Slate 900 */
              muted: '#64748b'        /* Slate 500 */
            }
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #f8fafc;
      background-image: 
        radial-gradient(at 0% 0%, rgba(79, 70, 229, 0.05) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(99, 102, 241, 0.05) 0px, transparent 50%);
    }
    .custom-shadow {
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.01), 0 20px 25px -5px rgba(0, 0, 0, 0.05);
    }
  </style>
</head>
<body class="text-brand-text font-sans min-h-screen p-4 md:p-8">

  <div class="max-w-7xl mx-auto space-y-8">
    
    <!-- ─── HEADER SECTION ─── -->
    <header class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 pb-6 border-b border-brand-border">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="iconify text-brand-primary text-3xl" data-icon="solar:shield-check-bold-duotone"></span>
          <h1 class="font-outfit text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
            Whiteroom Telemetry Control
          </h1>
        </div>
        <p class="text-brand-muted text-sm font-medium">Live pilot telemetry report for district administration & incubator review</p>
      </div>
      
      <div class="flex items-center gap-3 self-start sm:self-auto">
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Active Telemetry Connection
        </div>
        <div id="uptime" class="text-xs text-brand-muted font-medium bg-white px-3 py-1.5 rounded-lg border border-brand-border shadow-sm">
          Uptime: --
        </div>
      </div>
    </header>

    <!-- ─── PRIMARY METRICS GRID ─── -->
    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      
      <!-- Students Onboarded -->
      <div class="bg-brand-card custom-shadow p-6 rounded-2xl border border-brand-border hover:border-brand-primary/30 transition-all">
        <div class="flex items-center justify-between text-brand-muted mb-4">
          <span class="text-xs font-bold tracking-wider uppercase text-slate-500">Student Rollout</span>
          <span class="p-2 rounded-lg bg-indigo-50 text-brand-primary">
            <span class="iconify text-xl" data-icon="solar:users-group-two-rounded-bold-duotone"></span>
          </span>
        </div>
        <div class="font-outfit text-4xl font-bold text-slate-900 mb-2" id="val-students">-</div>
        
        <!-- Onboarding Progress Bar -->
        <div class="w-full bg-slate-100 rounded-full h-2 mb-2">
          <div id="progress-bar-students" class="bg-brand-primary h-2 rounded-full transition-all duration-500" style="width: 0%"></div>
        </div>
        <div class="text-xs text-brand-muted flex justify-between">
          <span>Target: 100 students</span>
          <span id="percent-students" class="font-semibold text-brand-primary">0%</span>
        </div>
      </div>

      <!-- Active Users Breakdown -->
      <div class="bg-brand-card custom-shadow p-6 rounded-2xl border border-brand-border hover:border-brand-primary/30 transition-all">
        <div class="flex items-center justify-between text-brand-muted mb-4">
          <span class="text-xs font-bold tracking-wider uppercase text-slate-500">Active Accounts</span>
          <span class="p-2 rounded-lg bg-sky-50 text-sky-600">
            <span class="iconify text-xl" data-icon="solar:user-bold-duotone"></span>
          </span>
        </div>
        <div class="font-outfit text-4xl font-bold text-slate-900 mb-2" id="val-users">-</div>
        <div class="text-xs text-brand-muted font-medium truncate" id="val-users-roles">
          0 Teachers | 0 Parents
        </div>
      </div>

      <!-- Messages Volume -->
      <div class="bg-brand-card custom-shadow p-6 rounded-2xl border border-brand-border hover:border-brand-primary/30 transition-all">
        <div class="flex items-center justify-between text-brand-muted mb-4">
          <span class="text-xs font-bold tracking-wider uppercase text-slate-500">Secure Messages</span>
          <span class="p-2 rounded-lg bg-emerald-50 text-emerald-600">
            <span class="iconify text-xl" data-icon="solar:chat-line-bold-duotone"></span>
          </span>
        </div>
        <div class="font-outfit text-4xl font-bold text-slate-900 mb-2" id="val-messages">-</div>
        <div class="text-xs text-brand-muted flex items-center gap-1 font-medium">
          <span class="text-emerald-600">WhatsApp Sandboxed</span>
        </div>
      </div>

      <!-- Attendance & Announcements -->
      <div class="bg-brand-card custom-shadow p-6 rounded-2xl border border-brand-border hover:border-brand-primary/30 transition-all">
        <div class="flex items-center justify-between text-brand-muted mb-4">
          <span class="text-xs font-bold tracking-wider uppercase text-slate-500">Attendance Pushes</span>
          <span class="p-2 rounded-lg bg-amber-50 text-amber-600">
            <span class="iconify text-xl" data-icon="solar:check-square-bold-duotone"></span>
          </span>
        </div>
        <div class="font-outfit text-4xl font-bold text-slate-900 mb-2" id="val-attendance">-</div>
        <div class="text-xs text-brand-muted flex items-center gap-1 font-medium" id="val-announcements">
          0 notices published
        </div>
      </div>

    </section>

    <!-- ─── DOUBLE COLUMN DETAIL VIEW ─── -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      <!-- Left Column: Schools & Compliance -->
      <div class="lg:col-span-1 space-y-6">
        <div>
          <h2 class="font-outfit text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
            <span class="iconify text-brand-primary" data-icon="solar:square-academic-cap-bold-duotone"></span>
            Participating Schools
          </h2>
          <p class="text-xs text-brand-muted font-medium">Verified tenant workspaces active in the pre-pilot</p>
        </div>

        <div class="space-y-4" id="schools-list">
          <div class="bg-white p-6 rounded-xl border border-brand-border text-center text-brand-muted">
            Onboarding institutions...
          </div>
        </div>

        <!-- Compliance Check Card -->
        <div class="bg-indigo-50/50 p-6 rounded-xl border border-brand-primary/10">
          <div class="flex items-center gap-2 text-brand-primary font-bold text-sm mb-2">
            <span class="iconify text-lg" data-icon="solar:shield-keyhole-bold-duotone"></span>
            Compliance & Legal Scoping
          </div>
          <p class="text-xs text-slate-600 leading-relaxed font-medium">
            This platform strictly operates under the guidelines of the <strong>DPDP Act 2023</strong>. Personal Identifiable Information (PII) of minors is sandboxed and only shared with verified legal guardians.
          </p>
        </div>
      </div>

      <!-- Right Column: Audit Log Feed -->
      <div class="lg:col-span-2 space-y-6">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h2 class="font-outfit text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
              <span class="iconify text-brand-primary" data-icon="solar:history-bold-duotone"></span>
              Pilot Activity Feed
            </h2>
            <p class="text-xs text-brand-muted font-medium">Real-time log of security events and user interactions</p>
          </div>
          
          <div class="relative">
            <span class="iconify absolute left-3 top-2.5 text-brand-muted" data-icon="solar:magnifer-linear"></span>
            <input 
              type="text" 
              id="search-activities" 
              placeholder="Search actors, roles, or actions..."
              class="w-full sm:w-64 bg-white border border-brand-border rounded-lg pl-9 pr-4 py-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary shadow-sm"
            />
          </div>
        </div>

        <div class="bg-brand-card custom-shadow rounded-2xl border border-brand-border overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-50 text-slate-500 border-b border-brand-border text-xs uppercase font-bold tracking-wider">
                  <th class="p-4">User</th>
                  <th class="p-4">Action Event</th>
                  <th class="p-4">Resource Scope</th>
                  <th class="p-4 text-right">Time</th>
                </tr>
              </thead>
              <tbody id="audit-table" class="text-xs font-medium text-slate-700 divide-y divide-slate-100">
                <tr>
                  <td colspan="4" class="p-8 text-center text-brand-muted">Loading live activity feed...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>

  </div>

  <script>
    let rawActivity = [];

    function getRoleBadgeClass(role) {
      switch(role.toLowerCase()) {
        case 'super_admin': return 'bg-rose-50 text-rose-700 border border-rose-100';
        case 'school_admin': return 'bg-amber-50 text-amber-700 border border-amber-100';
        case 'teacher': return 'bg-indigo-50 text-indigo-700 border border-indigo-100';
        case 'parent': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
        default: return 'bg-slate-50 text-slate-600 border border-slate-100';
      }
    }

    function renderAuditTable(filteredLogs) {
      const tbody = document.getElementById('audit-table');
      if (filteredLogs && filteredLogs.length > 0) {
        tbody.innerHTML = filteredLogs.map(item => {
          const badgeClass = getRoleBadgeClass(item.role);
          const formattedRole = item.role.replace('_', ' ').toUpperCase();
          const cleanPhone = item.actorPhone ? ' (' + item.actorPhone.slice(-4) + ')' : '';
          const displayActor = item.actorName ? item.actorName : (item.actor || 'System');
          
          return \`
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="p-4">
                <div class="flex flex-col gap-1">
                  <span class="text-slate-900 font-bold flex items-center gap-1.5">
                    \${displayActor}
                    <span class="text-[10px] text-slate-400 font-normal">\${cleanPhone}</span>
                  </span>
                  <span class="px-2.5 py-0.5 rounded-full text-[9px] font-bold self-start tracking-wider \${badgeClass}">
                    \${formattedRole}
                  </span>
                </div>
              </td>
              <td class="p-4">
                <span class="text-slate-900 font-semibold">\${item.action.replace(/_/g, ' ').toUpperCase()}</span>
              </td>
              <td class="p-4 text-slate-500 font-mono font-medium">\${item.resource}</td>
              <td class="p-4 text-right text-slate-400 font-mono">\${new Date(item.createdAt).toLocaleTimeString()}</td>
            </tr>
          \`;
        }).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-brand-muted">No matching audit logs found.</td></tr>';
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
        
        // Update rollout progress bar
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
          schoolsDiv.innerHTML = d.activeSchools.map(school => \`
            <div class="bg-brand-card p-5 rounded-2xl border border-brand-border custom-shadow hover:border-brand-primary/30 transition-all">
              <div class="flex justify-between items-start mb-2">
                <h3 class="font-outfit font-bold text-slate-900 text-sm">\${school.name}</h3>
                <span class="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">ONBOARDED</span>
              </div>
              <p class="text-xs text-brand-muted flex items-center gap-1.5 mb-2 font-medium">
                <span class="iconify" data-icon="solar:pin-bold"></span>
                \${school.address || 'Address unconfigured'}
              </p>
              <div class="text-[10px] text-brand-muted font-mono flex justify-between border-t border-slate-100 pt-2">
                <span>Domain: /\${school.slug}</span>
                <span>Owner Phone: \${school.phone.slice(0, 3)}***\${school.phone.slice(-3)}</span>
              </div>
            </div>
          \`).join('');
        } else {
          schoolsDiv.innerHTML = '<div class="bg-white p-4 rounded-xl text-center text-brand-muted text-xs">No active schools onboarded.</div>';
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


