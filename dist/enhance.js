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
      '<span class="kpi-label" id="kpi-title" style="font-weight:600;color:var(--text-primary)">📊 本月采购概况</span>' +
      '<div class="kpi-card" id="kpi-total">' +
        '<span class="kpi-label">本月任务</span>' +
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
      '<div class="kpi-card kpi-save" id="kpi-save">' +
        '<span class="kpi-label">💰 节约金额</span>' +
        '<span class="kpi-value" id="kv-save">—</span>' +
      '</div>' +
      '<div class="kpi-spacer"></div>' +
      '<button class="kpi-report-btn" id="kpi-report-btn">⚡ 快速生成月报</button>';
    return bar;
  }

  function updateKpiData(bar) {
    apiFetch('/api/items/summary', function (data) {
      if (!data) return;
      var m = data.monthly;
      // fall back to totals + byStatus for servers not yet updated
      if (!m) {
        if (!data.totals) return;
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
        bar.querySelector('#kv-save').textContent     = '—';
        return;
      }

      // Update title with month label
      var titleEl = bar.querySelector('#kpi-title');
      if (titleEl && m.period && m.period.label) {
        titleEl.textContent = '📊 ' + m.period.label + ' 采购概况';
      }

      bar.querySelector('#kv-total').textContent    = m.count || 0;
      bar.querySelector('#kv-done').textContent     = m.completedCount || 0;
      bar.querySelector('#kv-progress').textContent = m.inProgressCount || 0;
      bar.querySelector('#kv-overdue').textContent  = m.overdueCount || 0;
      bar.querySelector('#kv-est').textContent      = fmtMoney(m.estimatedAmount);
      bar.querySelector('#kv-save').textContent     = m.savedAmount > 0 ? fmtMoney(m.savedAmount) : '—';

      // 逾期数 > 0 时闪红
      var overdueCard = bar.querySelector('#kpi-overdue');
      if (m.overdueCount > 0) {
        overdueCard.style.background = 'rgba(255,69,58,.12)';
        overdueCard.style.border = '1px solid rgba(255,69,58,.3)';
      } else {
        overdueCard.style.background = '';
        overdueCard.style.border = '';
      }

      // 节约金额 > 0 时标绿
      var saveCard = bar.querySelector('#kpi-save');
      if (m.savedAmount > 0) {
        saveCard.style.background = 'rgba(52,199,89,.10)';
        saveCard.style.border = '1px solid rgba(52,199,89,.25)';
      } else {
        saveCard.style.background = '';
        saveCard.style.border = '';
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

  // ── 语音助手（MediaRecorder + Paraformer ASR + qwen-turbo）──────────────
  var voiceBtn = null;
  var voiceBtnShown = false;
  var mediaRec = null;
  var audioChunks = [];
  var voiceState = 'idle'; // 'idle' | 'recording' | 'processing'
  var voiceAutoStopTimer = null;

  var VOICE_ICONS = {
    idle: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    recording: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    processing: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
  };

  function injectVoiceStyles() {
    if (document.getElementById('voice-fab-style')) return;
    var s = document.createElement('style');
    s.id = 'voice-fab-style';
    s.textContent = [
      '@keyframes voice-spin{to{transform:rotate(360deg)}}',
      '@keyframes voice-fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
      '@keyframes voice-pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}50%{box-shadow:0 0 0 8px rgba(239,68,68,0)}}',
    ].join('');
    document.head.appendChild(s);
  }

  function buildVoiceBtn() {
    var btn = document.createElement('button');
    btn.id = 'voice-fab';
    btn.title = '语音指令';
    btn.style.cssText = [
      'position:fixed;bottom:80px;right:28px;z-index:9999',
      'width:46px;height:46px;border-radius:50%;border:none;cursor:pointer',
      'display:flex;align-items:center;justify-content:center',
      'background:#2563eb;color:#fff',
      'box-shadow:0 4px 16px rgba(37,99,235,.4)',
      'transition:background .15s,transform .15s',
    ].join(';');
    btn.innerHTML = VOICE_ICONS.idle;
    btn.onclick = handleVoiceClick;
    return btn;
  }

  function setVoiceBtnState(state) {
    voiceState = state;
    if (!voiceBtn) return;
    if (state === 'idle') {
      voiceBtn.style.background = '#2563eb';
      voiceBtn.style.transform = 'scale(1)';
      voiceBtn.style.animation = '';
      voiceBtn.innerHTML = VOICE_ICONS.idle;
    } else if (state === 'recording') {
      voiceBtn.style.background = '#ef4444';
      voiceBtn.style.transform = 'scale(1.08)';
      voiceBtn.style.animation = 'voice-pulse 1.2s ease infinite';
      voiceBtn.innerHTML = VOICE_ICONS.recording;
    } else if (state === 'processing') {
      voiceBtn.style.background = '#6b7280';
      voiceBtn.style.transform = 'scale(1)';
      voiceBtn.style.animation = '';
      voiceBtn.innerHTML = '<span style="display:inline-flex;animation:voice-spin 1s linear infinite">' + VOICE_ICONS.processing + '</span>';
    }
  }

  function showVoiceToast(msg, color) {
    var old = document.getElementById('voice-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.id = 'voice-toast';
    t.style.cssText = [
      'position:fixed;bottom:136px;right:28px;z-index:10000',
      'background:' + (color || '#1e293b') + ';color:#fff',
      'padding:9px 14px;border-radius:10px;font-size:13px;line-height:1.5',
      'box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:220px',
      'animation:voice-fadein .2s ease',
    ].join(';');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 3500);
  }

  function executeVoiceCommand(cmd) {
    if (cmd.error) { showVoiceToast('❌ ' + cmd.error, '#dc2626'); return; }
    var token = getToken();
    if (cmd.action === 'create') {
      var title = (cmd.title || '').trim() || '语音新建任务';
      var body = { title: title, priority: cmd.priority || 'MEDIUM' };
      if (cmd.dueDate && cmd.dueDate !== 'null') {
        try { body.dueDate = new Date(cmd.dueDate).toISOString(); } catch (e) {}
      }
      if (cmd.category && cmd.category !== 'null') body.category = cmd.category;
      if (cmd.description && cmd.description !== 'null') body.description = cmd.description;
      if (cmd.estimatedAmount != null && cmd.estimatedAmount !== 'null') body.estimatedAmount = cmd.estimatedAmount;
      if (cmd.supplierName && cmd.supplierName !== 'null') body.supplierName = cmd.supplierName;
      if (cmd.supplierAmount != null && cmd.supplierAmount !== 'null') body.supplierAmount = cmd.supplierAmount;
      fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body),
      }).then(function (r) {
        if (r.ok) showVoiceToast('✅ 已新建：' + title, '#16a34a');
        else showVoiceToast('❌ 新建失败，请重试', '#dc2626');
      }).catch(function () { showVoiceToast('❌ 网络错误', '#dc2626'); });
    } else if (cmd.action === 'update_status') {
      showVoiceToast('🎤 更新指令：' + (cmd.keyword || '') + ' → ' + (cmd.status || ''), '#2563eb');
    } else if (cmd.action === 'unknown') {
      showVoiceToast('🎤 未理解：' + (cmd.text || '请重新说'), '#6b7280');
    } else {
      showVoiceToast('🎤 ' + JSON.stringify(cmd), '#2563eb');
    }
  }

  function handleVoiceClick() {
    if (voiceState === 'processing') return;

    // 录音中：点击停止
    if (voiceState === 'recording') {
      clearTimeout(voiceAutoStopTimer);
      if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
      return;
    }

    if (!navigator.mediaDevices || !window.MediaRecorder) {
      showVoiceToast('❌ 当前浏览器不支持录音', '#dc2626');
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      audioChunks = [];
      var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                   : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                   : MediaRecorder.isTypeSupported('audio/mp4')  ? 'audio/mp4' : '';
      var opts = mimeType ? { mimeType: mimeType } : {};
      mediaRec = new MediaRecorder(stream, opts);
      var actualMime = (mediaRec.mimeType || mimeType || 'audio/webm').split(';')[0];

      mediaRec.ondataavailable = function (e) { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        setVoiceBtnState('processing');
        showVoiceToast('⏳ 识别中，请稍候…', '#6b7280');
        var blob = new Blob(audioChunks, { type: actualMime });
        var reader = new FileReader();
        reader.onload = function () {
          var b64 = reader.result.split(',')[1];
          var token = getToken();
          fetch('/api/voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ audio: b64, mimeType: actualMime }),
          }).then(function (r) { return r.json(); }).then(function (cmd) {
            setVoiceBtnState('idle');
            executeVoiceCommand(cmd);
          }).catch(function () {
            setVoiceBtnState('idle');
            showVoiceToast('❌ 识别失败，请重试', '#dc2626');
          });
        };
        reader.readAsDataURL(blob);
      };

      mediaRec.start();
      setVoiceBtnState('recording');
      showVoiceToast('🎤 录音中… 说完后再次点击', '#ef4444');
      // 30 秒自动停止
      voiceAutoStopTimer = setTimeout(function () {
        if (voiceState === 'recording' && mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
      }, 30000);
    }).catch(function () {
      showVoiceToast('❌ 无法访问麦克风，请检查权限', '#dc2626');
    });
  }

  function showVoiceBtn() {
    if (voiceBtnShown) return;
    var token = getToken();
    if (!token || isTokenExpired()) return;
    injectVoiceStyles();
    voiceBtn = buildVoiceBtn();
    document.body.appendChild(voiceBtn);
    voiceBtnShown = true;
  }

  function hideVoiceBtn() {
    clearTimeout(voiceAutoStopTimer);
    if (mediaRec && mediaRec.state !== 'inactive') { try { mediaRec.stop(); } catch (e) {} }
    mediaRec = null;
    if (voiceBtn) { voiceBtn.remove(); voiceBtn = null; }
    voiceBtnShown = false;
    voiceState = 'idle';
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
      hideVoiceBtn();
      return;
    }

    hideForgotLink();

    if (!loggedIn) {
      hideKpiBar();
      hideAdminBtn();
      hideVoiceBtn();
      return;
    }

    // 已登录且无登录表单：显示 KPI 栏、管理员按钮和语音按钮
    showKpiBar();
    showAdminBtn();
    showVoiceBtn();
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
