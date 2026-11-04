import test from 'node:test';
import assert from 'node:assert/strict';
import { hashAudit, verifyAuditRows, formatDateTime } from '../src/audit/hash.js';
import { validatePassword } from '../src/auth/password.js';
import { levelOf } from '../src/qc/tasks.js';

function buildChain(rows) {
  let prev = '';
  return rows.map((row, i) => {
    const full = { id: i + 1, created_at: `2026-11-04 10:00:0${i}`, ...row };
    const hash = hashAudit(full, prev);
    const saved = { ...full, prev_hash: prev, hash };
    prev = hash;
    return saved;
  });
}

test('审计哈希链：正常链校验通过', () => {
  const rows = buildChain([
    { user_name: '李静', action: 'login', detail: '登录系统' },
    { user_name: '李静', action: 'record.qc', detail: '质控得分 88' },
    { user_name: '张明', action: 'rule.update', detail: '调整权重' },
  ]);
  const result = verifyAuditRows(rows);
  assert.equal(result.ok, true);
  assert.equal(result.checked, 3);
});

test('审计哈希链：篡改任一条内容会被发现', () => {
  const rows = buildChain([
    { user_name: '李静', action: 'login', detail: '登录系统' },
    { user_name: '李静', action: 'record.qc', detail: '质控得分 88' },
    { user_name: '张明', action: 'rule.update', detail: '调整权重' },
  ]);
  rows[1] = { ...rows[1], detail: '质控得分 95' };
  const result = verifyAuditRows(rows);
  assert.equal(result.ok, false);
  assert.equal(result.brokenId, 2);
});

test('审计哈希链：删除中间一条会被发现', () => {
  const rows = buildChain([
    { action: 'a' }, { action: 'b' }, { action: 'c' },
  ]);
  const result = verifyAuditRows([rows[0], rows[2]]);
  assert.equal(result.ok, false);
  assert.equal(result.brokenId, 3);
});

test('审计哈希链：字段变化会改变哈希', () => {
  const base = { user_id: 1, user_name: '李静', action: 'login', created_at: '2026-11-04 10:00:00' };
  assert.notEqual(hashAudit(base, ''), hashAudit({ ...base, detail: '额外内容' }, ''));
  assert.notEqual(hashAudit(base, ''), hashAudit(base, 'prev-hash'));
  assert.equal(formatDateTime(new Date(2026, 10, 4, 9, 5, 3)), '2026-11-04 09:05:03');
});

test('密码策略：长度、字母+数字、弱口令、包含登录名', () => {
  assert.equal(validatePassword('Test12345!', 'locktest'), null);
  assert.match(validatePassword('short1', 'u'), /8-64/);
  assert.match(validatePassword('12345678', 'u'), /字母和数字/);
  assert.match(validatePassword('abcdefgh', 'u'), /字母和数字/);
  assert.match(validatePassword('Admin123', 'admin'), /不能包含登录名/);
  assert.match(validatePassword('admin123', 'someone'), /过于简单/);
});

test('质控等级映射：90/80/60 分界', () => {
  assert.equal(levelOf(90), 'A');
  assert.equal(levelOf(89.9), 'B');
  assert.equal(levelOf(80), 'B');
  assert.equal(levelOf(79.9), 'C');
  assert.equal(levelOf(60), 'C');
  assert.equal(levelOf(59.9), 'D');
});
