const params = new URLSearchParams(location.search);
const token = params.get('token');
const invalidEl = document.getElementById('alert-invalid');
const successEl = document.getElementById('alert-success');
const errorEl   = document.getElementById('alert-error');
const mainEl    = document.getElementById('main');
const backLink  = document.getElementById('back-link');

if (!token) {
  invalidEl.textContent = '链接无效：缺少重置凭证，请重新申请密码重置。';
  backLink.style.display = 'block';
} else {
  invalidEl.textContent = '正在验证重置链接…';
  setTimeout(function () {
    invalidEl.style.display = 'none';
    mainEl.style.display = 'block';
  }, 400);
}

document.getElementById('password').addEventListener('input', function () {
  var val = this.value;
  var bar = document.getElementById('strength-bar');
  var txt = document.getElementById('strength-text');
  if (val.length === 0) {
    bar.style.width = '0'; bar.style.background = '#e2e8f0'; txt.textContent = '请输入密码'; return;
  }
  var score = 0;
  if (val.length >= 6) score++;
  if (val.length >= 10) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  var levels = [
    { pct: '20%', color: '#ef4444', label: '太短' },
    { pct: '40%', color: '#f97316', label: '弱' },
    { pct: '60%', color: '#eab308', label: '一般' },
    { pct: '80%', color: '#22c55e', label: '较强' },
    { pct: '100%', color: '#16a34a', label: '强' },
  ];
  var lvl = levels[Math.min(score - 1, 4)] || levels[0];
  bar.style.width = lvl.pct; bar.style.background = lvl.color;
  txt.textContent = '密码强度：' + lvl.label;
});

document.getElementById('form').addEventListener('submit', async function (e) {
  e.preventDefault();
  var password = document.getElementById('password').value;
  var confirm  = document.getElementById('confirm').value;
  var btn = document.getElementById('btn');
  errorEl.style.display = 'none';

  if (password !== confirm) {
    errorEl.textContent = '两次输入的密码不一致'; errorEl.style.display = 'block'; return;
  }
  if (password.length < 6) {
    errorEl.textContent = '密码至少需要 6 位字符'; errorEl.style.display = 'block'; return;
  }

  btn.disabled = true; btn.textContent = '提交中…';
  try {
    var res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, newPassword: password }),
    });
    var data = await res.json();
    if (res.ok) {
      mainEl.style.display = 'none';
      successEl.innerHTML = '密码修改成功！<span class="countdown" id="cd">3</span> 秒后自动跳转登录页…';
      successEl.style.display = 'block';
      backLink.style.display = 'block';
      var s = 3;
      var iv = setInterval(function () {
        s--;
        document.getElementById('cd').textContent = s;
        if (s <= 0) { clearInterval(iv); location.href = '/'; }
      }, 1000);
    } else {
      errorEl.textContent = data.error || '重置失败，链接可能已过期，请重新申请';
      errorEl.style.display = 'block';
      if (res.status === 400) backLink.style.display = 'block';
    }
  } catch {
    errorEl.textContent = '网络错误，请检查连接后重试';
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = '确认修改';
  }
});
