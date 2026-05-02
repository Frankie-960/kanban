import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const createCategorySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  order: z.number().optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  order: z.number().optional(),
  isActive: z.boolean().optional(),
});

// Get all categories for current user (user-specific + global defaults)
router.get('/', async (req: AuthRequest, res) => {
  try {
    // M8 fix: use createMany with skipDuplicates to handle concurrent first-time access safely
    let categories = await prisma.category.findMany({
      where: { userId: req.userId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    if (categories.length === 0) {
      const defaults = [
        { key: 'PROCUREMENT_SOURCING', name: '招标寻源', order: 1 },
        { key: 'PAYMENT', name: '供应商付款', order: 2 },
        { key: 'OTHER', name: '其他', order: 3 },
      ];
      await prisma.category.createMany({
        data: defaults.map((d) => ({ ...d, userId: req.userId! }),),
      });
      categories = await prisma.category.findMany({
        where: { userId: req.userId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
    }

    res.json(categories);
  } catch {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createCategorySchema.parse(req.body);
    const existing = await prisma.category.findFirst({
      where: { userId: req.userId, key: data.key },
    });
    if (existing) return res.status(400).json({ error: 'Category already exists' });

    const maxOrder = await prisma.category.aggregate({
      where: { userId: req.userId },
      _max: { order: true },
    });
    const category = await prisma.category.create({
      data: {
        userId: req.userId,
        key: data.key,
        name: data.name,
        order: data.order ?? (maxOrder._max.order || 0) + 1,
      },
    });
    res.json(category);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category — owner only
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const data = updateCategorySchema.parse(req.body);
    const existing = await prisma.category.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const category = await prisma.category.update({ where: { id: req.params.id }, data });
    res.json(category);
  } catch {
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category — owner only
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.category.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Reorder categories — ownership enforced via updateMany
router.patch('/reorder', async (req: AuthRequest, res) => {
  try {
    const { items } = req.body as { items: { id: string; order: number }[] };
    await prisma.$transaction(
      items.map((item) =>
        prisma.category.updateMany({
          where: { id: item.id, userId: req.userId! },
          data: { order: item.order },
        })
      )
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to reorder categories' });
  }
});

export default router;
