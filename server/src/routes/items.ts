import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const createItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  progress: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  category: z.enum(['PROCUREMENT_SOURCING', 'PAYMENT', 'OTHER']).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).optional(),
  subStatus: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  visibility: z.enum(['PRIVATE', 'DEPARTMENT', 'SHARED']).optional(),
  departmentId: z.string().optional(),
  estimatedAmount: z.number().optional(),
  finalAmount: z.number().optional(),
  currency: z.string().optional(),
  supplierName: z.string().optional(),
  supplierAmount: z.number().optional(),
  requesterDepartment: z.string().optional(),
});

const updateItemSchema = createItemSchema.partial();

const updateStatusSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']),
  subStatus: z.string().optional(),
});

// S3 fix: build a correct visibility+search where clause without flattening OR conditions
function buildItemWhere(
  userId: string,
  userDeptId: string | null,
  query: { status?: unknown; priority?: unknown; category?: unknown; search?: unknown; view?: unknown }
) {
  const { status, priority, category, search, view } = query;

  const visibilityFilter =
    view === 'department' && userDeptId
      ? {
          OR: [
            { userId },
            {
              visibility: 'DEPARTMENT' as const,
              OR: [{ departmentId: userDeptId }, { departmentId: null }],
            },
          ],
        }
      : { userId };

  // All conditions are ANDed together so that search never bypasses visibility
  const andClauses: object[] = [visibilityFilter];
  if (status) andClauses.push({ status });
  if (priority) andClauses.push({ priority });
  if (category) andClauses.push({ category });
  if (search) {
    andClauses.push({
      OR: [
        { title: { contains: search as string } },
        { description: { contains: search as string } },
      ],
    });
  }

  return { AND: andClauses };
}

