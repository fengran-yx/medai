import test from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots, snapshotOf } from '../src/qc/versions.js';
import { toCsv, escapeCsv } from '../src/qc/csv.js';
import { normalizeRules, normalizeCode, weightFactor, matchRuleCode } from '../src/qc/rule-defs.js';
import { applyRulePolicy } from '../src/ai/index.js';
import { localQC } from '../src/ai/local.js';

test('版本 diff：只把真正变化的字段标为 changed', () => {
  const before = {
    chief_complaint: '胸闷 3 月',
    present_illness: '患者 3 月前出现胸闷，活动后加重。',
    past_history: '否认高血压。',
    physical_exam: '心率 80 次/分。',
    auxiliary_exam: '',
    diagnosis: '冠心病',
    treatment: '观察',
  };
  const after = { ...before, present_illness: '患者 3 月前出现胸闷，活动后加重，休息 5 分钟缓解。', auxiliary_exam: '心电图 ST 段压低' };
  const changes = diffSnapshots(before, after);
  assert.deepEqual(changes.filter((c) => c.changed).map((c) => c.field), ['present_illness', 'auxiliary_exam']);
  assert.equal(changes.find((c) => c.field === 'diagnosis').changed, false);
  assert.equal(changes.find((c) => c.field === 'present_illness').label, '现病史');
});

test('快照只保留病历正文，不把 id/状态等易变字段算进 diff', () => {
  const snap = snapshotOf({ id: 1, status: 'qc_failed', chief_complaint: '头痛 1 天', present_illness: 'x' });
  assert.equal(snap.id, undefined);
  assert.equal(snap.status, undefined);
  assert.equal(snap.chief_complaint, '头痛 1 天');
});

test('CSV：带 UTF-8 BOM，逗号/引号/换行正确转义', () => {
  assert.equal(escapeCsv('普通文本'), '普通文本');
  assert.equal(escapeCsv('含,逗号'), '"含,逗号"');
  assert.equal(escapeCsv('含"引号'), '"含""引号"');
  const csv = toCsv(['姓名', '诊断'], [['张三', '肺炎, 重症'], ['李四', '含"引号"']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"肺炎, 重症"/);
  assert.match(csv, /"含""引号"""/);
});

test('规则归一：历史编码映射到新编码，权重系数按默认权重缩放', () => {
  assert.equal(normalizeCode('C-PRESENT_ILLNESS'), 'C-002');
  assert.equal(normalizeCode('C-PRESENT_ILLNESS-SHORT'), 'C-008');
  const map = normalizeRules([{ code: 'C-002', weight: 11, severity: 'major', enabled: 1 }]);
  assert.equal(map.get('C-002').severity, 'major');
  assert.equal(weightFactor(map, 'C-002'), 0.5);
  assert.equal(map.get('C-001').enabled, 1, '未出现在 DB 的规则用默认值补齐');
});

test('AI 问题清单：停用规则被过滤，严重程度跟随配置，风险重算', () => {
  const report = {
    issues: [
      { ruleCode: 'C-001', severity: 'critical', rule: '主诉缺失' },
      { ruleCode: 'C-PRESENT_ILLNESS', severity: 'critical', rule: '现病史缺失' },
      { ruleCode: 'L-001', severity: 'major', rule: '主诉与现病史不一致' },
    ],
    risk: 3,
  };
  const result = applyRulePolicy(report, [
    { code: 'C-001', enabled: 1, severity: 'minor', weight: 22 },
    { code: 'C-002', enabled: 0, severity: 'critical', weight: 22 },
    { code: 'L-001', enabled: 1, severity: 'major', weight: 12 },
  ]);
  assert.equal(result.issues.length, 2);
  assert.equal(result.issues.find((i) => i.ruleCode === 'C-001').severity, 'minor');
  assert.equal(result.risk, 2, '无 critical 后风险应降为 2');
});

test('诊断缺失应命中 C-007 且为严重问题', () => {
  const r = localQC({ chief_complaint: '头痛 1 天', present_illness: '1 天前出现头痛，无发热。', diagnosis: '' });
  assert.ok(r.issues.some((i) => i.ruleCode === 'C-007' && i.severity === 'critical'));
});

test('AI 错标编码按语义纠正，不按编码张冠李戴', () => {
  assert.equal(
    matchRuleCode({ ruleCode: 'C-001', rule: '主诉与现病史不符', field: 'chief_complaint', message: '疼痛持续时间前后矛盾' }),
    'L-001',
  );
  assert.equal(
    matchRuleCode({ ruleCode: 'C-007', rule: '术语不规范', field: 'diagnosis', message: '使用口语化描述，表述不规范' }),
    'T-001',
  );
  assert.equal(
    matchRuleCode({ ruleCode: 'C-002', rule: '现病史缺项', field: 'present_illness', message: '未记录发病以来一般情况' }),
    'C-008',
  );
  assert.equal(
    matchRuleCode({ ruleCode: 'C-003', rule: '既往史与现病史重复', field: 'present_illness', message: '重复记录高血压病史' }),
    'AI-001',
    '无法归类的完整性问题不应硬套缺失规则',
  );
  assert.equal(
    matchRuleCode({ ruleCode: 'C-005', rule: '辅助检查缺失', field: 'auxiliary_exam', message: '辅助检查未填写' }),
    'C-005',
  );
  assert.equal(
    matchRuleCode({ ruleCode: 'AI-001', rule: '辅助检查缺失', field: '辅助检查', message: '未填写' }),
    'C-005',
    'AI 返回中文字段名时也应能映射',
  );
});
