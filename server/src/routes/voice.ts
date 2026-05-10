import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const DASHSCOPE_BASE  = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const PARAFORMER_SUBMIT = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';
const TASK_POLL_BASE  = 'https://dashscope.aliyuncs.com/api/v1/tasks';

const buildSystemPrompt = (today: string) => {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return `你是采购工作站语音助手。今天是${today}。将用户说的话转换为JSON操作指令，只返回JSON不要任何其他文字。

支持的操作：
1. 新建事项（JSON字段说明见下方）
2. 更新状态：{"action":"update_status","keyword":"任务关键词","status":"TODO|IN_PROGRESS|COMPLETED"}
3. 无法识别：{"action":"unknown","text":"原文"}

新建事项 JSON 格式：
{"action":"create","title":"采购对象名称","priority":"URGENT|HIGH|MEDIUM|LOW","dueDate":"YYYY-MM-DD或null","category":"PROCUREMENT_SOURCING|PAYMENT|OTHER","description":"补充说明或null","estimatedAmount":数字或null,"supplierName":"供应商名称或null","supplierAmount":数字或null}

字段规则：
- title：只写采购对象，去掉"创建""新建""任务""紧急""高优先""完成时间"等词
- priority：紧急/urgent→URGENT，高/重要/尽快→HIGH，低/不急→LOW，其余→MEDIUM
- dueDate："明天"="${tomorrow}"，其余日期转YYYY-MM-DD，无→null
- category：寻源/询价/比价/采购/招标→PROCUREMENT_SOURCING；付款/支付/结款/打款→PAYMENT；其他→OTHER
- estimatedAmount：仅PROCUREMENT_SOURCING且提到预算/金额时填数字（元），否则null
- description：PAYMENT类若提到金额写"付款金额：X元"；有其他补充说明也写入；无则null
- supplierName：提到供应商/厂商/品牌名称时填入，否则null
- supplierAmount：提到供应商报价/含税价时填数字（元），否则null

示例：
"创建采购10台电脑寻源任务预算5万" → {"action":"create","title":"采购电脑","priority":"MEDIUM","dueDate":null,"category":"PROCUREMENT_SOURCING","description":"采购数量：10台","estimatedAmount":50000,"supplierName":null,"supplierAmount":null}
"新建向华为公司支付服务器款项20万的任务" → {"action":"create","title":"支付服务器款项","priority":"MEDIUM","dueDate":null,"category":"PAYMENT","description":"付款金额：200000元","estimatedAmount":null,"supplierName":"华为公司","supplierAmount":null}
"采购打印机供应商ABC公司报价8000元高优先级" → {"action":"create","title":"采购打印机","priority":"HIGH","dueDate":null,"category":"PROCUREMENT_SOURCING","description":null,"estimatedAmount":null,"supplierName":"ABC公司","supplierAmount":8000}`;
};

async function transcribeWithParaformer(apiKey: string, b64: string, mimeType: string): Promise<string> {
  // 1. 提交异步转写任务
  const submitResp = await fetch(PARAFORMER_SUBMIT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: 'paraformer-v2',
      input: { file_urls: [`data:${mimeType};base64,${b64}`] },
      parameters: { language_hints: ['zh'] },
    }),
  });

  if (!submitResp.ok) {
    const err = await submitResp.text();
    throw new Error(`Paraformer submit ${submitResp.status}: ${err.slice(0, 200)}`);
  }

  const submitData = (await submitResp.json()) as { output?: { task_id?: string } };
  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error('未返回 task_id');

  // 2. 轮询结果（最多等 20 秒）
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));

    const pollResp = await fetch(`${TASK_POLL_BASE}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const pollData = (await pollResp.json()) as any;
    const status: string = pollData.output?.task_status ?? '';

    if (status === 'SUCCEEDED') {
      const transcriptionUrl: string = pollData.output?.results?.[0]?.transcription_url ?? '';
      if (!transcriptionUrl) return '';
      const textResp = await fetch(transcriptionUrl);
      const textData = (await textResp.json()) as any;
      return (textData.transcripts?.[0]?.text ?? '').trim();
    }

    if (status === 'FAILED') {
      const code: string = pollData.output?.results?.[0]?.code ?? pollData.output?.code ?? '';
      // 静音或无效片段 → 视为"未识别"，不是错误
      if (code === 'SUCCESS_WITH_NO_VALID_FRAGMENT') return '';
      throw new Error(`Paraformer 任务失败: ${code}`);
    }
  }

  throw new Error('转写超时，请重试');
}

async function parseIntentWithQwen(apiKey: string, text: string, today: string): Promise<object> {
  const resp = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen-turbo',
      messages: [
        { role: 'system', content: buildSystemPrompt(today) },
        { role: 'user', content: text },
      ],
    }),
  });

  if (!resp.ok) throw new Error(`qwen-turbo ${resp.status}`);

  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return { action: 'unknown', text: content.trim() };
  try { return JSON.parse(match[0]); } catch { return { action: 'unknown', text: content.trim() }; }
}

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { audio, mimeType } = req.body as { audio?: string; mimeType?: string };

  if (!audio) return res.status(400).json({ error: '缺少音频数据' });

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: '语音服务未配置，请联系管理员' });

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  try {
    const spokenText = await transcribeWithParaformer(apiKey, audio, mimeType || 'audio/wav');
    console.log(`[voice] Paraformer 转写结果: "${spokenText}"`);

    if (!spokenText) return res.json({ action: 'unknown', text: '' });

    const command = await parseIntentWithQwen(apiKey, spokenText, today);
    console.log('[voice] 意图解析:', JSON.stringify(command));
    return res.json(command);
  } catch (err) {
    console.error('[voice] error:', err);
    return res.status(500).json({ error: '语音处理失败，请稍后重试' });
  }
});

export default router;