// Get all items — supports optional pagination via ?page=1&limit=50
router.get('/', async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const where = buildItemWhere(req.userId!, currentUser.departmentId, req.query);

    const page  = req.query.page  ? parseInt(req.query.page  as string, 10) : null;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : null;

    if (page !== null && limit !== null && page > 0 && limit > 0) {
      const [items, total] = await Promise.all([
        prisma.item.findMany({
          where,
          orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
          include: {
            experiences: true,
            user: { select: { id: true, name: true } },
            _count: { select: { experiences: true } },
          },
        }),
        prisma.item.count({ where }),
      ]);
      return res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
    }

    const items = await prisma.item.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      include: {
        experiences: true,
        user: { select: { id: true, name: true } },
        _count: { select: { experiences: true } },
      },
    });

    res.json(items);
  } catch {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Financial summary — must be before /:id to avoid route shadowing
router.get('/summary', async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const where = buildItemWhere(req.userId!, currentUser.departmentId, req.query);

    const now = new Date();
    const [totals, byCategory, byStatus, allItems] = await Promise.all([
      prisma.item.aggregate({
        where,
        _count: { id: true },
        _sum: { estimatedAmount: true, finalAmount: true, supplierAmount: true },
      }),
      prisma.item.groupBy({
        by: ['category'],
        where,
        _count: { id: true },
        _sum: { estimatedAmount: true, finalAmount: true },
      }),
      prisma.item.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      prisma.item.findMany({
        where,
        select: { id: true, title: true, estimatedAmount: true, finalAmount: true, status: true, currency: true, dueDate: true },
      }),
    ]);

    const overBudgetItems = allItems.filter(
      (i) => i.finalAmount !== null && i.estimatedAmount !== null && i.finalAmount > i.estimatedAmount
    );

    const overdueCount = allItems.filter(
      (i) => i.status !== 'COMPLETED' && i.dueDate && new Date(i.dueDate) < now
    ).length;

    const totalEst = totals._sum.estimatedAmount ?? 0;
    const totalFinal = totals._sum.finalAmount ?? 0;

    res.json({
      totals: {
        count: totals._count.id,
        estimatedAmount: totalEst,
        finalAmount: totalFinal,
        supplierAmount: totals._sum.supplierAmount ?? 0,
        variance: totalFinal - totalEst,
        variancePercent: totalEst > 0 ? Number((((totalFinal - totalEst) / totalEst) * 100).toFixed(2)) : null,
        overdueCount,
      },
      byCategory,
      byStatus,
      overBudgetItems,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Get single item — M3 fix: apply same visibility rules as list
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const deptFilter = currentUser.departmentId
      ? [
          { visibility: 'DEPARTMENT' as const, departmentId: currentUser.departmentId },
          { visibility: 'DEPARTMENT' as const, departmentId: null },
          { visibility: 'SHARED' as const },
        ]
      : [{ visibility: 'SHARED' as const }];

    const item = await prisma.item.findFirst({
      where: {
        id: req.params.id,
        OR: [{ userId: req.userId }, ...deptFilter],
      },
      include: {
        experiences: { orderBy: { createdAt: 'desc' } },
        reminders: true,
        statusHistories: {
          include: { operator: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// Create item
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createItemSchema.parse(req.body);
    const maxOrder = await prisma.item.aggregate({
      where: { userId: req.userId },
      _max: { order: true },
    });

    const item = await prisma.item.create({
      data: {
        title: data.title,
        description: data.description,
        progress: data.progress || null,
        priority: data.priority || 'MEDIUM',
        category: data.category || 'OTHER',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        visibility: data.visibility || 'PRIVATE',
        departmentId: data.departmentId,
        userId: req.userId!,
        order: (maxOrder._max.order || 0) + 1,
        estimatedAmount: data.estimatedAmount,
        finalAmount: data.finalAmount,
        currency: data.currency,
        supplierName: data.supplierName,
        supplierAmount: data.supplierAmount,
        requesterDepartment: data.requesterDepartment,
      },
    });
    res.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// Update item — only owner can update
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const data = updateItemSchema.parse(req.body);
    const existing = await prisma.item.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.progress !== undefined) updateData.progress = data.progress || null;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.subStatus !== undefined) updateData.subStatus = data.subStatus || null;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.departmentId !== undefined) updateData.departmentId = data.departmentId || null;
    if (data.estimatedAmount !== undefined) updateData.estimatedAmount = data.estimatedAmount;
    if (data.finalAmount !== undefined) updateData.finalAmount = data.finalAmount;
    if (data.currency !== undefined) updateData.currency = data.currency || null;
    if (data.supplierName !== undefined) updateData.supplierName = data.supplierName || null;
    if (data.supplierAmount !== undefined) updateData.supplierAmount = data.supplierAmount;
    if (data.requesterDepartment !== undefined) updateData.requesterDepartment = data.requesterDepartment || null;

    const item = await prisma.item.update({ where: { id: req.params.id }, data: updateData });
    res.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Delete item — only owner can delete
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.item.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    await prisma.item.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Update status — M1 fix: statusHistory and item update in single transaction
router.patch('/:id/status', async (req: AuthRequest, res) => {
  try {
    const data = updateStatusSchema.parse(req.body);
    const existing = await prisma.item.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const [, item] = await prisma.$transaction([
      prisma.statusHistory.create({
        data: {
          itemId: existing.id,
          fromStatus: existing.status,
          toStatus: data.status,
          fromSubStatus: existing.subStatus,
          toSubStatus: data.subStatus,
          operatorId: req.userId!,
        },
      }),
      prisma.item.update({
        where: { id: req.params.id },
        data: {
          status: data.status,
          subStatus: data.subStatus,
          completedAt: data.status === 'COMPLETED' ? new Date() : null,
          startDate: data.status === 'IN_PROGRESS' && !existing.startDate ? new Date() : undefined,
        },
      }),
    ]);

    // Auto-confirm linked announcement when task is completed (secondary effect, outside transaction)
    if (existing.announcementId && data.status === 'COMPLETED') {
      try {
        const announcement = await prisma.announcement.findUnique({
          where: { id: existing.announcementId },
        });
        if (announcement) {
          const confirmations = JSON.parse(announcement.confirmations || '[]');
          const existingIdx = confirmations.findIndex((c: { userId: string }) => c.userId === req.userId);
          const now = new Date().toISOString();
          if (existingIdx >= 0) {
            confirmations[existingIdx] = { ...confirmations[existingIdx], confirmed: true, confirmedAt: now };
          } else {
            confirmations.push({ userId: req.userId, confirmed: true, confirmedAt: now });
          }
          await prisma.announcement.update({
            where: { id: existing.announcementId },
            data: { confirmations: JSON.stringify(confirmations) },
          });
        }
      } catch (e) {
        console.error('Auto-confirm announcement failed:', e);
      }
    }

    res.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Get status history — only accessible if user can see the item
router.get('/:id/history', async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const deptFilter = currentUser.departmentId
      ? [
          { visibility: 'DEPARTMENT' as const, departmentId: currentUser.departmentId },
          { visibility: 'DEPARTMENT' as const, departmentId: null },
          { visibility: 'SHARED' as const },
        ]
      : [{ visibility: 'SHARED' as const }];

    const item = await prisma.item.findFirst({
      where: { id: req.params.id, OR: [{ userId: req.userId }, ...deptFilter] },
      select: { id: true },
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const histories = await prisma.statusHistory.findMany({
      where: { itemId: req.params.id },
      include: { operator: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(histories);
  } catch {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Reorder — S5 fix: put this route BEFORE /:id routes; use updateMany with userId filter
router.patch('/reorder', async (req: AuthRequest, res) => {
  try {
    const { items } = req.body as { items: { id: string; order: number }[] };
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Invalid payload' });

    await prisma.$transaction(
      items.map((item) =>
        prisma.item.updateMany({
          where: { id: item.id, userId: req.userId! }, // ownership enforced
          data: { order: item.order },
        })
      )
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to reorder items' });
  }
});

// Transfer item to another user
router.post('/:id/transfer', async (req: AuthRequest, res) => {
  try {
    const { targetUserId } = req.body as { targetUserId: string };
    const existing = await prisma.item.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: { userId: targetUserId },
    });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Failed to transfer item' });
  }
});

export default router;
