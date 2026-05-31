import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const PROJECT_STATUS = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;

const createProjectSchema = z.object({
  // 可空字段统一 .nullable().optional()：前端表单空值会发 null，需容忍（数据库这些列均允许 NULL）
  code: z.string().nullable().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(PROJECT_STATUS).optional(),
  ownerId: z.string().optional(), // 不可空：DB 该列非空，update 时不接受 null
  departmentId: z.string().nullable().optional(),
  totalBudget: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  visibility: z.enum(['PRIVATE', 'DEPARTMENT', 'SHARED']).optional(),
});

const updateProjectSchema = createProjectSchema.partial();

// Visibility filter — same pattern as items.ts buildItemWhere
function buildProjectWhere(userId: string, userDeptId: string | null, query: { search?: unknown; status?: unknown }) {
  const visibilityFilter = userDeptId
    ? {
        OR: [
          { ownerId: userId },
          {
            visibility: 'DEPARTMENT' as const,
            OR: [{ departmentId: userDeptId }, { departmentId: null }],
          },
          { visibility: 'SHARED' as const },
        ],
      }
    : { OR: [{ ownerId: userId }, { visibility: 'SHARED' as const }] };

  const andClauses: object[] = [visibilityFilter];
  if (query.status) andClauses.push({ status: query.status });
  if (query.search) {
    andClauses.push({
      OR: [
        { name: { contains: query.search as string } },
        { code: { contains: query.search as string } },
        { description: { contains: query.search as string } },
      ],
    });
  }
  return { AND: andClauses };
}

// List projects
router.get('/', async (req: AuthRequest, res) => {
  try {
    const where = buildProjectWhere(req.userId!, req.user!.departmentId, req.query);
    const projects = await prisma.project.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        owner: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    });

    // Aggregate per-project counts and amounts in a single grouped query
    const ids = projects.map((p) => p.id);
    const groups = ids.length
      ? await prisma.item.groupBy({
          by: ['projectId', 'status'],
          where: { projectId: { in: ids } },
          _count: { id: true },
          _sum: { estimatedAmount: true, finalAmount: true },
        })
      : [];

    const stats: Record<string, { total: number; completed: number; estimated: number; final: number }> = {};
    for (const id of ids) stats[id] = { total: 0, completed: 0, estimated: 0, final: 0 };
    for (const g of groups) {
      const pid = g.projectId!;
      stats[pid].total += g._count.id;
      if (g.status === 'COMPLETED') stats[pid].completed += g._count.id;
      stats[pid].estimated += g._sum.estimatedAmount ?? 0;
      stats[pid].final += g._sum.finalAmount ?? 0;
    }

    res.json(
      projects.map((p) => ({
        ...p,
        itemCount: stats[p.id].total,
        completedCount: stats[p.id].completed,
        estimatedAmount: stats[p.id].estimated,
        finalAmount: stats[p.id].final,
      }))
    );
  } catch (e) {
    console.error('GET /projects failed:', e);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get one project (with items)
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const where = buildProjectWhere(req.userId!, req.user!.departmentId, {});
    const project = await prisma.project.findFirst({
      where: { AND: [{ id: req.params.id }, where] },
      include: {
        owner: { select: { id: true, name: true } },
        items: {
          orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (e) {
    console.error('GET /projects/:id failed:', e);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Project-level summary
router.get('/:id/summary', async (req: AuthRequest, res) => {
  try {
    const where = buildProjectWhere(req.userId!, req.user!.departmentId, {});
    const project = await prisma.project.findFirst({ where: { AND: [{ id: req.params.id }, where] } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const now = new Date();
    const [byStatus, totals, overdueCount] = await Promise.all([
      prisma.item.groupBy({
        by: ['status'],
        where: { projectId: project.id },
        _count: { id: true },
      }),
      prisma.item.aggregate({
        where: { projectId: project.id },
        _count: { id: true },
        _sum: { estimatedAmount: true, finalAmount: true },
      }),
      prisma.item.count({
        where: { projectId: project.id, status: { not: 'COMPLETED' }, dueDate: { lt: now } },
      }),
    ]);

    const completedCount = byStatus.find((s) => s.status === 'COMPLETED')?._count.id ?? 0;
    const inProgressCount = byStatus.find((s) => s.status === 'IN_PROGRESS')?._count.id ?? 0;
    const totalCount = totals._count.id;
    const estimatedAmount = totals._sum.estimatedAmount ?? 0;
    const finalAmount = totals._sum.finalAmount ?? 0;

    res.json({
      totalCount,
      completedCount,
      inProgressCount,
      todoCount: totalCount - completedCount - inProgressCount,
      overdueCount,
      progress: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      estimatedAmount,
      finalAmount,
      budget: project.totalBudget ?? null,
      budgetRemaining: project.totalBudget !== null ? project.totalBudget - finalAmount : null,
      budgetUsedPercent: project.totalBudget && project.totalBudget > 0 ? Number(((finalAmount / project.totalBudget) * 100).toFixed(2)) : null,
    });
  } catch (e) {
    console.error('GET /projects/:id/summary failed:', e);
    res.status(500).json({ error: 'Failed to fetch project summary' });
  }
});

// Create project
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createProjectSchema.parse(req.body);

    // If code provided, ensure unique
    if (data.code) {
      const existing = await prisma.project.findUnique({ where: { code: data.code } });
      if (existing) return res.status(400).json({ error: '项目编号已存在' });
    }

    const project = await prisma.project.create({
      data: {
        code: data.code || null,
        name: data.name,
        description: data.description || null,
        status: data.status || 'PLANNING',
        ownerId: data.ownerId || req.userId!,
        departmentId: data.departmentId || req.user!.departmentId || null,
        totalBudget: data.totalBudget,
        currency: data.currency || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        visibility: data.visibility || 'DEPARTMENT',
      },
      include: { owner: { select: { id: true, name: true } } },
    });
    res.json(project);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('POST /projects failed:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project — only owner can update (admin override could be added later)
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const data = updateProjectSchema.parse(req.body);
    const existing = await prisma.project.findFirst({ where: { id: req.params.id, ownerId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    if (data.code && data.code !== existing.code) {
      const dup = await prisma.project.findUnique({ where: { code: data.code } });
      if (dup) return res.status(400).json({ error: '项目编号已存在' });
    }

    const updateData: Record<string, unknown> = {};
    if (data.code !== undefined) updateData.code = data.code || null;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'COMPLETED' && !existing.completedAt) updateData.completedAt = new Date();
      if (data.status !== 'COMPLETED') updateData.completedAt = null;
    }
    if (data.ownerId !== undefined) updateData.ownerId = data.ownerId;
    if (data.departmentId !== undefined) updateData.departmentId = data.departmentId || null;
    if (data.totalBudget !== undefined) updateData.totalBudget = data.totalBudget;
    if (data.currency !== undefined) updateData.currency = data.currency || null;
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;

    const project = await prisma.project.update({ where: { id: req.params.id }, data: updateData });
    res.json(project);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('PUT /projects/:id failed:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Delete project — only owner. Items' projectId becomes null (SetNull cascade)
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.project.findFirst({ where: { id: req.params.id, ownerId: req.userId } });
    if (!existing) return res.status(404).json({ error: 'Project not found' });
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /projects/:id failed:', e);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
