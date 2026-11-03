import test from 'node:test';
import assert from 'node:assert/strict';
import { planFallback } from '../src/agent/index.js';

test('规则编排：批量质控类目标应包含查病历与质控', () => {
  const plan = planFallback('把最近质控不通过的病历重新质控');
  const tools = plan.map((p) => p.tool);
  assert.ok(tools.includes('query_records'));
  assert.ok(tools.includes('run_qc'));
  assert.equal(plan.find((p) => p.tool === 'query_records').args.limit, 3, '批量任务应限制数量');
});

test('规则编排：周报类目标应走统计', () => {
  const plan = planFallback('生成本周质控周报');
  assert.ok(plan.some((p) => p.tool === 'qc_statistics'));
});

test('规则编排：批量 + 周报应两步都覆盖', () => {
  const plan = planFallback('把不通过的病历重新质控，并给出本周周报');
  const tools = plan.map((p) => p.tool);
  assert.ok(tools.includes('query_records'));
  assert.ok(tools.includes('run_qc'));
  assert.ok(tools.includes('qc_statistics'));
});

test('规则编排：无法识别的目标兜底为统计', () => {
  const plan = planFallback('帮我看看情况');
  assert.deepEqual(plan.map((p) => p.tool), ['qc_statistics']);
});

test('规则编排：空目标也不应返回空计划', () => {
  const plan = planFallback('');
  assert.ok(plan.length > 0);
});
