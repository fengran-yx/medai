# 安全说明

## 这是一个演示 / 教学项目

智医质控 MedAI **不是**通过等保测评的医疗信息系统，**不要**直接用于承载真实患者病历。

演示数据由 `server/scripts/seed.js` 生成，人物姓名、病案号、检查结果均为虚构。

## 已有的安全措施

| 措施 | 实现位置 |
| --- | --- |
| 密码 bcrypt 哈希（cost 10） | `server/src/routes/auth.js` |
| JWT 鉴权 + 过期时间 | `server/src/middleware/auth.js` |
| 基于角色的访问控制（admin / quality / clinician） | `requireRole()` |
| SQL 全参数化，禁止拼接 | `server/src/db.js` + 各路由 |
| 关键操作审计日志 | `audit()`，写入 `audit_logs` |
| 敏感配置走 `.env`，已加入 `.gitignore` | `server/.env.example` |

## 上生产前必须补的

- [ ] 换掉 `JWT_SECRET` 与数据库密码，使用密钥管理服务
- [ ] 全站 HTTPS（Nginx + 证书）
- [ ] 登录失败锁定、图形验证码、接口限流
- [ ] 患者数据脱敏（姓名、身份证、手机号）与访问留痕
- [ ] 数据库定时备份 + 恢复演练
- [ ] 依赖漏洞扫描（`npm audit`）纳入 CI
- [ ] 按《个人信息保护法》《数据安全法》完成合规评估

## 报告漏洞

发现安全问题请**不要**开公开 issue，直接发邮件到仓库 owner 的 GitHub 邮箱，或在 GitHub 上使用 [Private vulnerability reporting](https://github.com/fengran-yx/medai/security/advisories/new)。

我们会在 7 天内响应。

## 已知取舍

- 演示环境为方便，`.env.example` 里是占位符，真实 `.env` 不入库；
- 前端默认把 JWT 存在 `localStorage`，生产环境建议改为 HttpOnly Cookie + CSRF 防护；
- AI 输出一律附带免责声明，最终诊断责任在医师。
