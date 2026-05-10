import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { generateReportWithAI, LLM_PROVIDERS, LLMProvider, getAvailableProviders } from '../services/aiService';
import { exportToWord, exportToExcel } from '../services/exportService';
import { decryptApiKey } from '../utils/crypto';

const router = Router();
router.use(authMiddleware);

const FORMAT_LABELS: Record<string, string> = {
  WEEKLY: '周报', BIWEEKLY: '双周报', MONTHLY: '月报', QUARTERLY: '季报', YEARLY: '年报',
};

function formatCurrency(v: number | null | undefined, currency?: string): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString()}${currency === 'CNY' || !currency ? '元' : ` ${currency}`}`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('zh-CN');
}

function buildAIMarkdownExport(content: any, report: any): string {
  const lines: string[] = [];

  // Header
  const typeLabel = FORMAT_LABELS[report.type] || '报告';
  lines.push(`# 采购工作报告：${typeLabel}`);
  lines.push('');
  lines.push(`> **报告类型**：${typeLabel} ｜ **报告周期**：${formatDate(report.periodStart)} ~ ${formatDate(report.periodEnd)} ｜ **生成时间**：${formatDate(report.createdAt)}`);
  lines.push('');

  // 1. Executive Summary
  if (content.summary) {
    lines.push('## 一、执行摘要');
    lines.push('');
    lines.push(content.summary);
    lines.push('');
  }

  // 2. Key Metrics
  const total = content.totalTasks || 0;
  const completed = content.completedTasks || 0;
  const inProgress = content.inProgressTasks || 0;
  const pending = content.pendingTasks || 0;
  const rate = content.completionRate || (total > 0 ? Math.round((completed / total) * 100) : 0);

  lines.push('## 二、关键数据');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push(`| 任务总数 | ${total} |`);
  lines.push(`| 已完成 | ${completed} |`);
  lines.push(`| 进行中 | ${inProgress} |`);
  lines.push(`| 待处理 | ${pending} |`);
  lines.push(`| 完成率 | ${rate}% |`);
  lines.push('');

  // 3. Cost Analysis
  const est = content.totalEstimatedAmount;
  const fin = content.totalFinalAmount;
  if (est > 0 || fin > 0) {
    const saved = (content.totalSavings !== undefined) ? content.totalSavings : (est - fin);
    const savedRate = (content.savingsRate !== undefined) ? content.savingsRate : (est > 0 ? ((est - fin) / est * 100) : 0);

    lines.push('## 三、成本分析');
    lines.push('');
    lines.push('| 指标 | 金额 |');
    lines.push('|------|------|');
    lines.push(`| 预估总成本 | ${formatCurrency(est)} |`);
    lines.push(`| 实际/目标总成本 | ${formatCurrency(fin)} |`);
    lines.push(`| 节省金额 | ${formatCurrency(saved)} |`);
    lines.push(`| 节省率 | ${savedRate.toFixed(1)}% |`);
    if (content.costAnalysis) {
      lines.push('');
      lines.push(`> ${content.costAnalysis}`);
    }
    lines.push('');
  }

  // 4. Supplier Analysis
  if (content.supplierStats && content.supplierStats.length > 0) {
    lines.push('## 四、供应商分析');
    lines.push('');
    lines.push(`合作供应商数：${content.supplierStats.length}`);
    if (content.topSupplier) {
      lines.push(`最大供应商：${content.topSupplier.name}（项目数 ${content.topSupplier.itemCount}）`);
    }
    if (content.supplierPerformance !== undefined) {
      lines.push(`供应商平均绩效：${content.supplierPerformance} 分`);
    }
    lines.push('');
    lines.push('| 供应商 | 级别 | 项目数 | 总金额 |');
    lines.push('|--------|------|--------|--------|');
    for (const s of content.supplierStats) {
      lines.push(`| ${s.name} | ${s.level || '—'} | ${s.itemCount || 0} | ${formatCurrency(s.totalAmount)} |`);
    }
    lines.push('');
  }

  // 5. Project Progress (if available)
  if (content.projectStats && content.projectStats.length > 0) {
    lines.push('## 五、项目进度');
    lines.push('');
    lines.push('| 项目 | 状态 | 任务数 | 完成率 | 预算使用 |');
    lines.push('|------|------|--------|--------|----------|');
    for (const p of content.projectStats) {
      lines.push(`| ${p.name} | ${p.statusLabel || p.status} | ${p.totalTasks || 0} | ${p.completionRate || 0}% | ${p.budgetUsedPercent !== null ? p.budgetUsedPercent + '%' : '—'} |`);
    }
    lines.push('');
  }

  // 6. Task Categories
  if (content.categories && content.categories.length > 0) {
    lines.push('## 六、任务分类详情');
    for (const cat of content.categories) {
      if (cat.tasks && cat.tasks.length > 0) {
        const catCompleted = cat.tasks.filter((t: any) => t.status === 'COMPLETED').length;
        lines.push('');
        lines.push(`### ${cat.name}（${catCompleted}/${cat.tasks.length} 完成）`);
        lines.push('');
        lines.push('| 任务 | 状态 | 子状态 | 金额 | 供应商 |');
        lines.push('|------|------|--------|------|--------|');
        for (const task of cat.tasks) {
          const statusText = task.status === 'COMPLETED' ? '✅ 已完成' : task.status === 'IN_PROGRESS' ? '🔄 进行中' : '⏳ 待处理';
          const subStatus = task.subStatus || '—';
          const amount = task.estimatedAmount ? formatCurrency(task.estimatedAmount) : (task.finalAmount ? formatCurrency(task.finalAmount) : '—');
          const supplier = task.supplierName || '—';
          lines.push(`| ${task.title} | ${statusText} | ${subStatus} | ${amount} | ${supplier} |`);
        }
      }
    }
    lines.push('');
  }

  // 7. Highlights
  if (content.highlights && content.highlights.length > 0) {
    lines.push('## 七、工作亮点');
    for (const h of content.highlights) {
      lines.push(`- ${h}`);
    }
    lines.push('');
  }

  // 8. Risks
  if (content.risks && content.risks.length > 0) {
    lines.push('## 八、风险与问题');
    for (const r of content.risks) {
      lines.push(`- ⚠️ ${r}`);
    }
    lines.push('');
  }

  // 9. Next Steps
  if (content.nextSteps && content.nextSteps.length > 0) {
    lines.push('## 九、下阶段计划');
    for (const s of content.nextSteps) {
      lines.push(`- [ ] ${s}`);
    }
    lines.push('');
  }

  // 10. AI Insights
  if (content.insights && content.insights.length > 0) {
    lines.push('## 十、AI 洞察');
    for (const ins of content.insights) {
      lines.push(`- 💡 ${ins}`);
    }
    lines.push('');
  }

  // 11. Appendix — Raw JSON
  lines.push('---');
  lines.push('');
  lines.push('## 附录：原始数据（JSON）');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(content, null, 2));
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

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

    // Enrich report with server-computed project stats and cost analysis
    const projectStats = await computeProjectStats(prisma, req.userId!, req.user!.departmentId);
    const costSummary = computeCostSummary(items);

    const enrichedContent = {
      ...content,
      projectStats,
      totalEstimatedAmount: content.totalEstimatedAmount || costSummary.totalEstimatedAmount,
      totalFinalAmount: content.totalFinalAmount || costSummary.totalFinalAmount,
      totalSavings: content.totalSavings !== undefined ? content.totalSavings : costSummary.totalSavings,
      savingsRate: content.savingsRate !== undefined ? content.savingsRate : costSummary.savingsRate,
      currency: costSummary.currency || 'CNY',
    };

    const report = await prisma.report.create({
      data: {
        userId: req.userId,
        departmentId: deptId,
        type: data.type,
        periodStart,
        periodEnd,
        content: JSON.stringify(enrichedContent),
      },
    });

    res.json({ ...report, content: enrichedContent });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error('Report generation error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Export AI-friendly material (Markdown + embedded JSON)
router.post('/:id/export-ai', async (req: AuthRequest, res) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const content = JSON.parse(report.content);
    const markdown = buildAIMarkdownExport(content, report);

    const typeLabel = FORMAT_LABELS[report.type] || '报告';
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `采购报告_${typeLabel}_${dateStr}.md`;

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(markdown);
  } catch (err) {
    console.error('AI export error:', err);
    res.status(500).json({ error: 'Failed to export AI material' });
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

// ── Server-side data enrichment helpers ──────────────────────────

async function computeProjectStats(prisma: any, userId: string, deptId: string | null) {
  const visibilityFilter = deptId
    ? {
        OR: [
          { ownerId: userId },
          { visibility: 'DEPARTMENT' as const, OR: [{ departmentId: deptId }, { departmentId: null }] },
          { visibility: 'SHARED' as const },
        ],
      }
    : { OR: [{ ownerId: userId }, { visibility: 'SHARED' as const }] };

  const projects = await prisma.project.findMany({
    where: { AND: [visibilityFilter] },
    select: {
      id: true, name: true, status: true, totalBudget: true, currency: true,
      _count: { select: { items: true } },
    },
  });

  const ids = projects.map((p: any) => p.id);
  if (!ids.length) return [];

  const groups = await prisma.item.groupBy({
    by: ['projectId', 'status'],
    where: { projectId: { in: ids } },
    _count: { id: true },
    _sum: { estimatedAmount: true, finalAmount: true },
  });

  const stats: Record<string, any> = {};
  for (const g of groups) {
    const pid = g.projectId!;
    if (!stats[pid]) stats[pid] = { total: 0, completed: 0, estimated: 0, final: 0 };
    stats[pid].total += g._count.id;
    if (g.status === 'COMPLETED') stats[pid].completed += g._count.id;
    stats[pid].estimated += g._sum.estimatedAmount ?? 0;
    stats[pid].final += g._sum.finalAmount ?? 0;
  }

  const PROJECT_STATUS_LABEL: Record<string, string> = {
    PLANNING: '规划中', ACTIVE: '进行中', ON_HOLD: '已暂停', COMPLETED: '已完成', CANCELLED: '已取消',
  };

  return projects.map((p: any) => {
    const s = stats[p.id] || { total: 0, completed: 0, estimated: 0, final: 0 };
    const budget = p.totalBudget;
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      statusLabel: PROJECT_STATUS_LABEL[p.status] || p.status,
      totalTasks: s.total,
      completedCount: s.completed,
      completionRate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
      estimatedAmount: s.estimated,
      finalAmount: s.final,
      budget: budget,
      budgetUsedPercent: budget && budget > 0 ? Number(((s.final / budget) * 100).toFixed(2)) : null,
    };
  });
}

function computeCostSummary(items: any[]) {
  let totalEstimatedAmount = 0;
  let totalFinalAmount = 0;
  let currency = 'CNY';

  for (const item of items) {
    if (item.estimatedAmount) totalEstimatedAmount += Number(item.estimatedAmount);
    if (item.finalAmount) totalFinalAmount += Number(item.finalAmount);
    if (item.currency && item.currency !== 'CNY') currency = item.currency;
  }

  const totalSavings = totalEstimatedAmount - totalFinalAmount;
  const savingsRate = totalEstimatedAmount > 0
    ? Number(((totalEstimatedAmount - totalFinalAmount) / totalEstimatedAmount * 100).toFixed(2))
    : 0;

  return { totalEstimatedAmount, totalFinalAmount, totalSavings, savingsRate, currency };
}

export default router;
