import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, query } from '../db.js';
import { requireAuth, requireRole, audit } from '../middleware/auth.js';

/* ---------------- 质控规则 ---------------- */
export const ruleRouter = Router();
ruleRouter.use(requireAuth);

ruleRouter.get('/', async (_req, res) => {
  const rows = await query('SELECT * FROM qc_rules ORDER BY category, id');
  res.json({ code: 0, data: rows });
});

ruleRouter.put('/:id', requireRole('admin', 'quality'), async (req, res) => {
  const rule = await one('SELECT * FROM qc_rules WHERE id = ?', [req.params.id]);
  if (!rule) return res.status(404).json({ code: 404, message: '规则不存在' });
  const { enabled, weight, severity } = req.body || {};
  await query('UPDATE qc_rules SET enabled = ?, weight = ?, severity = ? WHERE id = ?', [
    enabled !== undefined ? (enabled ? 1 : 0) : rule.enabled,
    weight ?? rule.weight,
    severity ?? rule.severity,
    req.params.id,
  ]);
  await audit(req, 'rule.update', 'qc_rule', Number(req.params.id), `更新规则 ${rule.name}`);
  res.json({ code: 0, message: '规则已更新' });
});

/* ---------------- 审计日志 ---------------- */
export const logRouter = Router();
logRouter.use(requireAuth);

logRouter.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Number(req.query.size) || 20);
  const { action, keyword } = req.query;
  const where = [];
  const params = [];
  if (action) { where.push('action LIKE ?'); params.push(`%${action}%`); }
  if (keyword) { where.push('(user_name LIKE ? OR detail LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await one(`SELECT COUNT(*) AS c FROM audit_logs ${whereSql}`, params);
  const rows = await query(
    `SELECT * FROM audit_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  res.json({ code: 0, data: { list: rows, total: total.c, page, size } });
});

/* ---------------- 用户管理 ---------------- */
export const userRouter = Router();
userRouter.use(requireAuth);

userRouter.get('/', requireRole('admin'), async (_req, res) => {
  const rows = await query(
    `SELECT u.id, u.username, u.name, u.role, u.title, u.phone, u.status, u.last_login_at, u.created_at,
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
  const { name, role, title, deptId, phone, status, password } = req.body || {};
  if (Number(req.params.id) === req.user.id && status === 0) {
    return res.status(400).json({ code: 400, message: '不能停用当前登录账号' });
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
    await query('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(password, 10), req.params.id]);
  }
  await audit(req, 'user.update', 'user', Number(req.params.id), `更新用户 ${name || user.name}`);
  res.json({ code: 0, message: '用户已更新' });
});
