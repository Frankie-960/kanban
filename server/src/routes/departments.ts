import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const createDeptSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

// S2 helper: verify current user has access to the department (ADMIN bypasses)
async function assertDeptAccess(req: AuthRequest, deptId: string): Promise<boolean> {
  if (req.user!.role === 'ADMIN') return true;
  return req.user!.departmentId === deptId;
}

// Helper: parse announcement JSON fields
function parseAnnouncement(a: {
  targetUserIds: string;
  linkedItemIds: string;
  confirmations: string;
  readBy: string;
  [key: string]: unknown;
}) {
  return {
    ...a,
    targetUserIds: JSON.parse(a.targetUserIds || '[]'),
    linkedItemIds: JSON.parse(a.linkedItemIds || '[]'),
    confirmations: JSON.parse(a.confirmations || '[]'),
    readBy: JSON.parse(a.readBy || '[]'),
  };
}

// Get all departments (list — no dept restriction needed)
router.get('/', async (_req: AuthRequest, res) => {
  try {
    const departments = await prisma.department.findMany({
      include: { _count: { select: { members: true } } },
    });
    res.json(departments);
  } catch {
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// Get department detail — S2 fix: check membership
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    if (!(await assertDeptAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const department = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: {
        members: { select: { id: true, name: true, email: true, role: true } },
        announcements: {
          include: { publishedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!department) return res.status(404).json({ error: 'Department not found' });

    res.json({
      ...department,
      announcements: department.announcements.map(parseAnnouncement),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch department' });
  }
});

// Create department — H6 fix: ADMIN only
router.post('/', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can create departments' });
    }
    const data = createDeptSchema.parse(req.body);
    const department = await prisma.department.create({
      data: { name: data.name, description: data.description },
    });
    res.json(department);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// Get department items — S2 fix: check membership
router.get('/:id/items', async (req: AuthRequest, res) => {
  try {
    if (!(await assertDeptAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const items = await prisma.item.findMany({
      where: { departmentId: req.params.id, visibility: { in: ['DEPARTMENT', 'SHARED'] } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Failed to fetch department items' });
  }
});

// Get department members — S2 fix: check membership
router.get('/:id/members', async (req: AuthRequest, res) => {
  try {
    if (!(await assertDeptAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const members = await prisma.user.findMany({
      where: { departmentId: req.params.id },
      select: { id: true, name: true, email: true, role: true },
    });
    res.json(members);
  } catch {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Get announcements — S2 fix: check membership
router.get('/:id/announcements', async (req: AuthRequest, res) => {
  try {
    if (!(await assertDeptAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const announcements = await prisma.announcement.findMany({
      where: { departmentId: req.params.id },
      include: { publishedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(announcements.map(parseAnnouncement));
  } catch {
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Create announcement — S2 fix: check membership; H7 fix: wrap in transaction
router.post('/:id/announcements', async (req: AuthRequest, res) => {
  try {
    if (!(await assertDeptAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const {
      title,
      content,
      targetAll = true,
      targetUserIds = [],
      linkedItemIds = [],
      createTaskForTargets = false,
    } = req.body;

    let notifyUserIds: string[] = [];
    if (targetAll) {
      const members = await prisma.user.findMany({
        where: { departmentId: req.params.id },
        select: { id: true },
      });
      notifyUserIds = members.map((m) => m.id);
    } else {
      notifyUserIds = targetUserIds || [];
    }

    // H7 fix: announcement creation and task creation in a single transaction
    const announcement = await prisma.$transaction(async (tx) => {
      const ann = await tx.announcement.create({
        data: {
          departmentId: req.params.id,
          title,
          content,
          publishedById: req.userId!,
          targetAll,
          targetUserIds: JSON.stringify(targetUserIds),
          linkedItemIds: JSON.stringify(linkedItemIds || []),
          confirmations: JSON.stringify([]),
          createTaskForTargets,
        },
        include: { publishedBy: { select: { id: true, name: true } } },
      });

      if (createTaskForTargets && notifyUserIds.length > 0) {
        await Promise.all(
          notifyUserIds.map((userId) =>
            tx.item.create({
              data: {
                title: `【公告待办】${title}`,
                description: content,
                status: 'TODO',
                priority: 'MEDIUM',
                category: 'OTHER',
                userId,
                departmentId: req.params.id,
                visibility: 'DEPARTMENT',
                announcementId: ann.id,
              },
            })
          )
        );
      }
      return ann;
    });

    res.json({
      ...announcement,
      targetUserIds: targetUserIds || [],
      linkedItemIds: linkedItemIds || [],
      confirmations: [],
      readBy: [],
    });
  } catch {
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Confirm announcement — S4 fix: verify dept membership and target list
router.post('/:id/announcements/:announcementId/confirm', async (req: AuthRequest, res) => {
  try {
    const announcement = await prisma.announcement.findFirst({
      where: { id: req.params.announcementId, departmentId: req.params.id },
    });
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });

    // Verify user belongs to this department
    if (!(await assertDeptAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (announcement.isExpired || announcement.isWithdrawn) {
      return res.status(400).json({ error: 'Announcement is no longer active' });
    }

    // Verify user is in target list (if not targeting all)
    if (!announcement.targetAll) {
      const targets: string[] = JSON.parse(announcement.targetUserIds || '[]');
      if (!targets.includes(req.userId!)) {
        return res.status(403).json({ error: 'You are not a target of this announcement' });
      }
    }

    const { confirmed } = req.body;
    const confirmations: { userId: string; confirmed: boolean; confirmedAt: string }[] = JSON.parse(
      announcement.confirmations || '[]'
    );
    const existingIdx = confirmations.findIndex((c) => c.userId === req.userId);

    if (existingIdx >= 0) {
      confirmations[existingIdx] = { ...confirmations[existingIdx], confirmed, confirmedAt: new Date().toISOString() };
    } else {
      confirmations.push({ userId: req.userId!, confirmed, confirmedAt: new Date().toISOString() });
    }

    const updated = await prisma.announcement.update({
      where: { id: req.params.announcementId },
      data: { confirmations: JSON.stringify(confirmations) },
      include: { publishedBy: { select: { id: true, name: true } } },
    });

    res.json(parseAnnouncement(updated));
  } catch {
    res.status(500).json({ error: 'Failed to confirm announcement' });
  }
});

// Withdraw announcement — publisher only
router.post('/:id/announcements/:announcementId/withdraw', async (req: AuthRequest, res) => {
  try {
    const announcement = await prisma.announcement.findFirst({
      where: { id: req.params.announcementId, departmentId: req.params.id },
    });
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    if (announcement.publishedById !== req.userId) {
      return res.status(403).json({ error: 'Only the publisher can withdraw the announcement' });
    }

    const updated = await prisma.announcement.update({
      where: { id: req.params.announcementId },
      data: { isWithdrawn: true, withdrawnAt: new Date() },
      include: { publishedBy: { select: { id: true, name: true } } },
    });
    res.json(parseAnnouncement(updated));
  } catch {
    res.status(500).json({ error: 'Failed to withdraw announcement' });
  }
});

// Expire announcement — publisher only
router.post('/:id/announcements/:announcementId/expire', async (req: AuthRequest, res) => {
  try {
    const announcement = await prisma.announcement.findFirst({
      where: { id: req.params.announcementId, departmentId: req.params.id },
    });
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    if (announcement.publishedById !== req.userId) {
      return res.status(403).json({ error: 'Only the publisher can expire the announcement' });
    }

    const updated = await prisma.announcement.update({
      where: { id: req.params.announcementId },
      data: { isExpired: true, expiredAt: new Date() },
      include: { publishedBy: { select: { id: true, name: true } } },
    });
    res.json(parseAnnouncement(updated));
  } catch {
    res.status(500).json({ error: 'Failed to expire announcement' });
  }
});

// Mark announcement as read — idempotent
router.post('/:id/announcements/:announcementId/read', async (req: AuthRequest, res) => {
  try {
    if (!(await assertDeptAccess(req, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const announcement = await prisma.announcement.findFirst({
      where: { id: req.params.announcementId, departmentId: req.params.id },
    });
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });

    const readBy: { userId: string; readAt: string }[] = JSON.parse(announcement.readBy || '[]');
    if (!readBy.some((r) => r.userId === req.userId)) {
      readBy.push({ userId: req.userId!, readAt: new Date().toISOString() });
      await prisma.announcement.update({
        where: { id: req.params.announcementId },
        data: { readBy: JSON.stringify(readBy) },
      });
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Get announcement read status — ADMIN or DEPARTMENT_ADMIN of this dept only
router.get('/:id/announcements/:announcementId/read-status', async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    if (
      currentUser.role !== 'ADMIN' &&
      !(currentUser.role === 'DEPARTMENT_ADMIN' && currentUser.departmentId === req.params.id)
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const announcement = await prisma.announcement.findFirst({
      where: { id: req.params.announcementId, departmentId: req.params.id },
    });
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });

    const members = await prisma.user.findMany({
      where: { departmentId: req.params.id },
      select: { id: true, name: true, email: true },
    });

    let targetMembers = members;
    if (!announcement.targetAll) {
      const targetIds: string[] = JSON.parse(announcement.targetUserIds || '[]');
      targetMembers = members.filter((m) => targetIds.includes(m.id));
    }

    const readBy: { userId: string; readAt: string }[] = JSON.parse(announcement.readBy || '[]');
    const readMap = new Map(readBy.map((r) => [r.userId, r.readAt]));

    const readUsers = targetMembers
      .filter((m) => readMap.has(m.id))
      .map((m) => ({ ...m, readAt: readMap.get(m.id) }));
    const unreadUsers = targetMembers.filter((m) => !readMap.has(m.id));

    res.json({
      total: targetMembers.length,
      readCount: readUsers.length,
      unreadCount: unreadUsers.length,
      readUsers,
      unreadUsers,
    });
  } catch {
    res.status(500).json({ error: 'Failed to get read status' });
  }
});

// Join department — S6 fix: restricted to ADMIN only (use POST /:id/members to invite users)
router.post('/:id/join', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Self-join is disabled. Ask an admin to add you to a department.' });
    }
    const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    await prisma.user.update({
      where: { id: req.userId },
      data: { departmentId: req.params.id },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to join department' });
  }
});

// Add member — ADMIN or DEPARTMENT_ADMIN of this dept only
router.post('/:id/members', async (req: AuthRequest, res) => {
  try {
    const { email, role } = req.body;
    const currentUser = req.user!;

    if (currentUser.role !== 'ADMIN' && currentUser.role !== 'DEPARTMENT_ADMIN') {
      return res.status(403).json({ error: 'Only admin or department admin can add members' });
    }
    if (currentUser.role === 'DEPARTMENT_ADMIN' && currentUser.departmentId !== req.params.id) {
      return res.status(403).json({ error: 'You can only manage members of your own department' });
    }

    const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) return res.status(404).json({ error: 'User not found with this email' });
    if (targetUser.departmentId) {
      return res.status(400).json({ error: 'User already belongs to a department' });
    }

    await prisma.user.update({
      where: { id: targetUser.id },
      data: { departmentId: req.params.id, role: role || 'MEMBER' },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member — ADMIN or DEPARTMENT_ADMIN of this dept only
router.delete('/:id/members/:userId', async (req: AuthRequest, res) => {
  try {
    const currentUser = req.user!;
    if (currentUser.role !== 'ADMIN' && currentUser.role !== 'DEPARTMENT_ADMIN') {
      return res.status(403).json({ error: 'Only admin or department admin can remove members' });
    }
    if (currentUser.role === 'DEPARTMENT_ADMIN' && currentUser.departmentId !== req.params.id) {
      return res.status(403).json({ error: 'You can only manage members of your own department' });
    }

    await prisma.user.update({
      where: { id: req.params.userId },
      data: { departmentId: null, role: 'MEMBER' },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Update member role — ADMIN only
router.put('/:id/members/:userId', async (req: AuthRequest, res) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admin can change member roles' });
    }
    const { role } = req.body;
    const member = await prisma.user.update({
      where: { id: req.params.userId },
      data: { role },
    });
    res.json(member);
  } catch {
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

export default router;
