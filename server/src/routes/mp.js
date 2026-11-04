/**
 * 微信小程序登录与院内账号绑定。
 *
 * 流程：
 *   1. 小程序 wx.login → code
 *   2. POST /api/mp/login { code }
 *      - 已绑定 openid：直接发 JWT
 *      - 未绑定：返回 bindToken（10 分钟，内含 openid，不直接暴露给前端）
 *   3. POST /api/mp/login { bindToken, username, password }
 *      - 校验院内账号密码 → 绑定 openid → 发 JWT
 *
 * 正式启用需要配置 WECHAT_MP_APPID / WECHAT_MP_SECRET；
 * 未配置时返回 503，前端回退到院内账号密码登录。
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config, hasWechatMP } from '../config.js';
import { one, query } from '../db.js';
import { signToken, audit } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();
const MAX_ATTEMPTS = Math.max(3, Number(process.env.LOGIN_MAX_ATTEMPTS || 5));
const LOCK_MINUTES = Math.max(1, Number(process.env.LOGIN_LOCK_MINUTES || 15));

async function jscode2session(code) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = `${config.wechat.apiBase}/sns/jscode2session`
      + `?appid=${encodeURIComponent(config.wechat.mpAppId)}`
      + `&secret=${encodeURIComponent(config.wechat.mpSecret)}`
      + `&js_code=${encodeURIComponent(code)}`
      + '&grant_type=authorization_code';
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.errcode) {
      const codeText = data.errcode ? `errcode=${data.errcode} ${data.errmsg || ''}` : `HTTP ${res.status}`;
      throw new Error(codeText);
    }
    if (!data.openid) throw new Error('微信未返回 openid');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function isLocked(user) {
  return user?.locked_until && new Date(user.locked_until).getTime() > Date.now();
}

function lockedMessage(user) {
  const minutes = Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000));
  return `账号因连续登录失败已被锁定，请 ${minutes} 分钟后再试或联系管理员解锁`;
}

async function loginPayload(user) {
  const dept = user.dept_id ? await one('SELECT name FROM departments WHERE id = ?', [user.dept_id]) : null;
  await query('UPDATE users SET last_login_at = NOW(), failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
  return {
    token: signToken(user),
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      title: user.title,
      deptId: user.dept_id,
      deptName: dept?.name || null,
    },
  };
}

router.get('/status', (_req, res) => {
  res.json({ code: 0, data: { configured: hasWechatMP } });
});

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: '登录尝试过于频繁，请稍后再试' }), async (req, res, next) => {
  try {
    const { code, bindToken, username, password } = req.body || {};

    if (bindToken) {
      let payload;
      try {
        payload = jwt.verify(bindToken, config.jwtSecret);
      } catch {
        return res.status(401).json({ code: 401, message: '绑定凭证已过期，请重新微信登录' });
      }
      if (payload.purpose !== 'mp-bind' || !payload.openid) {
        return res.status(401).json({ code: 401, message: '绑定凭证无效' });
      }
      if (!username || !password) {
        return res.status(400).json({ code: 400, message: '请输入院内账号和密码完成绑定' });
      }
      const user = await one('SELECT * FROM users WHERE username = ?', [username]);
      if (isLocked(user)) return res.status(423).json({ code: 423, message: lockedMessage(user) });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        if (user) {
          const attempts = Number(user.failed_attempts || 0) + 1;
          if (attempts >= MAX_ATTEMPTS) {
            await query(
              `UPDATE users SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ${LOCK_MINUTES} MINUTE) WHERE id = ?`,
              [user.id],
            );
            return res.status(423).json({ code: 423, message: `连续 ${MAX_ATTEMPTS} 次密码错误，账号已锁定 ${LOCK_MINUTES} 分钟` });
          }
          await query('UPDATE users SET failed_attempts = ? WHERE id = ?', [attempts, user.id]);
        }
        return res.status(401).json({ code: 401, message: '院内账号或密码错误' });
      }
      if (user.status !== 1) return res.status(403).json({ code: 403, message: '账号已被停用' });
      if (user.wechat_openid && user.wechat_openid !== payload.openid) {
        return res.status(409).json({ code: 409, message: '该院内账号已绑定其他微信，请联系管理员解绑' });
      }

      await query(
        `UPDATE users SET wechat_openid = ?, wechat_unionid = ?, wechat_bound_at = NOW() WHERE id = ?`,
        [payload.openid, payload.unionid || null, user.id],
      );
      const updated = await one('SELECT * FROM users WHERE id = ?', [user.id]);
      const payloadData = await loginPayload(updated);
      await audit({ user: updated, ip: req.ip }, 'mp.bind', 'user', updated.id, '微信绑定院内账号');
      await audit({ user: updated, ip: req.ip }, 'mp.login', 'user', updated.id, '微信小程序登录');
      return res.json({ code: 0, data: payloadData, message: '微信绑定成功' });
    }

    if (!code) return res.status(400).json({ code: 400, message: '缺少微信登录 code' });
    if (!hasWechatMP) {
      return res.status(503).json({ code: 503, message: '微信登录未配置（WECHAT_MP_APPID / WECHAT_MP_SECRET）' });
    }

    let wx;
    try {
      wx = await jscode2session(code);
    } catch (err) {
      return res.status(502).json({ code: 502, message: `微信登录失败：${err.message}` });
    }

    const user = await one('SELECT * FROM users WHERE wechat_openid = ?', [wx.openid]);
    if (!user) {
      const bindToken = jwt.sign(
        { openid: wx.openid, unionid: wx.unionid || null, purpose: 'mp-bind' },
        config.jwtSecret,
        { expiresIn: '10m' },
      );
      return res.json({ code: 0, data: { needBind: true, bindToken } });
    }
    if (user.status !== 1) return res.status(403).json({ code: 403, message: '账号已被停用' });
    if (isLocked(user)) return res.status(423).json({ code: 423, message: lockedMessage(user) });

    const data = await loginPayload(user);
    await audit({ user, ip: req.ip }, 'mp.login', 'user', user.id, '微信小程序登录');
    return res.json({ code: 0, data });
  } catch (err) {
    next(err);
  }
});

export default router;
