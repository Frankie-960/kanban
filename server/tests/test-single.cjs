'use strict';
const fs = require('fs'), path = require('path');
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}
const API_KEY = process.env.DASHSCOPE_API_KEY;
const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const SYSTEM_PROMPT = `你是采购工作站语音助手。今天是${today}。将用户说的话转换为JSON操作指令，只返回JSON不要任何其他文字。

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
"采购打印机供应商是ABC公司报价8000元高优先级" → {"action":"create","title":"采购打印机","priority":"HIGH","dueDate":null,"category":"PROCUREMENT_SOURCING","description":null,"estimatedAmount":null,"supplierName":"ABC公司","supplierAmount":8000}
"创建采购服务器任务紧急明天截止" → {"action":"create","title":"采购服务器","priority":"URGENT","dueDate":"${tomorrow}","category":"PROCUREMENT_SOURCING","description":null,"estimatedAmount":null,"supplierName":null,"supplierAmount":null}`;

async function testIntent(text) {
  const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-turbo', messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: text }] }),
  });
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  const match = content.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : { action: 'unknown', raw: content };
}

const input = process.argv[2] || '创建20台笔记本电脑采购任务，预算10万';
console.log(`输入: "${input}"`);
testIntent(input).then(r => console.log('解析结果:', JSON.stringify(r, null, 2))).catch(console.error);
