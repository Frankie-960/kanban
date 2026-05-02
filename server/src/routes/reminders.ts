import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const createReminderSchema = z.object({
  itemId: z.string(),
  type: z.enum(['BEFORE_DUE', 'DAILY_DIGEST', 'CUSTOM']),
  remindAt: z.string().datetime(),
  isRecurring: z.boolean().optional(),
  recurringPattern: z.string().optional(),
});

// Get all reminders for current user's items
router.get('/', async (req: AuthRequest, res) => {
  try {
    const reminders = await prisma.reminder.findMany({
      where: { item: { userId: req.userId } },
      include: { item: { select: { id: true, title: true } } },
      orderBy: { remindAt: 'asc' },
    });
    res.json(reminders);
  } catch {
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// Create reminder — verifies item ownership
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createReminderSchema.parse(req.body);
    const item = await prisma.item.findFirst({
      where: { id: data.itemId, userId: req.userId },
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const reminder = await prisma.reminder.create({
      data: {
        itemId: data.itemId,
        type: data.type,
        remindAt: new Date(data.remindAt),
        isRecurring: data.isRecurring || false,
        recurringPattern: data.recurringPattern,
      },
      include: { item: { select: { id: true, title: true } } },
    });
    res.json(reminder);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// Update reminder — H5 fix: verify ownership via item.userId
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.reminder.findFirst({
      where: { id: req.params.id, item: { userId: req.userId } },
    });
    if (!existing) return res.status(404).json({ error: 'Reminder not found' });

    const { remindAt, isEnabled, isRecurring, recurringPattern } = req.body;
    const reminder = await prisma.reminder.update({
      where: { id: req.params.id },
      data: {
        remindAt: remindAt ? new Date(remindAt) : undefined,
        isEnabled,
        isRecurring,
        recurringPattern,
      },
      include: { item: { select: { id: true, title: true } } },
    });
    res.json(reminder);
  } catch {
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// Delete reminder — H5 fix: verify ownership via item.userId
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.reminder.findFirst({
      where: { id: req.params.id, item: { userId: req.userId } },
    });
    if (!existing) return res.status(404).json({ error: 'Reminder not found' });

    await prisma.reminder.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

export default router;
