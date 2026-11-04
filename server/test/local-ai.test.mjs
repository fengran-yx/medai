import test from 'node:test';
import assert from 'node:assert/strict';
import { localQC, localDiagnosis, localChat } from '../src/ai/local.js';

const complete = {
  chief_complaint: '发热伴咳嗽 3 天',
  present_illness: '患者 3 天前无明显诱因出现发热，最高 38.6℃，伴咳嗽、咳黄痰，自服退热药可缓解，无呼吸困难。',
  past_history: '否认高血压、糖尿病史，否认药物过敏。',
  physical_exam: 'T 38.2℃，双肺呼吸音粗，右下肺可闻及湿啰音。',
  auxiliary_exam: '血常规 WBC 11.2×10⁹/L，CRP 32 mg/L。',
  diagnosis: '社区获得性肺炎',
  treatment: '予抗感染、祛痰治疗，3 天后复查血常规。',
};

test('完整病历应达到 A 级或 B 级', () => {
  const r = localQC(complete);
  assert.ok(['A', 'B'].includes(r.level), `实际等级 ${r.level}，分数 ${r.score}`);
  assert.ok(r.score >= 80, `分数应 >= 80，实际 ${r.score}`);
  assert.equal(r.dimensions.completeness, 100);
});

test('缺少现病史属于严重问题，应扣分并封顶 72', () => {
  const r = localQC({ ...complete, present_illness: '' });
  assert.ok(r.score <= 72, `分数应封顶 72，实际 ${r.score}`);
  assert.ok(r.issues.some((i) => i.ruleCode === 'C-002' && i.severity === 'critical'));
  assert.equal(r.risk, 3);
});

test('停用规则后该问题不再出现、也不再扣分', () => {
  const disabled = localQC({ ...complete, present_illness: '' }, {
    rules: [
      { code: 'C-001', enabled: 1, weight: 22, severity: 'critical' },
      { code: 'C-002', enabled: 0, weight: 22, severity: 'critical' },
      { code: 'C-003', enabled: 1, weight: 12, severity: 'major' },
      { code: 'C-004', enabled: 1, weight: 12, severity: 'major' },
      { code: 'C-005', enabled: 1, weight: 8, severity: 'minor' },
      { code: 'C-006', enabled: 1, weight: 12, severity: 'major' },
      { code: 'C-007', enabled: 1, weight: 20, severity: 'critical' },
      { code: 'C-008', enabled: 1, weight: 6, severity: 'minor' },
    ],
  });
  assert.ok(!disabled.issues.some((i) => i.ruleCode === 'C-002'), '停用规则不应再出现在问题清单');
  const on = localQC({ ...complete, present_illness: '' });
  assert.ok(on.score < disabled.score, `停用后分数应更高：${disabled.score} vs ${on.score}`);
});

test('规则权重按比例影响扣分，严重程度以配置为准', () => {
  const base = localQC({ ...complete, present_illness: '' });
  const lighter = localQC({ ...complete, present_illness: '' }, {
    rules: [
      { code: 'C-001', enabled: 1, weight: 22, severity: 'critical' },
      { code: 'C-002', enabled: 1, weight: 11, severity: 'major' },
      { code: 'C-003', enabled: 1, weight: 12, severity: 'major' },
      { code: 'C-004', enabled: 1, weight: 12, severity: 'major' },
      { code: 'C-005', enabled: 1, weight: 8, severity: 'minor' },
      { code: 'C-006', enabled: 1, weight: 12, severity: 'major' },
      { code: 'C-007', enabled: 1, weight: 20, severity: 'critical' },
      { code: 'C-008', enabled: 1, weight: 6, severity: 'minor' },
    ],
  });
  const issue = lighter.issues.find((i) => i.ruleCode === 'C-002');
  assert.equal(issue.severity, 'major', '严重程度应跟随配置');
  assert.ok(lighter.score > base.score, `降权后分数应更高：${lighter.score} vs ${base.score}`);
});

test('主诉与现病史不一致应被识别', () => {
  const r = localQC({
    ...complete,
    chief_complaint: '腹痛伴腹泻 2 天',
    present_illness: '患者 2 天前出现咽痛、鼻塞，伴低热，自服感冒药后略缓解，精神食欲可。',
  });
  assert.ok(r.issues.some((i) => i.ruleCode === 'L-001'), '应命中 L-001');
});

test('现病史缺少时间要素应被识别', () => {
  const r = localQC({
    ...complete,
    present_illness: '患者出现发热，伴咳嗽咳痰，自服药物后缓解，无呼吸困难，精神可。',
  });
  assert.ok(r.issues.some((i) => i.ruleCode === 'L-002'), '应命中 L-002');
});

test('模糊表述应被识别为术语问题', () => {
  const r = localQC({ ...complete, physical_exam: '神志清，未见明显异常。' });
  assert.ok(r.issues.some((i) => i.ruleCode === 'T-001'));
});

test('评分与等级必须落在合法区间', () => {
  const r = localQC({});
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(['A', 'B', 'C', 'D'].includes(r.level));
  assert.ok(r.risk >= 0 && r.risk <= 3);
});

test('辅助诊断：发热咳嗽应命中呼吸道感染', () => {
  const r = localDiagnosis({ symptoms: '发热 3 天，咳嗽咳黄痰，咽痛', exams: 'WBC 11.2', age: 35, gender: '男' });
  assert.ok(r.possibleDiagnoses.length > 0);
  assert.match(r.possibleDiagnoses[0].name, /上呼吸道感染|肺炎/);
  assert.ok(r.recommendedExams.length > 0);
  assert.ok(r.redFlags.length > 0);
  assert.ok(r.disclaimer.includes('仅供临床参考'));
});

test('辅助诊断：信息不足时应给出兜底建议而不是臆断', () => {
  const r = localDiagnosis({ symptoms: '最近状态不好' });
  assert.match(r.possibleDiagnoses[0].name, /进一步明确|待定/);
  assert.ok(r.triage.length > 0);
});

test('离线问答应返回非空且包含免责提示', () => {
  const a = localChat('病历质控主要看哪些维度？');
  assert.ok(a.length > 20);
  assert.match(a, /完整性|准确性/);
  const b = localChat('高血压患者用药注意什么');
  assert.match(b, /血压|降压/);
});
