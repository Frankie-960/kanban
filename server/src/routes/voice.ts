import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { audio, mimeType } = req.body as { audio?: string; mimeType?: string };

  if (!audio) return res.status(400).json({ error: '缺少音频数据' });

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: '语音服务未配置，请联系管理员' });

  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  try {
    const audioDataUrl = `data:${mimeType || 'audio/webm'};base64,${audio}`;

    const resp = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen-audio-turbo',
        messages: [
          {
            role: 'system',
            content: `你是采购工作看板语音助手。今天是${today}。识别用户语音并只返回JSON操作指令，不要有任何其他文字或解释。
支持的操作：
1. 新建事项：{"action":"create","title":"任务名称","priority":"URGENT|HIGH|MEDIUM|LOW","dueDate":"YYYY-MM-DD或null"}
2. 更新状态：{"action":"update_status","keyword":"任务关键词","status":"TODO|IN_PROGRESS|COMPLETED"}
3. 无法识别：{"action":"unknown","text":"识别到的原文"}
priority默认MEDIUM，dueDate没有则为null，日期格式必须是YYYY-MM-DD。`,
          },
          {
            role: 'user',
            content: [
              { type: 'audio_url', audio_url: { url: audioDataUrl } },
              { type: 'text', text: '请分析语音，返回JSON指令' },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[voice] DashScope error:', resp.status, errText);
      return res.status(502).json({ error: '语音识别服务异常，请稍后重试' });
    }

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? '';

    // Model may wrap JSON in markdown code fences — extract raw object
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return res.json({ action: 'unknown', text: content.trim() });

    try {
      const command = JSON.parse(match[0]);
      return res.json(command);
    } catch {
      return res.json({ action: 'unknown', text: content.trim() });
    }
  } catch (err) {
    console.error('[voice] error:', err);
    return res.status(500).json({ error: '语音处理失败' });
  }
});

export default router;
