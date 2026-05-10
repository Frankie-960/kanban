import { Item, Experience, StatusHistory } from '@prisma/client';

export const LLM_PROVIDERS = {
  DEEPSEEK: 'deepseek',
  QWEN: 'qwen',
  ERNIE: 'ernie',
  CHATGLM: 'chatglm',
  MINIMAX: 'minimax',
  SPARK: 'spark',
} as const;

export type LLMProvider = typeof LLM_PROVIDERS[keyof typeof LLM_PROVIDERS];

interface LLMConfig {
  name: string;
  apiUrl: string;
  model: string;
  supported: boolean;
}

const LLM_CONFIGS: Record<LLMProvider, LLMConfig> = {
  [LLM_PROVIDERS.DEEPSEEK]: {
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    supported: true,
  },
  [LLM_PROVIDERS.QWEN]: {
    name: '通义千问',
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
    supported: true,
  },
  [LLM_PROVIDERS.CHATGLM]: {
    name: 'ChatGLM',
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-plus',
    supported: true,
  },
  // M7: ERNIE, MINIMAX, SPARK require non-standard auth flows not implemented here
  [LLM_PROVIDERS.ERNIE]: {
    name: '文心一言',
    apiUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions',
    model: 'ernie-4.0-8k-latest',
    supported: false,
  },
  [LLM_PROVIDERS.MINIMAX]: {
    name: 'MiniMax',
    apiUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    model: 'MiniMax-Text-01',
    supported: false,
  },
  [LLM_PROVIDERS.SPARK]: {
    name: '讯飞星火',
    apiUrl: '',
    model: 'generalv3.5',
    supported: false, // uses WebSocket + HMAC auth, not compatible with this HTTP client
  },
};

const LLM_FETCH_TIMEOUT_MS = 60_000;

interface ItemWithRelations extends Item {
  experiences: Experience[];
  statusHistories: (StatusHistory & {
    operator: { id: string; name: string };
  })[];
}

interface ReportContent {
  summary: string;
  periodProgress: string;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  totalTasks: number;
  completionRate: number;
  totalEstimatedAmount?: number;
  totalFinalAmount?: number;
  totalSavings?: number;
  savingsRate?: number;
  costAnalysis?: string;
  currency?: string;
  supplierStats?: { name: string; itemCount: number; totalAmount: number; level?: string }[];
  topSupplier?: { name: string; itemCount: number } | null;
  supplierPerformance?: number;
  categories: {
    name: string;
    tasks: {
      title: string;
      status: string;
      subStatus?: string;
      progress?: string;
      completedAt?: string;
      estimatedAmount?: number;
      finalAmount?: number;
      supplierName?: string;
      experiences?: string[];
    }[];
  }[];
  insights: string[];
  nextSteps: string[];
  highlights: string[];
  risks: string[];
}

function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    PROCUREMENT_SOURCING: '招标寻源',
    PAYMENT: '供应商付款',
    OTHER: '其他',
  };
  return names[category] || category;
}

