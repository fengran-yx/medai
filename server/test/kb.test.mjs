import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, chunkText } from '../src/kb/tokenize.js';
import { buildIndex, search, bm25Score, cosine } from '../src/kb/search.js';

test('分词：中文按单字 + 双字切分，英文按词', () => {
  const t = tokenize('现病史应当写明起病时间');
  assert.ok(t.includes('现病'), '应包含双字词项');
  assert.ok(t.includes('病'), '应包含单字');
  const en = tokenize('ICD-10 code ABC');
  assert.ok(en.includes('icd-10') || en.includes('icd'));
  assert.ok(en.includes('abc'));
  assert.ok(!en.includes('the'), '停用词应被过滤');
});

test('切块：按【小节】强制断块，且过滤过短块', () => {
  const text = [
    '【主诉】主诉是指促使患者就诊的主要症状及持续时间，一般不超过二十字。',
    '【现病史】现病史应当按时间顺序书写，包括起病时间、症状特点、演变过程与诊治经过。',
    '【既往史】包括既往健康状况、疾病史、手术外伤史与药物过敏史。',
    '短',
  ].join('\n');
  const chunks = chunkText(text, { maxLen: 200 });
  assert.ok(chunks.length >= 3, `应切成至少 3 块，实际 ${chunks.length}`);
  assert.ok(chunks.every((c) => c.length >= 20), '不应包含过短块');
});

test('切块：空文本返回空数组', () => {
  assert.deepEqual(chunkText('   '), []);
});

test('检索：能命中主题相关的块，且排在前面', () => {
  const chunks = [
    { id: 1, docId: 1, title: '病历书写基本规范', content: '【主诉】主诉是指促使患者就诊的主要症状及持续时间，一般不超过二十字。' },
    { id: 2, docId: 2, title: '抗菌药物使用要求', content: '抗菌药物分为三级管理，特殊使用级需会诊同意后开具。' },
    { id: 3, docId: 3, title: '核心制度', content: '死亡病例讨论应在患者死亡后一周内完成，讨论记录归入病历。' },
  ];
  const index = buildIndex(chunks);

  const hits = search(index, '主诉怎么写', 3);
  assert.ok(hits.length > 0);
  assert.equal(hits[0].id, 1, '主诉问题应命中主诉文档');

  const hits2 = search(index, '死亡病例讨论时间', 3);
  assert.equal(hits2[0].id, 3);

  const hits3 = search(index, '抗菌药物分级', 3);
  assert.equal(hits3[0].id, 2);
});

test('检索：无关问题不应返回高置信结果', () => {
  const index = buildIndex([
    { id: 1, docId: 1, title: 'A', content: '【主诉】主诉是指促使患者就诊的主要症状及持续时间。' },
  ]);
  const hits = search(index, '今天天气怎么样', 3);
  assert.ok(hits.every((h) => h.score < 0.4), '无关问题分数应偏低');
});

test('BM25 与余弦：完全无关时分数为 0', () => {
  const index = buildIndex([
    { id: 1, docId: 1, title: 'A', content: '甲乙丙丁戊己庚辛' },
  ]);
  const score = bm25Score(index, index.docs[0], tokenize('完全无关'));
  assert.equal(score, 0);
  assert.equal(cosine({ a: 1 }, { b: 1 }), 0);
});

test('BM25：词频越高分数越高', () => {
  const chunks = [
    { id: 1, docId: 1, title: 'A', content: '肺炎 肺炎 肺炎 发热 咳嗽' },
    { id: 2, docId: 2, title: 'B', content: '肺炎 高血压 糖尿病 随访' },
  ];
  const index = buildIndex(chunks);
  const hits = search(index, '肺炎', 2);
  assert.equal(hits[0].id, 1, '同一词项出现更多次应排前面');
});
