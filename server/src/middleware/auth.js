import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';
import { appendAudit } from '../audit/chain.js';

export function signToken(user) {
  return jwt.sign(
    {
      uid: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      tv: Number(user.token_version || 0),
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

/** 必须登录 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ code: 401, message: '未登录或登录已过期' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await one(
      'SELECT id, username, name, role, title, dept_id, status, token_version FROM users WHERE id = ?',
      [payload.uid],
    );
    if (!user || user.status !== 1) {
      return res.status(401).json({ code: 401, message: '账号不存在或已停用' });
    }
    if (Number(payload.tv ?? 0) !== Number(user.token_version || 0)) {
      return res.status(401).json({ code: 401, message: '登录状态已失效，请重新登录' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ code: 401, message: '登录状态已失效，请重新登录' });
  }
}

/** 角色校验 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ code: 403, message: '当前角色无此操作权限' });
    }
    next();
  };
}

/** 写审计日志（失败不影响主流程） */
export async function audit(req, action, targetType = null, targetId = null, detail = null) {
  try {
    await appendAudit({
      user: req.user ? { id: req.user.id, name: req.user.name } : null,
      action,
      targetType,
      targetId,
      detail,
      ip: req.ip || '',
    });
  } catch (err) {
    console.error('[audit]', err.message);
  }
}
