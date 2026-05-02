import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const createExperienceSchema = z.object({
  itemId: z.string(),
  content: z.string().min(1),
});

// Get all experiences
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { itemId, search } = req.query;

    const where: any = { userId: req.userId };
    if (itemId) where.itemId = itemId;
    if (search) {
      where.content = { contains: search as string };
    }

    const experiences = await prisma.experience.findMany({
      where,
      include: { item: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(experiences);
  } catch {
    res.status(500).json({ error: 'Failed to fetch experiences' });
  }
});

// Get single experience
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const experience = await prisma.experience.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { item: { select: { id: true, title: true } } },
    });

    if (!experience) {
      return res.status(404).json({ error: 'Experience not found' });
    }

    res.json(experience);
  } catch {
    res.status(500).json({ error: 'Failed to fetch experience' });
  }
});

// Create experience
router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createExperienceSchema.parse(req.body);

    // Verify item ownership
    const item = await prisma.item.findFirst({
      where: { id: data.itemId, userId: req.userId },
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const experience = await prisma.experience.create({
      data: {
        itemId: data.itemId,
        userId: req.userId!,
        content: data.content,
      },
      include: { item: { select: { id: true, title: true } } },
    });

    res.json(experience);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors });
    }
    res.status(500).json({ error: 'Failed to create experience' });
  }
});

// Update experience
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { content } = req.body;

    const existing = await prisma.experience.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Experience not found' });
    }

    const experience = await prisma.experience.update({
      where: { id: req.params.id },
      data: { content },
      include: { item: { select: { id: true, title: true } } },
    });

    res.json(experience);
  } catch {
    res.status(500).json({ error: 'Failed to update experience' });
  }
});

// Delete experience
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.experience.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Experience not found' });
    }

    await prisma.experience.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete experience' });
  }
});

export default router;
