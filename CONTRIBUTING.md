# 贡献指南

感谢关注智医质控 MedAI。这个项目首先是**学习与作品展示**用途，同时也按真实医疗信息系统的规范在写。

## 一、先跑起来

```bash
# 1. 数据库
cd server
cp .env.example .env        # 改成你自己的 MySQL 密码
npm install
npm run db:init
npm run db:seed             # 20 位患者 / 36 份病历 / 质控报告

# 2. 后端
npm run dev                 # http://127.0.0.1:8801

# 3. 前端（另开终端）
cd web
npm install
npm run dev                 # http://127.0.0.1:5180
```

演示账号：`quality / qc123456`、`doctor / doc123456`、`admin / admin123`

## 二、提 PR 之前

请确保本地这三步都能过（CI 跑的是同样的事）：

```bash
# 1. 后端单测（9 个用例，无需数据库）
cd server && node --test test/*.test.mjs

# 2. 后端语法检查
find server/src -name '*.js' -exec node --check {} \;

# 3. 前端类型检查 + 构建
cd web && npm run build
```

## 三、代码约定

| 层 | 约定 |
| --- | --- |
| 后端 | ESM（`import`/`export`），路由放 `src/routes/`，一个业务域一个文件 |
| SQL | 只走 `src/db.js` 的 `query` / `one` / `transaction`，**必须使用 `?` 占位符**，禁止拼接 |
| 接口 | 统一返回 `{ code: 0, data }`，错误 `{ code: 4xx, message }` |
| 鉴权 | Router 顶部 `router.use(requireAuth)`，管理接口加 `requireRole('admin')` |
| 审计 | 写操作完成后调用 `audit(req, action, targetType, targetId, detail)` |
| 前端 | `<script setup lang="ts">`，接口只通过 `src/api/index.ts` 调用，不直接写 axios |
| 样式 | 只用 `src/styles/global.css` 的 CSS 变量，不硬编码品牌色 |
| AI | 大模型调用必须经 `src/ai/index.js`，新增能力要实现「结构化校验 + 超时 + 降级」 |

完整规范见 [`.trae/rules/project-rules.md`](.trae/rules/project-rules.md)。

## 四、提交信息

用 Conventional Commits：

```
feat: 病历列表支持按评分区间筛选
fix: 修复质控报告 JSON 字段为空时崩溃
docs: 补充 RAG 设计方案
ci: 增加前端构建缓存
refactor: 抽取质控评分权重到配置
```

## 五、涉及医疗数据的红线

- **不要提交真实患者信息**，演示数据必须是造出来的；
- 新增导出、日志、埋点时，确认不会把姓名、身份证、病案号泄露出去；
- AI 输出必须保留免责声明，不能宣称「可直接用于诊疗」。

## 六、新增一个 AI 能力的检查清单

1. 提示词写在 `src/ai/` 里，要求模型「只输出 JSON」；
2. 返回后做字段校验与数值钳制（参考 `normalizeQC`）；
3. 设置超时（45s）与失败降级；
4. 落库时记录 `model` 与 `duration_ms`，方便排查与算成本；
5. 补至少 1 个单测覆盖降级路径。

## 七、常见问题

**Q：没有 DeepSeek Key 能跑吗？**
能。不配 `DEEPSEEK_API_KEY` 时自动使用本地规则引擎，功能完整，只是没有大模型的自然语言能力。

**Q：数据库连不上？**
检查 `server/.env` 的 `DB_PASSWORD`，以及 MySQL 服务是否启动（`net start MySQL80`）。

**Q：前端 5173 端口被占用？**
`npm run dev -- --port 5180`。
