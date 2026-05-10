export interface LLMProvider {
  key: string;
  name: string;
}

export const DEFAULT_LLM_PROVIDERS: LLMProvider[] = [
  { key: 'deepseek', name: 'DeepSeek' },
  { key: 'qwen', name: '通义千问' },
  { key: 'ernie', name: '文心一言' },
  { key: 'chatglm', name: 'ChatGLM' },
  { key: 'minimax', name: 'MiniMax' },
  { key: 'spark', name: '讯飞星火' },
];