import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail, buildReminderEmail } from './emailService';

function calcNextRemindAt(current: Date, pattern: string | null): Date {
  const now = new Date();
  const next = new Date(current);
  const pat = (pattern || 'DAILY').toUpperCase();

  // Skip-ahead: keep incrementing until we land in the future.
  // Prevents email spam after a server restart that missed multiple intervals.
  do {
    switch (pat) {
      case 'WEEKLY':
        next.setDate(next.getDate() + 7);
        break;
      case 'MONTHLY':
        next.setMonth(next.getMonth() + 1);
        break;
      default: // DAILY
        next.setDate(next.getDate() + 1);
    }
  } while (next <= now);

  return next;
}

async function processDueReminders() {
  const now = new Date();

  const reminders = await prisma.reminder.findMany({
    where: { isEnabled: true, remindAt: { lte: now } },
    include: {
      item: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (reminders.length === 0) return;

  console.log(`[ReminderScheduler] 处理 ${reminders.length} 条到期提醒`);

  for (const reminder of reminders) {
    const { item } = reminder;
    const { user } = item;

    // Update reminder state BEFORE sending to prevent double-delivery on restart
    if (reminder.isRecurring) {
      const nextRemindAt = calcNextRemindAt(reminder.remindAt, reminder.recurringPattern);
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { remindAt: nextRemindAt, lastSentAt: now },
      });
    } else {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { isEnabled: false, lastSentAt: now },
      });
    }

    // Send notification
    const emailTemplate = buildReminderEmail(user.name, item.title, item.dueDate);
    const sent = await sendEmail({ ...emailTemplate, to: user.email });
    console.log(`[ReminderScheduler] 提醒 "${item.title}" → ${user.email} ${sent ? '✓' : '(SMTP 未配置，已跳过)'}`);
  }
}

export function startReminderScheduler() {
  // Check every minute for due reminders
  cron.schedule('* * * * *', async () => {
    try {
      await processDueReminders();
    } catch (err) {
      console.error('[ReminderScheduler] 执行出错:', err);
    }
  });

  console.log('[ReminderScheduler] 已启动（每分钟检查一次到期提醒）');
}
