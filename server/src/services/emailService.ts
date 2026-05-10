import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587'),
    secure: parseInt(SMTP_PORT || '587') === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendEmail(opts: EmailOptions): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) {
    // SMTP not configured — log so admins can act manually in development
    console.log(`[Email] SMTP 未配置，模拟发送:\n  To: ${opts.to}\n  Subject: ${opts.subject}\n  Body: ${opts.text.slice(0, 120)}...`);
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"采购工作站" <${process.env.SMTP_USER}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return true;
  } catch (err) {
    console.error('[Email] 发送失败:', err);
    return false;
  }
}

export function buildPasswordResetEmail(name: string, resetUrl: string): EmailOptions {
  return {
    subject: '采购工作站 — 密码重置请求',
    text: `您好 ${name}，\n\n请点击以下链接重置您的密码（链接 1 小时内有效）：\n\n${resetUrl}\n\n如果您没有发起此请求，请忽略此邮件，您的密码不会被更改。`,
    html: `<p>您好 <strong>${name}</strong>，</p>
<p>请点击以下按钮重置您的密码（链接 <strong>1 小时</strong>内有效）：</p>
<p><a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">重置密码</a></p>
<p>或复制以下链接到浏览器：<br/>${resetUrl}</p>
<p style="color:#6b7280;font-size:12px;">如果您没有发起此请求，请忽略此邮件。</p>`,
    to: '',
  };
}

export function buildReminderEmail(
  userName: string,
  itemTitle: string,
  dueDate: Date | null
): EmailOptions {
  const dueDateStr = dueDate
    ? `截止日期：${dueDate.toLocaleDateString('zh-CN')}`
    : '';

  return {
    subject: `📌 任务提醒：${itemTitle}`,
    text: `您好 ${userName}，\n\n您设置的任务提醒已到期：\n\n任务：${itemTitle}\n${dueDateStr}\n\n请登录采购工作站查看详情。`,
    html: `<p>您好 <strong>${userName}</strong>，</p>
<p>您设置的任务提醒已到期：</p>
<table style="border-collapse:collapse;margin:12px 0;">
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">任务</td><td><strong>${itemTitle}</strong></td></tr>
  ${dueDate ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">截止日期</td><td>${dueDate.toLocaleDateString('zh-CN')}</td></tr>` : ''}
</table>
<p>请登录采购工作站查看详情。</p>`,
    to: '',
  };
}
