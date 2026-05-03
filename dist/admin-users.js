var authToken = null;
var allUsers   = [];

// 兼容 enhance.js 的多 key 扫描策略
function findToken() {
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    var v = localStorage.getItem(k);
    if (v && typeof v === 'string' && v.startsWith('ey') && v.split('.').length === 3) return v;
  }
  return null;
}

async function tryAutoLogin() {
  var t = findToken();
  if (!t) return false;
  try {
    var res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } });
    if (!res.ok) return false;
    var me = await res.json();
    if (me.role !== 'ADMIN') return false;
    authToken = t;
    document.getElementById('current-user-email').textContent = me.email;
    return true;
  } catch { return false; }
}

async function init() {
  var ok = await tryAutoLogin();
  if (ok) {
    showMain();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
}

document.getElementById('login-form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var errEl = document.getElementById('login-error');
  var btn   = document.getElementById('login-btn');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> 登录中…';

  try {
    var res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value,
      }),
    });
    var data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || '登录失败'; errEl.style.display = 'block'; return; }
    if (data.user.role !== 'ADMIN') { errEl.textContent = '该账号没有管理员权限'; errEl.style.display = 'block'; return; }
    authToken = data.token;
    document.getElementById('current-user-email').textContent = data.user.email;
    document.getElementById('login-screen').style.display = 'none';
    showMain();
  } catch {
    errEl.textContent = '网络错误，请重试'; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = '登录';
  }
});

document.getElementById('logout-btn').addEventListener('click', function () {
  authToken = null;
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
});

async function showMain() {
  document.getElementById('main-screen').style.display = 'block';
  await loadUsers();
}

// ── 搜索 ──────────────────────────────────────────────────────────────────
document.getElementById('user-search').addEventListener('input', function () {
  renderUsers(allUsers, this.value.trim().toLowerCase());
});

async function loadUsers() {
  var tbody = document.getElementById('user-list');
  var errEl = document.getElementById('main-error');
  var countEl = document.getElementById('user-count');
  tbody.innerHTML = '<tr><td colspan="5" class="empty">加载中…</td></tr>';
  errEl.style.display = 'none';

  try {
    // 并行拉取用户列表和部门列表（用于显示部门名）
    var [usersRes, deptsRes] = await Promise.all([
      fetch('/api/auth/users',    { headers: { Authorization: 'Bearer ' + authToken } }),
      fetch('/api/departments',   { headers: { Authorization: 'Bearer ' + authToken } }),
    ]);
    if (!usersRes.ok) throw new Error('获取用户列表失败');
    var users = await usersRes.json();
    var depts  = deptsRes.ok ? await deptsRes.json() : [];

    // 建立 deptId → name 映射
    var deptMap = {};
    depts.forEach(function (d) { deptMap[d.id] = d.name; });

    // 把部门名挂到 user 上
    allUsers = users.map(function (u) {
      return Object.assign({}, u, { deptName: u.departmentId ? (deptMap[u.departmentId] || u.departmentId.slice(0, 8) + '…') : '—' });
    });

    countEl.textContent = allUsers.length + ' 名用户';
    renderUsers(allUsers, document.getElementById('user-search').value.trim().toLowerCase());
  } catch (err) {
    errEl.textContent = err.message; errEl.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="5" class="empty">加载失败</td></tr>';
  }
}

function renderUsers(users, keyword) {
  var tbody   = document.getElementById('user-list');
  var countEl = document.getElementById('user-count');
  var filtered = keyword
    ? users.filter(function (u) {
        return esc(u.name).toLowerCase().includes(keyword)
            || u.email.toLowerCase().includes(keyword)
            || (u.deptName && u.deptName.toLowerCase().includes(keyword));
      })
    : users;

  countEl.textContent = filtered.length + (keyword ? ' / ' + users.length : '') + ' 名用户';

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">' + (keyword ? '无匹配用户' : '暂无用户') + '</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function (u) {
    return '<tr>'
      + '<td><strong>' + esc(u.name) + '</strong></td>'
      + '<td style="color:#64748b">' + esc(u.email) + '</td>'
      + '<td><span class="role-badge role-' + u.role + '">' + roleLabel(u.role) + '</span></td>'
      + '<td style="color:#64748b;font-size:13px">' + esc(u.deptName) + '</td>'
      + '<td style="text-align:right"><button class="btn-sm btn-warn" onclick="resetPassword(\'' + u.id + '\',\'' + esc(u.name) + '\')">重置密码</button></td>'
      + '</tr>';
  }).join('');
}

async function resetPassword(userId, userName) {
  if (!confirm('确认要重置「' + userName + '」的密码吗？该用户登录后需立即修改密码。')) return;
  try {
    var res = await fetch('/api/auth/users/' + userId + '/reset-password', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: '{}',
    });
    var data = await res.json();
    if (!res.ok) { alert('重置失败：' + (data.error || '未知错误')); return; }
    showModal(userName, data.tempPassword);
  } catch {
    alert('网络错误，请重试');
  }
}

function showModal(name, pass) {
  document.getElementById('modal-name').textContent = name;
  document.getElementById('modal-pass').textContent = pass;
  document.getElementById('modal').style.display = 'flex';
}

document.getElementById('modal-close').addEventListener('click', function () {
  document.getElementById('modal').style.display = 'none';
});
document.getElementById('copy-btn').addEventListener('click', function () {
  var pass = document.getElementById('modal-pass').textContent;
  navigator.clipboard.writeText(pass).then(function () {
    var btn = document.getElementById('copy-btn');
    btn.textContent = '已复制 ✓'; btn.style.background = '#d1fae5'; btn.style.color = '#065f46';
    setTimeout(function () { btn.textContent = '复制密码'; btn.style.background = ''; btn.style.color = ''; }, 2000);
  });
});
document.getElementById('modal').addEventListener('click', function (e) {
  if (e.target === document.getElementById('modal')) document.getElementById('modal').style.display = 'none';
});

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function roleLabel(r) {
  return { ADMIN: '管理员', DEPARTMENT_ADMIN: '部门管理员', MEMBER: '成员' }[r] || r;
}

init();
