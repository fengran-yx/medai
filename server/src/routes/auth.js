import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, query } from '../db.js';
import { signToken, requireAuth, audit } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();

// 同一 IP 15 分钟内最多 10 次登录尝试，防暴力破解
router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: '登录尝试过于频繁，请 15 分钟后再试' }), async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '请输入用户名和密码' });
  }
  const user = await one('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ code: 401, message: '用户名或密码错误' });
  }
  if (user.status !== 1) return res.status(403).json({ code: 403, message: '账号已被停用' });

  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
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
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ code: 400, message: '新密码至少 6 位' });
  }
  const user = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(oldPassword || '', user.password))) {
    return res.status(400).json({ code: 400, message: '原密码不正确' });
  }
  await query('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(newPassword, 10), user.id]);
  await audit(req, 'user.change_password', 'user', user.id, '修改密码');
  res.json({ code: 0, message: '密码已更新' });
});

export default router;
