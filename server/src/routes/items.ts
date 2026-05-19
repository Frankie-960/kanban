import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const createItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  progress: z.string().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  // category is now dynamic — validated at runtime against Category table
  category: z.string().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).optional(),
  subStatus: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  visibility: z.enum(['PRIVATE', 'DEPARTMENT', 'SHARED']).optional(),
  departmentId: z.string().nullable().optional(),
  estimatedAmount: z.number().nullable().optional(),
  finalAmount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  supplierName: z.string().nullable().optional(),
  supplierAmount: z.number().nullable().optional(),
  requesterDepartment: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

const updateItemSchema = createItemSchema.partial();

const updateStatusSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']),
  subStatus: z.string().optional(),
});

// Built-in default categories — always accepted even if user hasn't run categories migration
const BUILT_IN_CATEGORIES = new Set(['PROCUREMENT_SOURCING', 'PAYMENT', 'OTHER']);

async function isCategoryValid(userId: string, key: string): Promise<boolean> {
  if (BUILT_IN_CATEGORIES.has(key)) return true;
  const found = await prisma.category.findFirst({ where: { userId, key, isActive: true } });
  return !!found;
}

// S3 fix: build a correct visibility+search where clause without flattening OR conditions
function buildItemWhere(
  userId: string,
  userDeptId: string | null,
  query: { status?: unknown; priority?: unknown; category?: unknown; search?: unknown; view?: unknown; projectId?: unknown }
) {
  const { status, priority, category, search, projectId, view } = query;

  // 个人视图（默认）：严格仅自己；部门视图：自己 + 本部门 DEPARTMENT 可见
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

  const andClauses: object[] = [visibilityFilter];
  if (status) andClauses.push({ status });
  if (priority) andClauses.push({ priority });
  if (category) andClauses.push({ category });
  if (projectId !== undefined) {
    // 'null' string → filter for items NOT in any project (inbox / 散任务)
    andClauses.push(projectId === 'null' ? { projectId: null } : { projectId: projectId as string });
  }
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
            project: { select: { id: true, name: true, code: true } },
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
        project: { select: { id: true, name: true, code: true } },
        _count: { select: { experiences: true } },
      },
    });

    res.json(items);
  } catch (e) {
    console.error('GET /items failed:', e);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Financial summary — must be before /:id to avoid route shadowing
// Optimized: use SQL aggregation instead of loading all items into memory
router.get('/summary', async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    const where = buildItemWhere(req.userId!, currentUser.departmentId, req.query);

    const now = new Date();

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthWhere = { AND: [...(where.AND as object[]), { createdAt: { gte: monthStart, lte: monthEnd } }] };
    const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`;

    const [
      totals,
      byCategory,
      byStatus,
      overdueCount,
      overBudgetItems,
      monthlyTotals,
      monthlyByStatus,
      monthlyOverdueCount,
      monthlySavedRows,
    ] = await Promise.all([
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
      prisma.item.count({
        where: { AND: [...(where.AND as object[]), { status: { not: 'COMPLETED' }, dueDate: { lt: now, not: null } }] },
      }),
      prisma.item.findMany({
        where: { AND: [...(where.AND as object[]), { estimatedAmount: { not: null }, finalAmount: { not: null } }] },
        select: { id: true, title: true, estimatedAmount: true, finalAmount: true, status: true, currency: true, dueDate: true },
      }),
      prisma.item.aggregate({
        where: monthWhere,
        _count: { id: true },
        _sum: { estimatedAmount: true, finalAmount: true },
      }),
      prisma.item.groupBy({
        by: ['status'],
        where: monthWhere,
        _count: { id: true },
      }),
      prisma.item.count({
        where: { AND: [...(monthWhere.AND as object[]), { status: { not: 'COMPLETED' }, dueDate: { lt: now, not: null } }] },
      }),
      prisma.item.findMany({
        where: {
          AND: [
            ...(monthWhere.AND as object[]),
            { status: 'COMPLETED' },
            { estimatedAmount: { not: null }, finalAmount: { not: null } },
          ],
        },
        select: { estimatedAmount: true, finalAmount: true },
      }),
    ]);

    const overBudgetFiltered = overBudgetItems.filter(
      (i) => i.finalAmount !== null && i.estimatedAmount !== null && i.finalAmount > i.estimatedAmount
    );

    const totalEst = totals._sum.estimatedAmount ?? 0;
    const totalFinal = totals._sum.finalAmount ?? 0;

    const monthlyEst = monthlyTotals._sum.estimatedAmount ?? 0;
    const monthlyFinal = monthlyTotals._sum.finalAmount ?? 0;
    const monthlyCompletedCount = monthlyByStatus.find((s) => s.status === 'COMPLETED')?._count.id ?? 0;
    const monthlyInProgressCount = monthlyByStatus.find((s) => s.status === 'IN_PROGRESS')?._count.id ?? 0;
    const monthlySavedAmount = monthlySavedRows.reduce((sum, i) => {
      if (i.estimatedAmount! > i.finalAmount!) return sum + (i.estimatedAmount! - i.finalAmount!);
      return sum;
    }, 0);

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
      overBudgetItems: overBudgetFiltered,
      monthly: {
        count: monthlyTotals._count.id,
        completedCount: monthlyCompletedCount,
        inProgressCount: monthlyInProgressCount,
        overdueCount: monthlyOverdueCount,
        estimatedAmount: monthlyEst,
        finalAmount: monthlyFinal,
        savedAmount: monthlySavedAmount,
        period: {
          start: monthStart.toISOString(),
          end:   monthEnd.toISOString(),
          label: monthLabel,
        },
      },
    });
  } catch (e) {
    console.error('GET /items/summary failed:', e);
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
        project: { select: { id: true, name: true, code: true } },
      },
    });

    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (e) {
    console.error('GET /items/:id failed:', e);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// Create item
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createItemSchema.parse(req.body);

    if (data.category && !(await isCategoryValid(req.userId!, data.category))) {
      return res.status(400).json({ error: `分类 "${data.category}" 不存在或未启用` });
    }

    // Verify project access if projectId provided
    if (data.projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: data.projectId,
          OR: [
            { ownerId: req.userId },
            { visibility: 'DEPARTMENT', departmentId: req.user!.departmentId || undefined },
            { visibility: 'SHARED' },
          ],
        },
      });
      if (!project) return res.status(404).json({ error: '项目不存在或无权限' });
    }

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
        status: data.status || 'TODO',
        subStatus: data.subStatus || null,
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
        projectId: data.projectId || null,
      },
    });
    res.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('POST /items failed:', err);
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

    if (data.category && !(await isCategoryValid(req.userId!, data.category))) {
      return res.status(400).json({ error: `分类 "${data.category}" 不存在或未启用` });
    }

    if (data.projectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: data.projectId,
          OR: [
            { ownerId: req.userId },
            { visibility: 'DEPARTMENT', departmentId: req.user!.departmentId || undefined },
            { visibility: 'SHARED' },
          ],
        },
      });
      if (!project) return res.status(404).json({ error: '项目不存在或无权限' });
    }

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
    if (data.projectId !== undefined) updateData.projectId = data.projectId || null;

    const item = await prisma.item.update({ where: { id: req.params.id }, data: updateData });
    res.json(item);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('PUT /items/:id failed:', err);
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
  } catch (e) {
    console.error('DELETE /items/:id failed:', e);
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
    console.error('PATCH /items/:id/status failed:', err);
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
  } catch (e) {
    console.error('GET /items/:id/history failed:', e);
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
          where: { id: item.id, userId: req.userId! },
          data: { order: item.order },
        })
      )
    );
    res.json({ success: true });
  } catch (e) {
    console.error('PATCH /items/reorder failed:', e);
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
  } catch (e) {
    console.error('POST /items/:id/transfer failed:', e);
    res.status(500).json({ error: 'Failed to transfer item' });
  }
});

export default router;
