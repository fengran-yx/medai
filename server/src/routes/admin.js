import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, query } from '../db.js';
import { requireAuth, requireRole, audit } from '../middleware/auth.js';
import { invalidateRules, countIssueHits } from '../qc/rules.js';
import { normalizeCode } from '../qc/rule-defs.js';
import { verifyStoredChain } from '../audit/chain.js';
import { toCsv } from '../qc/csv.js';
import { validatePassword } from '../auth/password.js';

/* ---------------- 质控规则 ---------------- */
export const ruleRouter = Router();
ruleRouter.use(requireAuth);

ruleRouter.get('/', async (_req, res) => {
  const rows = await query('SELECT * FROM qc_rules ORDER BY category, id');
  res.json({ code: 0, data: rows });
});

/** 近 30 天各规则命中次数，让管理端看到规则的"实际影响面" */
ruleRouter.get('/usage', async (_req, res) => {
  const rows = await query(
    'SELECT issues FROM qc_reports WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) ORDER BY id DESC LIMIT 500',
  );
  res.json({ code: 0, data: countIssueHits(rows, normalizeCode) });
});

ruleRouter.put('/:id', requireRole('admin', 'quality'), async (req, res) => {
  const rule = await one('SELECT * FROM qc_rules WHERE id = ?', [req.params.id]);
  if (!rule) return res.status(404).json({ code: 404, message: '规则不存在' });
  const { enabled, weight, severity } = req.body || {};
  const nextSeverity = ['critical', 'major', 'minor'].includes(severity) ? severity : rule.severity;
  const nextWeight = weight === undefined ? rule.weight : Math.max(0, Math.min(50, Number(weight) || 0));
  await query('UPDATE qc_rules SET enabled = ?, weight = ?, severity = ? WHERE id = ?', [
    enabled !== undefined ? (enabled ? 1 : 0) : rule.enabled,
    nextWeight,
    nextSeverity,
    req.params.id,
  ]);
  invalidateRules();
  await audit(req, 'rule.update', 'qc_rule', Number(req.params.id), `更新规则 ${rule.name}`);
  res.json({ code: 0, message: '规则已更新，下一次质控立即生效' });
});

/* ---------------- 审计日志 ---------------- */
export const logRouter = Router();
logRouter.use(requireAuth);
logRouter.use(requireRole('admin', 'quality'));

function logFilters(req) {
  const { action, keyword } = req.query;
  const where = [];
  const params = [];
  if (action) { where.push('action LIKE ?'); params.push(`%${action}%`); }
  if (keyword) { where.push('(user_name LIKE ? OR detail LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

logRouter.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Number(req.query.size) || 20);
  const { whereSql, params } = logFilters(req);
  const total = await one(`SELECT COUNT(*) AS c FROM audit_logs ${whereSql}`, params);
  const rows = await query(
    `SELECT id, user_id, user_name, action, target_type, target_id, detail, ip, prev_hash, hash, created_at
     FROM audit_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  res.json({ code: 0, data: { list: rows, total: total.c, page, size } });
});

/** 校验审计哈希链完整性 */
logRouter.get('/verify', async (_req, res) => {
  const result = await verifyStoredChain();
  res.json({ code: 0, data: result });
});

/** 导出审计日志 CSV */
logRouter.get('/export.csv', async (req, res) => {
  const { whereSql, params } = logFilters(req);
  const rows = await query(
    `SELECT id, user_name, action, target_type, target_id, detail, ip, hash, created_at
     FROM audit_logs ${whereSql} ORDER BY id DESC LIMIT 5000`,
    params,
  );
  const csv = toCsv(
    ['序号', '操作人', '操作', '对象类型', '对象ID', '详情', 'IP', '哈希', '时间'],
    rows.map((r) => [r.id, r.user_name, r.action, r.target_type, r.target_id, r.detail, r.ip, r.hash, r.created_at]),
  );
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="medai-audit-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`智医质控-审计日志-${stamp}.csv`)}`,
  );
  res.send(csv);
});

/* ---------------- 用户管理 ---------------- */
export const userRouter = Router();
userRouter.use(requireAuth);

userRouter.get('/', requireRole('admin'), async (_req, res) => {
  const rows = await query(
    `SELECT u.id, u.username, u.name, u.role, u.title, u.phone, u.status, u.last_login_at, u.created_at,
            u.failed_attempts, u.locked_until, u.token_version,
            d.name AS dept_name
     FROM users u LEFT JOIN departments d ON d.id = u.dept_id ORDER BY u.id`,
  );
  res.json({ code: 0, data: rows });
});

userRouter.post('/', requireRole('admin'), async (req, res) => {
  const { username, password, name, role, title, deptId, phone } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ code: 400, message: '用户名、密码、姓名为必填项' });
  }
  const policyError = validatePassword(password, username);
  if (policyError) return res.status(400).json({ code: 400, message: policyError });
  const exists = await one('SELECT id FROM users WHERE username = ?', [username]);
  if (exists) return res.status(409).json({ code: 409, message: '用户名已存在' });
  const hash = await bcrypt.hash(password, 10);
  const r = await query(
    `INSERT INTO users (username, password, name, role, title, dept_id, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [username, hash, name, role || 'clinician', title || null, deptId || null, phone || null],
  );
  await audit(req, 'user.create', 'user', r.insertId, `创建用户 ${name}`);
  res.json({ code: 0, data: { id: r.insertId }, message: '用户已创建' });
});

userRouter.put('/:id', requireRole('admin'), async (req, res) => {
  const user = await one('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
  const { name, role, title, deptId, phone, status, password, unlock, forceLogout } = req.body || {};
  if (Number(req.params.id) === req.user.id && status === 0) {
    return res.status(400).json({ code: 400, message: '不能停用当前登录账号' });
  }
  if (password) {
    const policyError = validatePassword(password, user.username);
    if (policyError) return res.status(400).json({ code: 400, message: policyError });
  }
  await query(
    `UPDATE users SET name = ?, role = ?, title = ?, dept_id = ?, phone = ?, status = ? WHERE id = ?`,
    [
      name ?? user.name,
      role ?? user.role,
      title ?? user.title,
      deptId ?? user.dept_id,
      phone ?? user.phone,
      status !== undefined ? (status ? 1 : 0) : user.status,
      req.params.id,
    ],
  );
  if (password) {
    await query(
      'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
      [await bcrypt.hash(password, 10), req.params.id],
    );
  }
  if (unlock) {
    await query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [req.params.id]);
  }
  if (forceLogout) {
    await query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.params.id]);
  }
  const notes = [
    password ? '重置密码' : '',
    unlock ? '解锁账号' : '',
    forceLogout ? '强制下线' : '',
  ].filter(Boolean).join('、');
  await audit(req, 'user.update', 'user', Number(req.params.id), `更新用户 ${name || user.name}${notes ? `（${notes}）` : ''}`);
  res.json({ code: 0, message: '用户已更新' });
});
