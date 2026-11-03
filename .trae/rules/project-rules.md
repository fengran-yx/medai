---
description: 智医质控 MedAI 项目规范（Trae 自动加载）
globs: ["**/*"]
alwaysApply: true
---

# 智医质控 MedAI · 项目规则

## 项目定位
AI 病历质控与辅助诊疗平台。前后端分离：`web`（Vue3 + TS + Element Plus + ECharts）、`server`（Node ESM + Express + MySQL8）、`server/src/ai`（DeepSeek + 规则引擎双引擎）。

## 后端规范
- 全部使用 ESM（`import` / `export`），不要引入 CommonJS。
- 路由文件放在 `src/routes/`，一个业务域一个文件；统一 `express.Router()`。
- 数据库访问只用 `src/db.js` 导出的 `query` / `one` / `transaction`，禁止在路由里新建连接。
- 所有 SQL 必须使用 `?` 占位符参数化，禁止字符串拼接（防注入）。
- 接口统一返回 `{ code: 0, data }`；出错返回 `{ code: 4xx, message }`，由 `src/index.js` 的错误中间件兜底。
- 需要登录的路由在 Router 顶部 `router.use(requireAuth)`；管理员接口加 `requireRole('admin')`。
- 写操作完成后调用 `audit(req, action, targetType, targetId, detail)` 记审计日志。
- 中文注释，解释「为什么」而不是「是什么」。

## 前端规范
- 组件使用 `<script setup lang="ts">` + Composition API。
- 接口调用只能通过 `src/api/index.ts`，不要在组件里直接写 axios。
- 页面放 `src/views/`，可复用组件放 `src/components/`，命名 `XxxView.vue` / `XxxPanel.vue`。
- 颜色只用 `src/styles/global.css` 中的 CSS 变量（`--brand-*`、`--ink-*`），不要硬编码品牌色。
- 表格页统一结构：`.page-head` → `.card` → `.toolbar` → `el-table` → `.pager`。
- 所有列表接口都要有 loading 状态与空数据提示。

## 数据库规范
- 表名蛇形复数，字段蛇形；主键 `id BIGINT AUTO_INCREMENT`。
- 时间字段用 `DATETIME`，默认 `CURRENT_TIMESTAMP`。
- 枚举用 `VARCHAR` + 注释，不用 MySQL ENUM。
- 结构化 AI 结果用 `JSON` 列（如 `qc_reports.issues`）。
- 改表结构时同步更新 `server/sql/schema.sql` 与 `README.md` 的表说明。

## AI 相关
- 所有大模型调用必须经过 `src/ai/index.js`，禁止在路由里直接 fetch DeepSeek。
- 新增 AI 能力必须实现：结构化 JSON 校验 + 超时控制 + 失败降级。
- 提示词统一写中文，要求模型「只输出 JSON」，并在返回后做字段钳制。
- 任何 AI 结果都必须带免责声明。

## 提交前自检
1. `cd server && node --check src/index.js` 无语法错误。
2. 新接口用 curl 跑通一次（带 Token）。
3. 前端 `cd web && npx vue-tsc --noEmit` 无类型报错。
