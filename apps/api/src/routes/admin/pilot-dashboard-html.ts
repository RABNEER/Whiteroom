import type { Context } from "hono";

export function pilotDashboardHtmlHandler(c: Context) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Whiteroom — Pilot Live Telemetry Command Center</title>
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
              bg: '#080c14',
              surface: 'rgba(15, 23, 42, 0.6)',
              border: 'rgba(255, 255, 255, 0.08)',
              accent: '#38bdf8',
              accentLight: '#7dd3fc',
              success: '#4ade80',
              warning: '#fbbf24',
              text: '#f8fafc',
              muted: '#94a3b8'
            }
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #080c14;
      background-image: 
        radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.08) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(30, 41, 59, 0.8) 0px, transparent 50%);
    }
    .glass-card {
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    }
    .glow-hover:hover {
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.25);
      border-color: rgba(56, 189, 248, 0.4);
    }
    .pulse-live {
      box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
      animation: pulse 1.6s infinite;
    }
    @keyframes pulse {
      0% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7);
      }
      70% {
        transform: scale(1);
        box-shadow: 0 0 0 10px rgba(74, 222, 128, 0);
      }
      100% {
        transform: scale(0.95);
        box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
      }
    }
  </style>
</head>
<body class="text-brand-text font-sans min-height-screen p-4 md:p-8">

  <div class="max-w-7xl mx-auto space-y-8">
    
    <!-- ─── HEADER SECTION ─── -->
    <header class="flex flex-col md:flex-row md:justify-between md:align-items-center gap-4 border-b border-brand-border pb-6">
      <div>
        <div class="flex items-center gap-3">
          <span class="iconify text-brand-accent text-3xl" data-icon="solar:shield-up-bold-duotone"></span>
          <h1 class="font-outfit text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-brand-accent bg-clip-text text-transparent">
            Whiteroom Telemetry Command Center
          </h1>
        </div>
        <p class="text-brand-muted text-sm mt-1">Live Operational & Compliance Telemetry for the 100-Student Pilot Program</p>
      </div>
      
      <div class="flex items-center gap-4 self-start md:self-auto">
        <div class="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-brand-success text-xs font-semibold tracking-wider">
          <span class="w-2.5 h-2.5 rounded-full bg-brand-success pulse-live"></span>
          LIVE TELEMETRY
        </div>
        <div id="uptime" class="text-xs text-brand-muted font-medium bg-slate-800/40 px-3 py-1.5 rounded-lg border border-brand-border">
          Uptime: --
        </div>
      </div>
    </header>

    <!-- ─── PRIMARY METRICS GRID ─── -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      
      <!-- Students -->
      <div class="glass-card glow-hover p-5 rounded-2xl transition-all duration-300">
        <div class="flex items-center justify-between text-brand-muted mb-3">
          <span class="text-xs font-semibold tracking-wider uppercase">Enrolled Students</span>
          <span class="iconify text-brand-accent text-xl" data-icon="solar:users-group-two-rounded-bold-duotone"></span>
        </div>
        <div class="font-outfit text-3xl md:text-4xl font-bold text-white mb-2" id="val-students">-</div>
        <div class="text-xs text-brand-muted flex items-center gap-1">
          <span class="text-brand-success font-medium">100% Target</span>
          <span>pre-pilot ready</span>
        </div>
      </div>

      <!-- Total Platform Accounts -->
      <div class="glass-card glow-hover p-5 rounded-2xl transition-all duration-300">
        <div class="flex items-center justify-between text-brand-muted mb-3">
          <span class="text-xs font-semibold tracking-wider uppercase">Active Users</span>
          <span class="iconify text-brand-accent text-xl" data-icon="solar:user-bold-duotone"></span>
        </div>
        <div class="font-outfit text-3xl md:text-4xl font-bold text-white mb-2" id="val-users">-</div>
        <div class="text-xs text-brand-muted flex items-center gap-1">
          <span class="text-brand-accentLight font-medium" id="val-users-roles">0 Teachers | 0 Parents</span>
        </div>
      </div>

      <!-- Communications volume -->
      <div class="glass-card glow-hover p-5 rounded-2xl transition-all duration-300">
        <div class="flex items-center justify-between text-brand-muted mb-3">
          <span class="text-xs font-semibold tracking-wider uppercase">Secure Messages</span>
          <span class="iconify text-brand-accent text-xl" data-icon="solar:chat-line-bold-duotone"></span>
        </div>
        <div class="font-outfit text-3xl md:text-4xl font-bold text-white mb-2" id="val-messages">-</div>
        <div class="text-xs text-brand-muted flex items-center gap-1">
          <span class="text-brand-success font-medium">WhatsApp Sandboxed</span>
          <span>via DB pooler</span>
        </div>
      </div>

      <!-- Classroom Sessions & Announcements -->
      <div class="glass-card glow-hover p-5 rounded-2xl transition-all duration-300">
        <div class="flex items-center justify-between text-brand-muted mb-3">
          <span class="text-xs font-semibold tracking-wider uppercase">Daily Attendance</span>
          <span class="iconify text-brand-accent text-xl" data-icon="solar:check-square-bold-duotone"></span>
        </div>
        <div class="font-outfit text-3xl md:text-4xl font-bold text-white mb-2" id="val-attendance">-</div>
        <div class="text-xs text-brand-muted flex items-center gap-1">
          <span class="text-brand-success font-medium" id="val-announcements">0 bulletins</span>
          <span>published</span>
        </div>
      </div>

    </section>

    <!-- ─── DOUBLE COLUMN DETAIL VIEW ─── -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      <!-- Onboarded Schools & Institutions -->
      <div class="lg:col-span-1 space-y-6">
        <div>
          <h2 class="font-outfit text-lg font-semibold flex items-center gap-2 mb-1">
            <span class="iconify text-brand-accent" data-icon="solar:square-academic-cap-bold-duotone"></span>
            Onboarded Institutions
          </h2>
          <p class="text-xs text-brand-muted">Active pilot environments with secure sandboxing</p>
        </div>

        <div class="space-y-4" id="schools-list">
          <div class="glass-card p-4 rounded-xl text-center text-brand-muted py-8">
            Loading institutions...
          </div>
        </div>

        <!-- Compliance Check Card -->
        <div class="glass-card p-5 rounded-xl border border-sky-500/20 bg-sky-500/5">
          <div class="flex items-center gap-2 text-brand-accentLight font-semibold text-sm mb-2">
            <span class="iconify" data-icon="solar:shield-check-bold"></span>
            DPDP Act 2023 Compliant
          </div>
          <p class="text-xs text-brand-muted leading-relaxed">
            All sandbox communication channels, audit trails, and parental consents satisfy active DPDP data protection obligations for minors.
          </p>
        </div>
      </div>

      <!-- Live Activities Log -->
      <div class="lg:col-span-2 space-y-6">
        <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h2 class="font-outfit text-lg font-semibold flex items-center gap-2 mb-1">
              <span class="iconify text-brand-accent" data-icon="solar:history-bold-duotone"></span>
              Live System Activity & Audit Trail
            </h2>
            <p class="text-xs text-brand-muted font-sans">Verifiable real-time audit logs of the pilot</p>
          </div>
          
          <div class="relative min-w-[200px]">
            <span class="iconify absolute left-3 top-2.5 text-brand-muted" data-icon="solar:magnifer-linear"></span>
            <input 
              type="text" 
              id="search-activities" 
              placeholder="Filter actions or actors..."
              class="w-full bg-slate-900/60 border border-brand-border rounded-lg pl-9 pr-4 py-1.5 text-xs text-brand-text focus:outline-none focus:border-brand-accent"
            />
          </div>
        </div>

        <div class="glass-card rounded-2xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-900/40 text-brand-muted border-b border-brand-border text-xs uppercase font-semibold">
                  <th class="p-4">Actor</th>
                  <th class="p-4">Action</th>
                  <th class="p-4">Resource Target</th>
                  <th class="p-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody id="audit-table" class="text-xs font-sans">
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
        case 'super_admin': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
        case 'school_admin': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
        case 'teacher': return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
        case 'parent': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        default: return 'bg-slate-700/10 text-slate-400 border border-slate-700/20';
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
            <tr class="border-b border-brand-border/40 hover:bg-slate-800/20 transition-colors">
              <td class="p-4 font-medium">
                <div class="flex flex-col gap-1">
                  <span class="text-white font-semibold flex items-center gap-1.5">
                    \${displayActor}
                    <span class="text-[10px] text-brand-muted font-normal">\${cleanPhone}</span>
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-semibold self-start tracking-wider \${badgeClass}">
                    \${formattedRole}
                  </span>
                </div>
              </td>
              <td class="p-4">
                <span class="text-brand-accent font-semibold">\${item.action.replace('_', ' ').toUpperCase()}</span>
              </td>
              <td class="p-4 text-brand-muted font-mono font-medium">\${item.resource}</td>
              <td class="p-4 text-right text-brand-muted font-mono">\${new Date(item.createdAt).toLocaleTimeString()}</td>
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
        
        // Populate primary stats
        document.getElementById('val-students').textContent = d.metrics.students;
        document.getElementById('val-users').textContent = d.metrics.totalUsers;
        document.getElementById('val-messages').textContent = d.metrics.chatMessages;
        document.getElementById('val-attendance').textContent = d.metrics.attendanceSessions;
        
        const rb = d.metrics.rolesBreakdown || {};
        document.getElementById('val-users-roles').textContent = 
          \`\${rb.teacher || 0} Teachers | \${rb.parent || 0} Parents | \${rb.school_admin || 0} Admins\`;
        document.getElementById('val-announcements').textContent = 
          \`\${d.metrics.announcements || 0} notices & bulletins\`;
        
        document.getElementById('uptime').textContent = 
          'Uptime: ' + Math.floor(d.uptimeSeconds / 60) + ' min';

        // Render Schools / Tenants
        const schoolsDiv = document.getElementById('schools-list');
        if (d.activeSchools && d.activeSchools.length > 0) {
          schoolsDiv.innerHTML = d.activeSchools.map(school => \`
            <div class="glass-card glow-hover p-4 rounded-xl transition-all duration-300">
              <div class="flex justify-between items-start mb-2">
                <h3 class="font-outfit font-semibold text-white text-sm">\${school.name}</h3>
                <span class="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-brand-success border border-brand-success/20">ACTIVE</span>
              </div>
              <p class="text-xs text-brand-muted flex items-center gap-1.5 mb-1.5">
                <span class="iconify" data-icon="solar:pin-bold"></span>
                \${school.address || 'Address unconfigured'}
              </p>
              <div class="text-[10px] text-brand-muted font-mono flex justify-between">
                <span>Slug: /\${school.slug}</span>
                <span>Code: \${school.phone.slice(-4)}</span>
              </div>
            </div>
          \`).join('');
        } else {
          schoolsDiv.innerHTML = '<div class="glass-card p-4 rounded-xl text-center text-brand-muted text-xs">No active schools onboarded.</div>';
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

    // Set up search listener
    document.getElementById('search-activities').addEventListener('input', filterAndRenderActivities);

    fetchStats();
    setInterval(fetchStats, 5000); // Live refresh every 5 seconds
  </script>
</body>
</html>`;
  return c.html(html);
}