function buildPrompt(
  items: ItemWithRelations[],
  type: string,
  customRequirements?: string,
  reportScope?: string
): string {
  const completedItems = items.filter((i) => i.status === 'COMPLETED');
  const inProgressItems = items.filter((i) => i.status === 'IN_PROGRESS');
  const todoItems = items.filter((i) => i.status === 'TODO');
  const urgentItems = items.filter((i) => i.priority === 'URGENT' && i.status !== 'COMPLETED');
  const overdueItems = items.filter((i) => {
    if (!i.dueDate || i.status === 'COMPLETED') return false;
    return new Date(i.dueDate) < new Date();
  });
  const updatedInPeriodItems = items.filter((i) => i.updatedAt > i.createdAt);

  const categoryMap: Record<string, typeof items> = {};
  for (const item of items) {
    const catName = getCategoryName(item.category);
    if (!categoryMap[catName]) categoryMap[catName] = [];
    categoryMap[catName].push(item);
  }

  let prompt = `你是采购部门的专业助理，负责生成给管理层的工作报告。\n\n`;
  prompt += `【基本信息】\n`;
  prompt += `- 报告类型: ${type}\n`;
  prompt += `- 生成日期: ${new Date().toLocaleDateString('zh-CN')}\n`;
  prompt += `- 报告范围: ${reportScope === 'department' ? '部门报告' : '个人报告'}\n\n`;

  prompt += `【任务统计】\n`;
  prompt += `- 任务总数: ${items.length}\n`;
  prompt += `- 已完成: ${completedItems.length}\n`;
  prompt += `- 进行中: ${inProgressItems.length}\n`;
  prompt += `- 待处理: ${todoItems.length}\n`;
  prompt += `- 紧急任务: ${urgentItems.length}\n`;
  prompt += `- 已逾期: ${overdueItems.length}\n`;
  prompt += `- 完成率: ${items.length > 0 ? Math.round((completedItems.length / items.length) * 100) : 0}%\n\n`;

  // Cost data
  const totalEst = items.reduce((s, i) => s + (i.estimatedAmount || 0), 0);
  const totalFinal = items.reduce((s, i) => s + (i.finalAmount || 0), 0);
  const totalSavings = totalEst - totalFinal;
  const savingsRate = totalEst > 0 ? ((totalEst - totalFinal) / totalEst * 100).toFixed(1) : '0.0';
  const overBudgetItems = items.filter((i) => i.finalAmount && i.estimatedAmount && i.finalAmount > i.estimatedAmount);
  const withEstAmount = items.filter((i) => i.estimatedAmount);

  prompt += `【成本分析】💰\n`;
  prompt += `- 有预估金额的任务数: ${withEstAmount.length}\n`;
  prompt += `- 预估总金额: ${totalEst.toLocaleString()} 元\n`;
  prompt += `- 实际成交总金额: ${totalFinal.toLocaleString()} 元\n`;
  prompt += `- 降本金额: ${totalSavings >= 0 ? '+' : ''}${totalSavings.toLocaleString()} 元\n`;
  prompt += `- 降本率: ${savingsRate}%\n`;
  if (overBudgetItems.length > 0) {
    prompt += `- ⚠️ 超预算事项: ${overBudgetItems.length} 项\n`;
    for (const item of overBudgetItems) {
      prompt += `  · ${item.title}: 预估 ${item.estimatedAmount!.toLocaleString()} → 成交 ${item.finalAmount!.toLocaleString()} (超${(item.finalAmount! - item.estimatedAmount!).toLocaleString()}元)\n`;
    }
  }
  prompt += '\n';

  // Supplier data
  const suppliers = new Map<string, { count: number; amount: number }>();
  for (const item of items) {
    if (item.supplierName) {
      const s = suppliers.get(item.supplierName) || { count: 0, amount: 0 };
      s.count++;
      s.amount += item.supplierAmount || item.finalAmount || 0;
      suppliers.set(item.supplierName, s);
    }
  }
  if (suppliers.size > 0) {
    prompt += `【供应商分析】\n`;
    prompt += `- 涉及供应商数: ${suppliers.size}\n`;
    const sorted = [...suppliers.entries()].sort((a, b) => b[1].amount - a[1].amount);
    for (const [name, data] of sorted) {
      prompt += `- ${name}: ${data.count} 项, 金额 ${data.amount.toLocaleString()} 元\n`;
    }
    prompt += '\n';
  }

  prompt += `【分类任务详情】\n`;
  for (const [category, categoryItems] of Object.entries(categoryMap)) {
    if (categoryItems.length > 0) {
      const catCompleted = categoryItems.filter((i) => i.status === 'COMPLETED').length;
      prompt += `\n【${category}】(${catCompleted}/${categoryItems.length} 完成)\n`;
      for (const item of categoryItems) {
        const statusText =
          item.status === 'COMPLETED' ? '✓已完成' : item.status === 'IN_PROGRESS' ? '◐进行中' : '○待处理';
        const subStatus = item.subStatus ? ` [${item.subStatus}]` : '';
        const priority = item.priority !== 'MEDIUM' ? ` [优先级:${item.priority}]` : '';
        const progress = item.progress ? `\n  进度: ${item.progress}` : '';
        const dueDate = item.dueDate
          ? `\n  截止: ${new Date(item.dueDate).toLocaleDateString('zh-CN')}`
          : '';
        const completedAt = item.completedAt
          ? `\n  完成时间: ${new Date(item.completedAt).toLocaleDateString('zh-CN')}`
          : '';

        let experienceText = '';
        if (item.experiences && item.experiences.length > 0) {
          const latestExp = item.experiences.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];
          if (latestExp?.content) {
            experienceText = `\n  最新进展: ${latestExp.content}`;
          }
        }

        if (item.statusHistories && item.statusHistories.length > 0) {
          const recentHistory = item.statusHistories
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 2);
          const historyText = recentHistory
            .map(
              (h) =>
                `${new Date(h.createdAt).toLocaleDateString('zh-CN')} ${h.operator.name}: ${h.fromStatus || '?'} → ${h.toStatus || '?'}`
            )
            .join('\n  ');
          prompt += `  ${statusText} ${item.title}${subStatus}${priority}${progress}${dueDate}${completedAt}${experienceText}\n  状态历史:\n  ${historyText}\n`;
        } else {
          prompt += `  ${statusText} ${item.title}${subStatus}${priority}${progress}${dueDate}${completedAt}${experienceText}\n`;
        }
      }
    }
  }

  if (overdueItems.length > 0) {
    prompt += `\n【逾期任务】⚠️\n`;
    for (const item of overdueItems) {
      const daysOverdue = Math.ceil(
        (Date.now() - new Date(item.dueDate!).getTime()) / (1000 * 60 * 60 * 24)
      );
      prompt += `- ${item.title} (逾期${daysOverdue}天)\n`;
    }
  }

  if (updatedInPeriodItems.length > 0) {
    prompt += `\n【周期内进展详情】⭐ 重点关注\n`;
    for (const item of updatedInPeriodItems) {
      const statusText =
        item.status === 'COMPLETED' ? '✓已完成' : item.status === 'IN_PROGRESS' ? '◐进行中' : '○待处理';
      prompt += `\n▸ ${item.title} [${statusText}]\n`;
      if (item.progress) prompt += `  当前进展: ${item.progress}\n`;
      if (item.subStatus) prompt += `  子状态: ${item.subStatus}\n`;
      if (item.experiences && item.experiences.length > 0) {
        const latestExp = item.experiences[0];
        if (latestExp?.content) {
          prompt += `  心得: ${latestExp.content.substring(0, 100)}${latestExp.content.length > 100 ? '...' : ''}\n`;
        }
      }
    }
  }

  if (customRequirements?.trim()) {
    prompt += `\n【用户特殊要求】\n${customRequirements}\n`;
  }

  prompt += `\n请根据以上数据生成一份专业的采购工作报告，要求：\n`;
  prompt += `1. 报告要真实反映数据情况，不要编造数据\n`;
  prompt += `2. 重点总结【周期内进展详情】中的各项进展，这是报告的核心内容\n`;
  prompt += `3. 每个进行中的任务都要说明当前进展到什么阶段\n`;
  prompt += `4. 突出重点工作成果和亮点\n`;
  prompt += `5. 客观分析风险和问题\n`;
  prompt += `6. 提出切实可行的下阶段计划\n\n`;
  prompt += `请用JSON格式返回，字段如下：\n`;
  prompt += `{"summary":"执行摘要","periodProgress":"本周期进展总结","completedTasks":0,"inProgressTasks":0,"pendingTasks":0,"totalTasks":0,"completionRate":0,"totalEstimatedAmount":0,"totalFinalAmount":0,"totalSavings":0,"savingsRate":0,"costAnalysis":"成本分析说明","categories":[{"name":"分类名","tasks":[{"title":"任务","status":"状态","subStatus":"子状态","progress":"进展","completedAt":"完成日期","estimatedAmount":0,"finalAmount":0,"supplierName":""}]}],"supplierStats":[{"name":"供应商名","itemCount":0,"totalAmount":0}],"highlights":["亮点"],"risks":["风险"],"nextSteps":["计划"]}\n`;

  return prompt;
}

