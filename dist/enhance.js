(function () {
  'use strict';

  // ── JWT 工具 ──────────────────────────────────────────────────────────────
  function getToken() {
    // 扫描 localStorage 找 JWT（格式：三段 base64 以 ey 开头）
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      var v = localStorage.getItem(k);
      if (v && typeof v === 'string' && v.startsWith('ey') && v.split('.').length === 3) return v;
    }
    return null;
  }

  function parseJwt(token) {
    try {
      var b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64));
    } catch (e) { return null; }
  }

  function getUserRole() {
    var token = getToken();
    if (!token) return null;
    var payload = parseJwt(token);
    return payload ? (payload.role || payload.user && payload.user.role || null) : null;
  }

  function isTokenExpired() {
    var token = getToken();
    if (!token) return true;
    var payload = parseJwt(token);
    if (!payload || !payload.exp) return false;
    return Date.now() / 1000 > payload.exp;
  }

  // ── API 调用 ──────────────────────────────────────────────────────────────
  function apiFetch(path, cb) {
    var token = getToken();
    if (!token || isTokenExpired()) { cb(null); return; }
    fetch(path, { headers: { 'Authorization': 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(cb)
      .catch(function () { cb(null); });
  }

  // ── 数字格式化 ────────────────────────────────────────────────────────────
  function fmtMoney(n) {
    if (!n || n === 0) return '—';
    if (n >= 1e8) return (n / 1e8).toFixed(1) + ' 亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
    return n.toLocaleString('zh-CN');
  }

  // ── KPI 统计栏 ────────────────────────────────────────────────────────────
  var kpiBar = null;
  var kpiShown = false;

  function buildKpiBar() {
    var bar = document.createElement('div');
    bar.id = 'kpi-bar';
    bar.innerHTML =
      '<span class="kpi-label" style="font-weight:600;color:var(--text-primary)">📊 采购概况</span>' +
      '<div class="kpi-card" id="kpi-total">' +
        '<span class="kpi-label">总任务</span>' +
        '<span class="kpi-value" id="kv-total">—</span>' +
      '</div>' +
      '<div class="kpi-card kpi-completed" id="kpi-done">' +
        '<span class="kpi-label">已完成</span>' +
        '<span class="kpi-value" id="kv-done">—</span>' +
      '</div>' +
      '<div class="kpi-card" id="kpi-progress">' +
        '<span class="kpi-label">进行中</span>' +
        '<span class="kpi-value" id="kv-progress">—</span>' +
      '</div>' +
      '<div class="kpi-card kpi-overdue" id="kpi-overdue">' +
        '<span class="kpi-label">⚠ 已逾期</span>' +
        '<span class="kpi-value" id="kv-overdue">—</span>' +
      '</div>' +
      '<div class="kpi-card kpi-amount" id="kpi-est">' +
        '<span class="kpi-label">预估金额</span>' +
        '<span class="kpi-value" id="kv-est">—</span>' +
      '</div>' +
      '<div class="kpi-spacer"></div>' +
      '<button class="kpi-report-btn" id="kpi-report-btn">⚡ 快速生成月报</button>';
    return bar;
  }

  function updateKpiData(bar) {
    apiFetch('/api/items/summary', function (data) {
      if (!data || !data.totals) return;
      var t = data.totals;
      var byStatus = data.byStatus || [];

      var doneCount = 0, progressCount = 0;
      byStatus.forEach(function (s) {
        if (s.status === 'COMPLETED')  doneCount    = s._count.id;
        if (s.status === 'IN_PROGRESS') progressCount = s._count.id;
      });

      bar.querySelector('#kv-total').textContent    = t.count || 0;
      bar.querySelector('#kv-done').textContent     = doneCount;
      bar.querySelector('#kv-progress').textContent = progressCount;
      bar.querySelector('#kv-overdue').textContent  = t.overdueCount || 0;
      bar.querySelector('#kv-est').textContent      = fmtMoney(t.estimatedAmount);

      // 逾期数 > 0 时闪红
      var overdueCard = bar.querySelector('#kpi-overdue');
      if (t.overdueCount > 0) {
        overdueCard.style.background = 'rgba(255,69,58,.12)';
        overdueCard.style.border = '1px solid rgba(255,69,58,.3)';
      } else {
        overdueCard.style.background = '';
        overdueCard.style.border = '';
      }
    });
  }

  function showKpiBar() {
    if (kpiShown) return;
    var token = getToken();
    if (!token || isTokenExpired()) return;

    kpiBar = buildKpiBar();

    // 月报按钮：跳转到系统内的报告生成页（路径视实际路由而定）
    kpiBar.querySelector('#kpi-report-btn').onclick = function () {
      // 尝试常见的报告路由，优先使用 pushState
      var reportPaths = ['/reports', '/report', '/dashboard/report'];
      var tried = false;
      for (var i = 0; i < reportPaths.length; i++) {
        if (window.location.pathname.startsWith(reportPaths[i])) { tried = true; break; }
      }
      if (!tried) {
        // 模拟点击侧边栏菜单中含"报告"文字的项
        var menuItems = document.querySelectorAll('.ant-menu-item, [role="menuitem"]');
        for (var j = 0; j < menuItems.length; j++) {
          if (menuItems[j].textContent.includes('报告') || menuItems[j].textContent.includes('Report')) {
            menuItems[j].click();
            return;
          }
        }
        // 后备：打开报告页
        window.location.href = '/reports';
      }
    };

    // 插到 #root 前面（body 子节点），避免 React 重渲染干扰
    var root = document.getElementById('root');
    if (root) {
      document.body.insertBefore(kpiBar, root);
    } else {
      document.body.insertBefore(kpiBar, document.body.firstChild);
    }

    kpiShown = true;
    updateKpiData(kpiBar);
  }

  function hideKpiBar() {
    if (kpiBar) { kpiBar.remove(); kpiBar = null; }
    kpiShown = false;
  }

  // 每 90 秒刷新一次数据
  setInterval(function () {
    if (kpiShown && kpiBar) updateKpiData(kpiBar);
  }, 90000);

  // ── 忘记密码浮层 ──────────────────────────────────────────────────────────
  var fpShown = false;

  function showForgotLink() {
    if (fpShown) return;
    if (!document.querySelector('input[type="password"]')) return;

    var el = document.createElement('div');
    el.id = 'fp-overlay';
    el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:center;padding:20px;pointer-events:none;z-index:9998';
    el.innerHTML = '<a href="/forgot-password" style="pointer-events:auto;font-size:13px;color:#2563eb;background:rgba(255,255,255,.96);backdrop-filter:blur(4px);padding:7px 20px;border-radius:20px;box-shadow:0 2px 12px rgba(0,0,0,.12);text-decoration:none;font-weight:500;border:1px solid #dbeafe;">忘记密码？</a>';
    document.body.appendChild(el);
    fpShown = true;
  }

  function hideForgotLink() {
    var el = document.getElementById('fp-overlay');
    if (el) { el.remove(); fpShown = false; }
  }

  // ── 管理员密码重置按钮 ────────────────────────────────────────────────────
  var adminBtnShown = false;

  function showAdminBtn() {
    if (adminBtnShown) return;
    var role = getUserRole();
    if (role !== 'ADMIN') return;

    var fab = document.createElement('button');
    fab.id = 'admin-reset-fab';
    fab.style.cssText = [
      'position:fixed;bottom:28px;right:28px;z-index:9999',
      'background:#2563eb;color:#fff;border:none;border-radius:10px',
      'padding:10px 18px;font-size:13px;font-weight:600;cursor:pointer',
      'box-shadow:0 4px 16px rgba(37,99,235,.4)',
      'display:flex;align-items:center;gap:8px;transition:background .15s',
    ].join(';');
    fab.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>密码管理';
    fab.onmouseenter = function () { this.style.background = '#1d4ed8'; };
    fab.onmouseleave = function () { this.style.background = '#2563eb'; };
    fab.onclick = function () { window.location.href = '/admin/users'; };
    document.body.appendChild(fab);
    adminBtnShown = true;
  }

  function hideAdminBtn() {
    var el = document.getElementById('admin-reset-fab');
    if (el) { el.remove(); adminBtnShown = false; }
  }

  // ── 路由检测与更新 ────────────────────────────────────────────────────────
  var lastPath = location.pathname;
  // 粘性标志：本次页面导航期间是否曾出现过密码框（防止"眼睛"切换 type 导致误判）
  var loginPageDetected = false;

  function tick() {
    var path = location.pathname;
    var token = getToken();
    var loggedIn = token && !isTokenExpired();

    // 路径变化时重置所有状态
    if (path !== lastPath) {
      hideForgotLink();
      loginPageDetected = false;
      lastPath = path;
    }

    // 只要检测到密码框，就把粘性标志设为 true（眼睛切换 type 后仍保持）
    if (document.querySelector('input[type="password"]')) {
      loginPageDetected = true;
    }

    // 登录表单消失（已跳转到主页面）：重置标志
    if (loginPageDetected && !document.querySelector('input[type="password"], input[type="text"]')) {
      loginPageDetected = false;
    }

    if (loginPageDetected) {
      showForgotLink();
      hideKpiBar();
      hideAdminBtn();
      return;
    }

    hideForgotLink();

    if (!loggedIn) {
      hideKpiBar();
      hideAdminBtn();
      return;
    }

    // 已登录且无登录表单：显示 KPI 栏和管理员按钮
    showKpiBar();
    showAdminBtn();
  }

  // 拦截 SPA 路由跳转
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () { orig.apply(this, arguments); setTimeout(tick, 100); };
  });
  window.addEventListener('popstate', tick);

  // 立即执行一次，再定期轮询（保证 React 渲染完成后也能检测到）
  setTimeout(tick, 300);
  setInterval(tick, 600);
})();
