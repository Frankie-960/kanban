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
if (!API_KEY) { console.error('DASHSCOPE_API_KEY 未设置'); process.exit(1); }

const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

const SYSTEM_PROMPT = `你是采购工作看板语音助手。今天是${today}。将用户说的话转换为JSON操作指令，只返回JSON不要任何其他文字。

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
"采购打印机供应商是ABC公司报价8000元高优先级" → {"action":"create","title":"采购打印机","priority":"HIGH","dueDate":null,"category":"PROCUREMENT_SOURCING","description":null,"estimatedAmount":null,"supplierName":"ABC公司","supplierAmount":8000}`;

async function parseIntent(text) {
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

async function run() {
  // 1. 登录拿 token
  const loginResp = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: '844723538@qq.com', password: 'cc960960' }),
  });
  if (!loginResp.ok) { console.error('登录失败'); process.exit(1); }
  const { token } = await loginResp.json();
  console.log('登录成功\n');

  // 2. 测试用例：语音文本 → 意图解析 → POST /api/items → 验证数据库字段
  const cases = [
    {
      input: '创建采购10台电脑寻源任务预算5万',
      check: (item) => item.category === 'PROCUREMENT_SOURCING' && item.estimatedAmount === 50000 && item.description && item.description.includes('10'),
      desc: 'category=PROCUREMENT_SOURCING, estimatedAmount=50000, description含"10"',
    },
    {
      input: '新建向华为公司支付服务器款项20万的任务',
      check: (item) => item.category === 'PAYMENT' && item.supplierName === '华为公司' && item.description && item.description.includes('20'),
      desc: 'category=PAYMENT, supplierName=华为公司, description含金额',
    },
    {
      input: '采购打印机供应商是ABC公司报价8000元高优先级',
      check: (item) => item.priority === 'HIGH' && item.supplierName === 'ABC公司' && item.supplierAmount === 8000,
      desc: 'priority=HIGH, supplierName=ABC公司, supplierAmount=8000',
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const cmd = await parseIntent(c.input);
    if (cmd.action !== 'create') {
      console.log(`❌ "${c.input}"\n   意图解析返回 action=${cmd.action}\n`);
      continue;
    }

    const body = { title: (cmd.title || '').trim() || '语音新建任务', priority: cmd.priority || 'MEDIUM' };
    if (cmd.dueDate && cmd.dueDate !== 'null') { try { body.dueDate = new Date(cmd.dueDate).toISOString(); } catch (e) {} }
    if (cmd.category && cmd.category !== 'null') body.category = cmd.category;
    if (cmd.description && cmd.description !== 'null') body.description = cmd.description;
    if (cmd.estimatedAmount != null && cmd.estimatedAmount !== 'null') body.estimatedAmount = cmd.estimatedAmount;
    if (cmd.supplierName && cmd.supplierName !== 'null') body.supplierName = cmd.supplierName;
    if (cmd.supplierAmount != null && cmd.supplierAmount !== 'null') body.supplierAmount = cmd.supplierAmount;

    const createResp = await fetch('http://localhost:3001/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const item = await createResp.json();

    const ok = c.check(item);
    console.log(`${ok ? '✅' : '❌'} "${c.input}"`);
    console.log(`   期望: ${c.desc}`);
    console.log(`   实际: title=${item.title}, category=${item.category}, description=${item.description}, estimatedAmount=${item.estimatedAmount}, supplierName=${item.supplierName}, supplierAmount=${item.supplierAmount}\n`);
    if (ok) pass++;
  }
  console.log(`结果: ${pass}/${cases.length} 通过`);
  if (pass < cases.length) process.exit(1);
}

run().catch((e) => { console.error(e.message); process.exit(1); });
