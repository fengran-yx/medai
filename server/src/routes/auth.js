import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, query } from '../db.js';
import { signToken, requireAuth, audit } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { validatePassword } from '../auth/password.js';

const router = Router();

const MAX_ATTEMPTS = Math.max(3, Number(process.env.LOGIN_MAX_ATTEMPTS || 5));
const LOCK_MINUTES = Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES || 15));

function lockedMessage(lockedUntil) {
  const ms = new Date(lockedUntil).getTime() - Date.now();
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return `账号因连续登录失败已被锁定，请 ${minutes} 分钟后再试或联系管理员解锁`;
}

// 同一 IP 15 分钟内最多 10 次登录尝试，防暴力破解
router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: '登录尝试过于频繁，请 15 分钟后再试' }), async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '请输入用户名和密码' });
  }
  const user = await one('SELECT * FROM users WHERE username = ?', [username]);

  if (user?.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return res.status(423).json({ code: 423, message: lockedMessage(user.locked_until) });
  }
  if (!user || !(await bcrypt.compare(password, user.password))) {
    if (user) {
      const attempts = Number(user.failed_attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await query(
          `UPDATE users SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ${LOCK_MINUTES} MINUTE)
           WHERE id = ?`,
          [user.id],
        );
        await audit(
          { user: { id: user.id, name: user.name }, ip: req.ip },
          'login.locked',
          'user',
          user.id,
          `连续 ${MAX_ATTEMPTS} 次密码错误，账号锁定 ${LOCK_MINUTES} 分钟`,
        );
        return res.status(423).json({ code: 423, message: `连续 ${MAX_ATTEMPTS} 次登录失败，账号已锁定 ${LOCK_MINUTES} 分钟` });
      }
      await query('UPDATE users SET failed_attempts = ? WHERE id = ?', [attempts, user.id]);
      await audit(
        { user: { id: user.id, name: user.name }, ip: req.ip },
        'login.fail',
        'user',
        user.id,
        `密码错误（第 ${attempts}/${MAX_ATTEMPTS} 次）`,
      );
    }
    return res.status(401).json({ code: 401, message: '用户名或密码错误' });
  }
  if (user.status !== 1) return res.status(403).json({ code: 403, message: '账号已被停用' });

  await query(
    'UPDATE users SET last_login_at = NOW(), failed_attempts = 0, locked_until = NULL WHERE id = ?',
    [user.id],
  );
  const token = signToken(user);
  const dept = user.dept_id ? await one('SELECT name FROM departments WHERE id = ?', [user.dept_id]) : null;
  await audit({ user, ip: req.ip }, 'login', 'user', user.id, '登录系统');

  res.json({
    code: 0,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        title: user.title,
        deptId: user.dept_id,
        deptName: dept?.name || null,
      },
    },
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const dept = req.user.dept_id ? await one('SELECT name FROM departments WHERE id = ?', [req.user.dept_id]) : null;
  res.json({ code: 0, data: { ...req.user, deptName: dept?.name || null } });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const policyError = validatePassword(newPassword, req.user.username);
  if (policyError) return res.status(400).json({ code: 400, message: policyError });
  if (oldPassword && oldPassword === newPassword) {
    return res.status(400).json({ code: 400, message: '新密码不能与原密码相同' });
  }
  const user = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(oldPassword || '', user.password))) {
    return res.status(400).json({ code: 400, message: '原密码不正确' });
  }
  await query(
    'UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?',
    [await bcrypt.hash(newPassword, 10), user.id],
  );
  const updated = await one('SELECT * FROM users WHERE id = ?', [user.id]);
  await audit(req, 'user.change_password', 'user', user.id, '修改密码，其他会话已失效');
  // 当前会话换发新 token，其他设备上的旧 token 因 token_version 变化而失效
  res.json({ code: 0, data: { token: signToken(updated) }, message: '密码已更新，其他设备登录已失效' });
});

export default router;