// M6 fix: all LLM calls have a 60s timeout via AbortController
async function callLLMApi(provider: LLMProvider, apiKey: string, prompt: string): Promise<string> {
  const config = LLM_CONFIGS[provider];

  if (!config.supported) {
    throw new Error(
      `Provider "${config.name}" is not supported in this version. Please use DeepSeek, 通义千问, or ChatGLM.`
    );
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), LLM_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 3000,
      }),
      signal: ctrl.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${config.name} API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      text?: string;
    };

    const content = data.choices?.[0]?.message?.content || data.text;
    if (!content) throw new Error(`No content from ${config.name}`);
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateReportWithAI(
  items: ItemWithRelations[],
  type: string,
  apiKey?: string | null,
  provider: LLMProvider = LLM_PROVIDERS.DEEPSEEK,
  customRequirements?: string,
  reportScope?: string
): Promise<ReportContent> {
  if (!apiKey) {
    console.log('No API key provided, using fallback report');
    return generateFallbackReport(items);
  }

  try {
    const prompt = buildPrompt(items, type, customRequirements, reportScope);
    const content = await callLLMApi(provider, apiKey, prompt);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0]);
        return {
          summary: result.summary || '报告生成完成',
          periodProgress: result.periodProgress || '',
          completedTasks: result.completedTasks || 0,
          inProgressTasks: result.inProgressTasks || 0,
          pendingTasks: result.pendingTasks || 0,
          totalTasks: result.totalTasks || items.length,
          completionRate: result.completionRate || 0,
          categories: result.categories || [],
          insights: result.insights || result.highlights || [],
          highlights: result.highlights || [],
          risks: result.risks || [],
          nextSteps: result.nextSteps || [],
        };
      } catch {
        console.error('Failed to parse JSON from AI response');
      }
    }
    return generateFallbackReport(items);
  } catch (error) {
    console.error('AI generation error:', error);
    return generateFallbackReport(items);
  }
}

