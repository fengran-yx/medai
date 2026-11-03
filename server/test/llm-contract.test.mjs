/**
 * 大模型链路契约测试：用本地 mock 的 OpenAI 兼容服务，验证「真的会走远程分支」
 *
 * 注意：config.js 是模块级单例，只会读取一次 env。
 * 所以这里只起一个 mock 服务、只加载一次 ai 模块，用可变的 handler 切换返回内容。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const RECORD = {
  chief_complaint: '反复胸闷 3 月',
  present_illness: '患者 3 月前活动后出现胸闷，休息可缓解，无明显诱因。',
  past_history: '否认高血压史。',
  physical_exam: '心肺听诊未见异常。',
  auxiliary_exam: '心电图未见异常。',
  diagnosis: '胸闷待查',
  treatment: '建议完善检查。',
};

const QC_JSON = {
  score: 88,
  level: 'B',
  dimensions: { completeness: 90, accuracy: 86, logic: 88, terminology: 85 },
  risk: 1,
  issues: [{ ruleCode: 'T-001', rule: '术语不规范', severity: 'minor', field: 'physical_exam', message: '表述笼统', suggestion: '补充阳性体征' }],
  suggestions: ['补充既往史细节'],
  summary: '整体尚可，建议补充查体细节。',
};

let handler = null;
let lastRequest = null;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    lastRequest = { headers: req.headers, body: body ? JSON.parse(body) : null, url: req.url };
    handler(req, res);
  });
});

function reply(res, content, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
}

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

process.env.DEEPSEEK_API_KEY = 'test-key';
process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${port}`;
process.env.DEEPSEEK_MODEL = 'mock-model';

const { runQC, runRagAnswer } = await import('../src/ai/index.js');

test.after(() => {
  server.closeAllConnections?.();
  server.close();
});

test('配置 Key 后 runQC 走远程分支并采用模型结果', async () => {
  handler = (req, res) => reply(res, JSON.stringify(QC_JSON));

  const r = await runQC(RECORD);
  assert.equal(r.score, 88);
  assert.equal(r.level, 'B');
  assert.equal(r.model, 'mock-model');
  assert.equal(r.issues.length, 1);

  assert.match(lastRequest.url, /\/chat\/completions$/);
  assert.equal(lastRequest.headers.authorization, 'Bearer test-key');
  assert.deepEqual(lastRequest.body.response_format, { type: 'json_object' });
  assert.ok(lastRequest.body.messages.length >= 2);
});

test('模型用代码块包裹时也能解析', async () => {
  handler = (req, res) => reply(res, '```json\n' + JSON.stringify(QC_JSON) + '\n```');
  const r = await runQC(RECORD);
  assert.equal(r.score, 88);
});

test('模型返回缺字段时用规则引擎兜底补齐', async () => {
  handler = (req, res) => reply(res, JSON.stringify({ score: 70 }));
  const r = await runQC(RECORD);
  assert.equal(r.score, 70);
  assert.ok(r.dimensions.completeness > 0, '维度应由兜底结果补齐');
  assert.ok(Array.isArray(r.issues));
});

test('模型返回越界分数会被钳制到 0-100', async () => {
  handler = (req, res) => reply(res, JSON.stringify({ ...QC_JSON, score: 250 }));
  const r = await runQC(RECORD);
  assert.ok(r.score <= 100, `分数应被钳制，实际 ${r.score}`);
});

test('服务端 500 时自动降级为规则引擎', async () => {
  handler = (req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal' }));
  };
  const r = await runQC(RECORD);
  assert.match(String(r.model), /rule-engine/);
  assert.ok(r.score >= 0 && r.score <= 100);
});

test('返回非 JSON 时降级而不是抛错', async () => {
  handler = (req, res) => reply(res, '抱歉，我无法完成这个请求。');
  const r = await runQC(RECORD);
  assert.match(String(r.model), /rule-engine/);
});

test('RAG 回答会把检索片段拼进提示词并返回引用式文本', async () => {
  handler = (req, res) => reply(res, '现病史需写明起病时间与演变过程 [1]。');

  const r = await runRagAnswer({
    question: '现病史怎么写',
    contexts: [
      { title: '病历书写基本规范', content: '【现病史】应当按时间顺序书写，包括起病时间。' },
      { title: '质控规则', content: '缺现病史扣 35 分。' },
    ],
  });
  assert.match(r.content, /\[1\]/);
  assert.equal(r.source, 'deepseek');

  const userMsg = lastRequest.body.messages.find((m) => m.role === 'user').content;
  assert.match(userMsg, /病历书写基本规范/);
  assert.match(userMsg, /\[1\]/);
});
