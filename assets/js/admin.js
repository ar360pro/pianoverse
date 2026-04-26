/* =====================================================
   PianoVerse Admin JS
   Auth Guard | Charts | Data | Utilities
   ===================================================== */

'use strict';

// ─── Auth Guard ──────────────────────────────────
window.AdminAuth = (() => {
  const TOKEN_KEY = 'pv_admin_authenticated';
  const PERSIST_KEY = TOKEN_KEY + '_persist';
  const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 min

  let idleTimer = null;

  function getSession() {
    try {
      const s = sessionStorage.getItem(TOKEN_KEY);
      if (s) return JSON.parse(s);
      const p = localStorage.getItem(PERSIST_KEY);
      if (p) return JSON.parse(p);
      return null;
    } catch { return null; }
  }

  function requireAuth() {
    const session = getSession();
    if (!session) {
      window.location.href = 'admin-login.html';
      return null;
    }
    resetIdleTimer();
    return session;
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PERSIST_KEY);
    clearTimeout(idleTimer);
    window.location.href = 'admin-login.html';
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      AdminToast.show('Session expired due to inactivity.', 'warning');
      setTimeout(logout, 2000);
    }, IDLE_TIMEOUT);
  }

  ['mousemove','keydown','click','scroll'].forEach(ev => {
    document.addEventListener(ev, () => { if (getSession()) resetIdleTimer(); }, { passive: true });
  });

  return { requireAuth, logout, getSession };
})();

