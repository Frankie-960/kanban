import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { generateReportWithAI, LLM_PROVIDERS, LLMProvider, getAvailableProviders } from '../services/aiService';
import { exportToWord, exportToExcel } from '../services/exportService';
import { decryptApiKey } from '../utils/crypto';

const router = Router();
router.use(authMiddleware);

const generateReportSchema = z.object({
  type: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  departmentId: z.string().optional(),
  customRequirements: z.string().optional(),
  llmProvider: z
    .enum([
      LLM_PROVIDERS.DEEPSEEK,
      LLM_PROVIDERS.QWEN,
      LLM_PROVIDERS.ERNIE,
      LLM_PROVIDERS.CHATGLM,
      LLM_PROVIDERS.MINIMAX,
      LLM_PROVIDERS.SPARK,
    ])
    .optional(),
  reportScope: z.enum(['personal', 'department']).optional().default('personal'),
});

// Get all reports
router.get('/', async (req: AuthRequest, res) => {
  try {
    const reports = await prisma.report.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports);
  } catch {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Get available LLM providers — placed before /:id to avoid route conflict
router.get('/llm-providers', (_req, res) => {
  res.json(getAvailableProviders());
});

// Get single report
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch {
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// Generate report
router.post('/generate', async (req: AuthRequest, res) => {
  try {
    const data = generateReportSchema.parse(req.body);
    const currentUser = req.user!;

    const storedUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { deepseekApiKey: true, llmProvider: true },
    });

    const reportScope = data.reportScope || 'personal';
    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);

    // H4 fix: validate department access for department-scope reports
    let deptId: string | null = null;
    if (reportScope === 'department') {
      deptId = data.departmentId || currentUser.departmentId;
      if (deptId && deptId !== currentUser.departmentId && currentUser.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden: cannot generate report for another department' });
      }
    }

    let where: object;
    if (reportScope === 'personal') {
      where = {
        userId: req.userId,
        OR: [
          { createdAt: { gte: periodStart, lte: periodEnd } },
          { updatedAt: { gte: periodStart, lte: periodEnd } },
        ],
      };
    } else if (deptId) {
      where = {
        departmentId: deptId,
        visibility: { in: ['DEPARTMENT', 'SHARED'] },
        OR: [
          { createdAt: { gte: periodStart, lte: periodEnd } },
          { updatedAt: { gte: periodStart, lte: periodEnd } },
        ],
      };
    } else {
      where = { id: 'none' };
    }

    const items = await prisma.item.findMany({
      where,
      include: {
        experiences: { orderBy: { createdAt: 'desc' } },
        statusHistories: {
          include: { operator: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const provider = (data.llmProvider || storedUser?.llmProvider || LLM_PROVIDERS.DEEPSEEK) as LLMProvider;
    // S8 fix: decrypt API key before passing to AI service
    const apiKey = decryptApiKey(storedUser?.deepseekApiKey);

    const content = await generateReportWithAI(
      items,
      data.type,
      apiKey,
      provider,
      data.customRequirements,
      reportScope
    );

    const report = await prisma.report.create({
      data: {
        userId: req.userId,
        departmentId: deptId,
        type: data.type,
        periodStart,
        periodEnd,
        content: JSON.stringify(content),
      },
    });

    res.json({ ...report, content });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('Report generation error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Delete report
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!report) return res.status(404).json({ error: 'Report not found' });

    await prisma.report.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Export report
router.post('/:id/export', async (req: AuthRequest, res) => {
  try {
    const { format } = req.body as { format: 'word' | 'excel' };
    const report = await prisma.report.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const content = JSON.parse(report.content);
    const typeLabels: Record<string, string> = {
      WEEKLY: '周报', BIWEEKLY: '双周报', MONTHLY: '月报', QUARTERLY: '季报', YEARLY: '年报',
    };
    const reportType = typeLabels[report.type] || '报告';
    const dateStr = new Date().toISOString().split('T')[0];

    let buffer: Buffer;
    let filename: string;
    let contentType: string;

    if (format === 'word') {
      buffer = await exportToWord(content, reportType);
      filename = `procurement_report_${report.id}_${dateStr}.docx`;
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else {
      buffer = await exportToExcel(content, reportType);
      filename = `procurement_report_${report.id}_${dateStr}.xlsx`;
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export report' });
  }
});

export default router;
