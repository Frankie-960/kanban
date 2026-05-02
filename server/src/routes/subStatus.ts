import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const createSubStatusSchema = z.object({
  category: z.string().min(1),
  name: z.string().min(1),
  order: z.number().optional(),
});

const updateSubStatusSchema = z.object({
  name: z.string().min(1).optional(),
  order: z.number().optional(),
  isActive: z.boolean().optional(),
});

const GLOBAL_DEFAULTS = [
  { userId: null as string | null, category: 'PROCUREMENT_SOURCING', name: '供应商报价中', order: 1 },
  { userId: null as string | null, category: 'PROCUREMENT_SOURCING', name: '待发起采购评审', order: 2 },
  { userId: null as string | null, category: 'PROCUREMENT_SOURCING', name: '采购评审中', order: 3 },
  { userId: null as string | null, category: 'PAYMENT', name: '待供应商发起请款申请', order: 1 },
  { userId: null as string | null, category: 'PAYMENT', name: '内部验收确认中', order: 2 },
  { userId: null as string | null, category: 'PAYMENT', name: '付款流程已发起', order: 3 },
];

// Get all sub-status options (global defaults + user-specific)
router.get('/', async (req: AuthRequest, res) => {
  try {
    let subStatuses = await prisma.subStatus.findMany({
      where: { OR: [{ userId: req.userId }, { userId: null }] },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    // M8 fix: seed global defaults only if truly absent; try-catch handles concurrent first-time access
    if (subStatuses.length === 0) {
      try {
        await prisma.subStatus.createMany({ data: GLOBAL_DEFAULTS });
      } catch {
        // Another concurrent request may have already created them — ignore and re-query
      }
      subStatuses = await prisma.subStatus.findMany({
        where: { OR: [{ userId: req.userId }, { userId: null }] },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
    }

    res.json(subStatuses);
  } catch {
    res.status(500).json({ error: 'Failed to fetch sub-status options' });
  }
});

// Create sub-status option
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createSubStatusSchema.parse(req.body);
    const maxOrder = await prisma.subStatus.aggregate({
      where: { userId: req.userId, category: data.category },
      _max: { order: true },
    });
    const subStatus = await prisma.subStatus.create({
      data: {
        userId: req.userId,
        category: data.category,
        name: data.name,
        order: data.order ?? (maxOrder._max.order || 0) + 1,
      },
    });
    res.json(subStatus);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create sub-status option' });
  }
});

// Update sub-status — user-owned only
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.subStatus.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Sub-status not found' });

    const data = updateSubStatusSchema.parse(req.body);
    const subStatus = await prisma.subStatus.update({ where: { id: req.params.id }, data });
    res.json(subStatus);
  } catch {
    res.status(500).json({ error: 'Failed to update sub-status option' });
  }
});

// Delete sub-status — user-owned only
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.subStatus.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Sub-status not found' });

    await prisma.subStatus.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete sub-status option' });
  }
});

// Reorder — ownership enforced via updateMany
router.patch('/reorder', async (req: AuthRequest, res) => {
  try {
    const { items } = req.body as { items: { id: string; order: number }[] };
    await prisma.$transaction(
      items.map((item) =>
        prisma.subStatus.updateMany({
          where: { id: item.id, userId: req.userId! },
          data: { order: item.order },
        })
      )
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to reorder sub-statuses' });
  }
});

export default router;