function generateFallbackReport(items: ItemWithRelations[]): ReportContent {
  const completedItems = items.filter((i) => i.status === 'COMPLETED');
  const inProgressItems = items.filter((i) => i.status === 'IN_PROGRESS');
  const todoItems = items.filter((i) => i.status === 'TODO');
  const urgentItems = items.filter((i) => i.priority === 'URGENT' && i.status !== 'COMPLETED');

  let periodProgress = '';
  if (inProgressItems.length > 0) {
    periodProgress = '进行中的任务：\n';
    for (const item of inProgressItems) {
      periodProgress += `• ${item.title}`;
      if (item.subStatus) periodProgress += ` (${item.subStatus})`;
      if (item.progress) periodProgress += ` - ${item.progress}`;
      periodProgress += '\n';
    }
  }

  const categories: ReportContent['categories'] = [
    {
      name: '招标寻源',
      tasks: items
        .filter((i) => i.category === 'PROCUREMENT_SOURCING')
        .map((i) => ({
          title: i.title,
          status: i.status,
          subStatus: i.subStatus || undefined,
          progress: i.progress || undefined,
          completedAt: i.completedAt?.toISOString(),
        })),
    },
    {
      name: '供应商付款',
      tasks: items
        .filter((i) => i.category === 'PAYMENT')
        .map((i) => ({
          title: i.title,
          status: i.status,
          subStatus: i.subStatus || undefined,
          progress: i.progress || undefined,
          completedAt: i.completedAt?.toISOString(),
        })),
    },
    {
      name: '其他',
      tasks: items
        .filter((i) => i.category === 'OTHER')
        .map((i) => ({
          title: i.title,
          status: i.status,
          subStatus: i.subStatus || undefined,
          progress: i.progress || undefined,
          completedAt: i.completedAt?.toISOString(),
        })),
    },
  ];

  const insights: string[] = [];
  if (completedItems.length > 0) insights.push(`本周期完成了 ${completedItems.length} 项采购任务`);
  if (inProgressItems.length > 0) insights.push(`${inProgressItems.length} 项任务正在进行中`);
  if (completedItems.length > inProgressItems.length) insights.push('工作效率较高，任务完成数超过进行中的任务');

  const risks: string[] = [];
  if (urgentItems.length > 0) risks.push(`${urgentItems.length} 项紧急任务需要关注`);
  if (todoItems.length > completedItems.length) risks.push('待处理任务较多，建议加快处理进度');

  return {
    summary: `本周期采购部门共处理 ${items.length} 项任务，其中 ${completedItems.length} 项已完成，${inProgressItems.length} 项进行中，${todoItems.length} 项待处理。`,
    periodProgress: periodProgress || '本周期暂无进行中的任务。',
    completedTasks: completedItems.length,
    inProgressTasks: inProgressItems.length,
    pendingTasks: todoItems.length,
    totalTasks: items.length,
    completionRate: items.length > 0 ? Math.round((completedItems.length / items.length) * 100) : 0,
    categories,
    insights,
    highlights: insights,
    risks,
    nextSteps: todoItems.slice(0, 5).map((i) => `继续推进: ${i.title}`),
  };
}

// M7: only return providers with working implementations
export function getAvailableProviders(): { key: LLMProvider; name: string }[] {
  return Object.entries(LLM_CONFIGS)
    .filter(([, config]) => config.supported)
    .map(([key, config]) => ({ key: key as LLMProvider, name: config.name }));
}
