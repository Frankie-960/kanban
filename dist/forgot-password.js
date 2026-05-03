var form = document.getElementById('form');
var btn = document.getElementById('btn');
var successEl = document.getElementById('alert-success');
var errorEl = document.getElementById('alert-error');

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  var email = document.getElementById('email').value.trim();
  if (!email) return;

  btn.disabled = true;
  btn.textContent = '发送中…';
  successEl.style.display = 'none';
  errorEl.style.display = 'none';

  try {
    var res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    });
    if (res.ok) {
      form.style.display = 'none';
      successEl.style.display = 'block';
    } else {
      var data = await res.json();
      errorEl.textContent = data.error || '发送失败，请稍后重试';
      errorEl.style.display = 'block';
    }
  } catch {
    errorEl.textContent = '网络错误，请检查连接后重试';
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '发送重置链接';
  }
});