// ─── Admin Toast ─────────────────────────────────
window.AdminToast = (() => {
  function show(msg, type = 'info', duration = 3500) {
    let container = document.getElementById('adminToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'adminToastContainer';
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(container);
    }

    const colors = {
      info: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', icon: 'ℹ️' },
      success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: '✅' },
      error: { bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.3)', icon: '❌' },
      warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '⚠️' },
    };
    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
      display:flex;align-items:center;gap:10px;padding:12px 18px;
      background:${c.bg};border:1px solid ${c.border};
      border-radius:10px;font-size:0.84rem;font-family:var(--ad-font);
      color:var(--ad-text);box-shadow:0 6px 24px rgba(0,0,0,0.3);
      animation:slideToast 0.3s ease;max-width:320px;
      backdrop-filter:blur(10px);
    `;
    toast.innerHTML = `<span>${c.icon}</span><span>${msg}</span>`;
    container.appendChild(toast);

    const style = document.getElementById('toastStyle');
    if (!style) {
      const s = document.createElement('style');
      s.id = 'toastStyle';
      s.textContent = '@keyframes slideToast{from{transform:translateX(100%);opacity:0}to{transform:none;opacity:1}}';
      document.head.appendChild(s);
    }

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s,transform 0.3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return { show };
})();

// ─── Activity Logger ─────────────────────────────
window.AdminLogger = (() => {
  const LOG_KEY = 'pv_admin_log';

  function log(action, details = '', icon = '📋') {
    const logs = getLogs();
    logs.unshift({
      id: Date.now(),
      action,
      details,
      icon,
      user: AdminAuth.getSession()?.name || 'Admin',
      ts: new Date().toISOString(),
    });
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, 200)));
  }

  function getLogs() {
    try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch { return []; }
  }

  return { log, getLogs };
})();

// ─── Chart Helpers ───────────────────────────────
window.AdminCharts = (() => {
  // Generate realistic-looking data
  function generateDailyData(days = 30, base = 1000, variance = 0.3) {
    const data = [];
    let v = base;
    for (let i = 0; i < days; i++) {
      v = v * (1 + (Math.random() - 0.5) * variance);
      v = Math.max(base * 0.3, Math.min(base * 2, v));
      data.push(Math.round(v));
    }
    return data;
  }

  function getLast30DaysLabels() {
    const labels = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString('en', { month: 'short', day: 'numeric' }));
    }
    return labels;
  }

  function getLast7DaysLabels() {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      labels.push(days[d.getDay()]);
    }
    return labels;
  }

  function buildTrafficChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const labels = getLast30DaysLabels();
    const visitors = generateDailyData(30, 5000, 0.25);
    const sessions = visitors.map(v => Math.round(v * (0.6 + Math.random() * 0.3)));

    drawLineChart(ctx, canvas, labels, [
      { data: visitors, color: '#6366f1', label: 'Visitors', fill: true },
      { data: sessions, color: '#06b6d4', label: 'Sessions', fill: false },
    ]);
  }

  function buildWeeklyChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const labels = getLast7DaysLabels();
    const users = generateDailyData(7, 1200, 0.2);

    drawBarChart(ctx, canvas, labels, users, '#6366f1');
  }

  function buildDeviceChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    drawDonutChart(ctx, canvas,
      ['Desktop', 'Mobile', 'Tablet'],
      [52, 38, 10],
      ['#6366f1', '#06b6d4', '#8b5cf6']
    );
  }

  function buildLayoutChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    drawHBarChart(ctx, canvas,
      ['Classic 88','River Flows','Mini 25','Neon Glow','Aurora','Jazz 49'],
      [45200, 38100, 31500, 28700, 21300, 18900],
      '#6366f1'
    );
  }

  function buildRevenueChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const months = ['Jul','Aug','Sep','Oct','Nov','Dec'];
    const rev = [4200, 5100, 4800, 6200, 7400, 8200];
    drawBarChart(ctx, canvas, months, rev, '#10b981');
  }

  // ── Primitive Canvas Drawing ──────────────────
  function drawLineChart(ctx, canvas, labels, datasets, options = {}) {
    const W = canvas.width = canvas.offsetWidth * devicePixelRatio;
    const H = canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const pad = { top: 20, right: 20, bottom: 40, left: 50 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    const allValues = datasets.flatMap(d => d.data);
    const maxVal = Math.max(...allValues) * 1.1;
    const minVal = 0;

    // Grid lines
    const gridCount = 5;
    for (let i = 0; i <= gridCount; i++) {
      const y = pad.top + plotH - (i / gridCount) * plotH;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px Plus Jakarta Sans';
      ctx.textAlign = 'right';
      const val = Math.round((i / gridCount) * maxVal);
      ctx.fillText(val >= 1000 ? (val/1000).toFixed(1)+'k' : val, pad.left - 6, y + 4);
    }

    // X Labels
    const step = Math.ceil(labels.length / 8);
    labels.forEach((label, i) => {
      if (i % step !== 0 && i !== labels.length - 1) return;
      const x = pad.left + (i / (labels.length - 1)) * plotW;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, h - pad.bottom + 16);
    });

    // Datasets
    datasets.forEach(({ data, color, fill }) => {
      const points = data.map((v, i) => ({
        x: pad.left + (i / (data.length - 1)) * plotW,
        y: pad.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH,
      }));

      // Fill
      if (fill) {
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, color + '30');
        grad.addColorStop(1, color + '00');
        ctx.beginPath();
        ctx.moveTo(points[0].x, pad.top + plotH);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length-1].x, pad.top + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Line
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();

      // Dots
      points.forEach((p, i) => {
        if (i % Math.ceil(data.length / 10) !== 0) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(13,15,26,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    });
  }

  function drawBarChart(ctx, canvas, labels, data, color) {
    const W = canvas.width = canvas.offsetWidth * devicePixelRatio;
    const H = canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const pad = { top: 20, right: 20, bottom: 40, left: 50 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);
    const maxVal = Math.max(...data) * 1.1;

    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + plotH - (i / 4) * plotH;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px Plus Jakarta Sans';
      ctx.textAlign = 'right';
      const val = Math.round((i/4)*maxVal);
      ctx.fillText(val >= 1000 ? (val/1000).toFixed(1)+'k' : val, pad.left - 6, y + 4);
    }

    const barW = (plotW / data.length) * 0.6;
    const barGap = (plotW / data.length) * 0.4;

    data.forEach((v, i) => {
      const x = pad.left + i * (plotW / data.length) + barGap / 2;
      const barH = (v / maxVal) * plotH;
      const y = pad.top + plotH - barH;

      // Gradient bar
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + '60');
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barW / 2, h - pad.bottom + 16);
    });
  }

  function drawDonutChart(ctx, canvas, labels, values, colors) {
    const W = canvas.width = canvas.offsetWidth * devicePixelRatio;
    const H = canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    const total = values.reduce((a, b) => a + b, 0);
    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(w, h) * 0.38;
    const innerR = outerR * 0.6;
    let startAngle = -Math.PI / 2;

    values.forEach((v, i) => {
      const angle = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, startAngle + angle);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
      startAngle += angle;
    });

    // Inner circle (donut hole)
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = 'var(--ad-card, #111422)';
    ctx.fill();

    // Center label
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `bold 18px Plus Jakarta Sans`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total + '%', cx, cy);

    // Legend
    const legendY = h - 20;
    labels.forEach((label, i) => {
      const x = (i / labels.length) * w + 20;
      ctx.fillStyle = colors[i];
      ctx.fillRect(x, legendY - 6, 10, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '10px Plus Jakarta Sans';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${label} ${values[i]}%`, x + 14, legendY + 2);
    });
  }

  function drawHBarChart(ctx, canvas, labels, data, color) {
    const W = canvas.width = canvas.offsetWidth * devicePixelRatio;
    const H = canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const pad = { top: 10, right: 20, bottom: 10, left: 90 };

    ctx.clearRect(0, 0, w, h);
    const maxVal = Math.max(...data);
    const rowH = (h - pad.top - pad.bottom) / data.length;

    data.forEach((v, i) => {
      const y = pad.top + i * rowH + rowH * 0.15;
      const barH = rowH * 0.65;
      const barW = (v / maxVal) * (w - pad.left - pad.right);

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '10px Plus Jakarta Sans';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], pad.left - 8, y + barH / 2);

      // Background track
      ctx.beginPath();
      ctx.roundRect(pad.left, y, w - pad.left - pad.right, barH, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();

      // Bar
      const grad = ctx.createLinearGradient(pad.left, 0, pad.left + barW, 0);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + 'aa');
      ctx.beginPath();
      ctx.roundRect(pad.left, y, barW, barH, 3);
      ctx.fillStyle = grad;
      ctx.fill();

      // Value
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'left';
      const formatted = v >= 1000 ? (v/1000).toFixed(1) + 'k' : v;
      ctx.fillText(formatted, pad.left + barW + 6, y + barH / 2);
    });
  }

  return { buildTrafficChart, buildWeeklyChart, buildDeviceChart, buildLayoutChart, buildRevenueChart, generateDailyData, getLast30DaysLabels, getLast7DaysLabels };
})();

// ─── Admin Sidebar Setup ─────────────────────────
window.AdminUI = (() => {
  function initSidebar() {
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (mobileBtn) {
      mobileBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
      });
    }

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      const saved = localStorage.getItem('pv_admin_theme') || 'dark';
      document.documentElement.setAttribute('data-theme', saved);
      themeBtn.textContent = saved === 'dark' ? '☀️' : '🌙';
      
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('pv_admin_theme', next);
        themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
        AdminLogger.log('Theme changed', `Switched to ${next} mode`, '🎨');
      });
    }

    // Logout
    document.querySelectorAll('.admin-logout-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to log out?')) {
          AdminLogger.log('Logout', 'Admin signed out', '🚪');
          AdminAuth.logout();
        }
      });
    });
  }

  function setActiveNav(page) {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });
  }

  function showModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('open'); }
  }

  function hideModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('open'); }
  }

  function confirm(msg) {
    return window.confirm(msg);
  }

  return { initSidebar, setActiveNav, showModal, hideModal, confirm };
})();

// ─── Data Export Utilities ───────────────────────
window.AdminExport = (() => {
  function toCSV(data, filename) {
    if (!data.length) return;
    const keys = Object.keys(data[0]);
    const rows = [keys.join(','), ...data.map(row => keys.map(k => `"${row[k] ?? ''}"`).join(','))];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
    AdminToast.show('CSV exported successfully!', 'success');
    AdminLogger.log('Export CSV', filename, '📤');
  }

  function toPDF(title, content) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>${title}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#111;}
      h1{color:#6366f1;}table{width:100%;border-collapse:collapse;}
      th,td{padding:8px 12px;border:1px solid #ddd;text-align:left;}
      th{background:#f4f4f4;}</style></head>
      <body><h1>${title}</h1>${content}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
    AdminLogger.log('Export PDF', title, '📄');
  }

  return { toCSV, toPDF };
})();

// ─── Session Monitor ─────────────────────────────
window.AdminSession = (() => {
  function getInfo() {
    const session = AdminAuth.getSession();
    if (!session) return null;
    return {
      ...session,
      duration: Date.now() - (session.loginTime || Date.now()),
      browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other',
      online: navigator.onLine,
    };
  }
  return { getInfo };
})();
