# 智医质控 MedAI · AI 病历质控与辅助诊疗平台

<p align="center">
  <a href="https://github.com/fengran-yx/medai/actions/workflows/ci.yml"><img src="https://github.com/fengran-yx/medai/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/license-MIT-brightgreen.svg" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933.svg" alt="Node">
  <img src="https://img.shields.io/badge/vue-3.5-42b883.svg" alt="Vue">
  <img src="https://img.shields.io/badge/MySQL-8.0-4479A1.svg" alt="MySQL">
  <img src="https://img.shields.io/badge/AI-DeepSeek-4B6BFB.svg" alt="DeepSeek">
</p>

> 面向医院病案质量的 AI 平台：自动识别病历缺项、逻辑矛盾、诊断与检查不符、术语不规范，给出四维度评分与整改建议；同时提供 AI 辅助诊断、医学问答、质控看板与审计留痕。

**技术栈**：Vue 3 + TypeScript + Vite + Element Plus + ECharts ｜ Node.js + Express ｜ MySQL 8.0 ｜ DeepSeek 大模型

**状态**：核心功能可用 · CI 全绿（单测 + 集成冒烟 + 前端构建）· 含 36 份演示病历与完整部署脚本

![质控驾驶舱](docs/screenshots/dashboard.png)

| 病历质控 | AI 辅助诊断 |
| --- | --- |
| ![病历列表](docs/screenshots/records.png) | ![辅助诊断](docs/screenshots/diagnosis.png) |

| 病历详情 + AI 质控报告 | AI 医学助手 |
| --- | --- |
| ![病历详情](docs/screenshots/record-detail.png) | ![医学助手](docs/screenshots/assistant.png) |

> 想按代码执行顺序逐步理解实现？看 **[docs/代码导读.md](docs/代码导读.md)**（从建表 SQL 到一次 AI 质控的完整链路）。
>
> 想快速看效果？**[讲解版演示视频](docs/智医质控-MedAI-讲解版.mp4)**（3 分 12 秒，中文配音，走完登录→质控→诊断→问答全流程）；也有 [1 分 21 秒纯字幕版](docs/演示视频.mp4)。

---

## 一、5 分钟跑起来

### 0. 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20 | 已内置 npm |
| MySQL | 8.0 | 默认端口 3306 |
| 浏览器 | Chrome / Edge | — |

### 1. 配置数据库连接

编辑 `server/.env`，把 `DB_PASSWORD` 改成你自己的 MySQL root 密码：

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的密码
DB_NAME=medai
```

### 2. 建库建表 + 写入演示数据

```bash
cd server
npm install
npm run db:init     # 创建 medai 库与 10 张表
npm run db:seed     # 写入 20 位患者、36 份病历、质控报告等演示数据
```

### 3. 启动后端（端口 8801）

```bash
cd server
npm run dev
```

看到 `智医质控 MedAI 服务已启动` 即可，健康检查：<http://127.0.0.1:8801/api/health>

### 4. 启动前端（端口 5180）

```bash
cd web
npm install
npm run dev
```

打开 <http://127.0.0.1:5180> 登录。

### 演示账号

| 角色 | 账号 | 密码 | 可见功能 |
| --- | --- | --- | --- |
| 质控医师 | `quality` | `qc123456` | 全部质控功能、看板、规则调整、日志 |
| 临床医师 | `doctor` | `doc123456` | 仅本人病历、AI 辅助诊断、医学助手 |
| 系统管理员 | `admin` | `admin123` | 全部 + 用户管理 |

---

## 二、功能地图

| 模块 | 说明 |
| --- | --- |
| 质控驾驶舱 | 患者数、今日病历、30 天平均分、通过率、待处理；趋势图 / 科室分布 / 高频问题 / 最近质控 |
| 病历质控 | 病历列表（状态、科室、关键词筛选）→ 一键 AI 质控 → 四维度评分 + 问题清单 + 整改建议 |
| 病历详情 | 结构化字段编辑（主诉 / 现病史 / 既往史 / 查体 / 辅助检查 / 诊断 / 处理意见），质控历史时间线 |
| 患者管理 | 患者主索引、就诊档案抽屉、新增 / 编辑 |
| AI 辅助诊断 | 症状 + 检查 → 鉴别诊断（含 ICD-10）、建议检查、危险信号、分诊建议 |
| AI 医学助手 | 多会话问答，落库保存历史 |
| 质控规则 | 12 条规则，按完整性 / 准确性 / 逻辑性 / 规范性分类，可启停与调权重 |
| 操作日志 | 登录、质控、建档、诊断、规则调整全留痕 |
| 用户管理 | 新增账号、改角色 / 科室、启停、重置密码 |

---

## 三、AI 能力：双引擎设计

```
                        ┌──────────────────────────┐
   病历 / 症状输入  ───▶ │  ai/index.js  统一入口    │
                        └───────────┬──────────────┘
                                    │
                    ┌───────────────┴───────────────┐
            配置了 DEEPSEEK_API_KEY          未配置 / 调用失败
                    │                               │
            DeepSeek Chat 补全                 本地规则引擎
        （JSON 模式，强制结构化输出）      （local.js，可解释、零成本、离线）
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                    统一结构 { score, dimensions, issues, ... }
```

- **DeepSeek 模式**：在 `server/.env` 填入 `DEEPSEEK_API_KEY`，质控 / 诊断 / 问答全部走大模型，`response_format: json_object` 保证结构化，返回后仍用 `normalizeQC()` 做字段校验与钳制。
- **规则引擎模式**：默认模式，无需 Key 即可完整演示。按「完整性 40% + 准确性 30% + 逻辑性 20% + 规范性 10%」加权，再对严重问题额外扣分并设置分数上限（例如出现必填项缺失，分数封顶 72 分）。
- **自动降级**：大模型超时（45s）、报错、返回非 JSON 时，自动回退规则引擎，前端会标注 `rule-engine(fallback)`。

---

## 四、目录结构

```
medai/
├── server/                     # 后端
│   ├── .env                    # 数据库 / JWT / DeepSeek 配置
│   ├── package.json
│   ├── sql/
│   │   └── schema.sql          # 10 张表的建表脚本
│   ├── scripts/
│   │   ├── init-db.js          # 建库建表
│   │   └── seed.js             # 演示数据（bcrypt 密码、质控报告、日志）
│   └── src/
│       ├── index.js            # Express 入口、路由挂载、静态托管
│       ├── config.js           # 环境变量统一读取
│       ├── db.js               # mysql2 连接池 / query / transaction
│       ├── middleware/auth.js  # JWT 鉴权、角色校验、审计日志
│       ├── ai/
│       │   ├── index.js        # DeepSeek 调用 + 结构化校验 + 降级
│       │   └── local.js        # 规则引擎（质控 / 诊断 / 问答）
│       └── routes/
│           ├── auth.js         # 登录、当前用户、改密码
│           ├── patients.js     # 患者 CRUD
│           ├── visits.js       # 就诊 + 科室字典
│           ├── records.js      # 病历 CRUD + AI 质控 + 质控历史
│           ├── ai.js           # 辅助诊断、多轮问答、会话管理
│           ├── dashboard.js    # 看板聚合查询
│           └── admin.js        # 规则、日志、用户
└── web/                        # 前端
    ├── vite.config.ts          # /api 代理到 8801
    └── src/
        ├── main.ts             # 挂载 Element Plus / Pinia / Router
        ├── api/http.ts         # axios 拦截器（token、401、错误提示）
        ├── api/index.ts        # 全部接口的类型化封装
        ├── stores/auth.ts      # 登录态
        ├── router/index.ts     # 路由 + 登录/角色守卫
        ├── layout/MainLayout.vue
        ├── components/QCPanel.vue   # 质控报告展示组件
        └── views/              # 9 个页面
```

---

## 五、数据库设计（10 张表）

| 表 | 作用 | 关键点 |
| --- | --- | --- |
| `departments` | 科室字典 | 临床 / 医技 / 管理分类 |
| `users` | 用户 | bcrypt 密码、三种角色、状态 |
| `patients` | 患者主索引 | 病案号唯一、过敏史 |
| `visits` | 就诊记录 | 就诊流水号、就诊类型 |
| `medical_records` | 电子病历 | 7 个结构化字段 + 状态机 |
| `qc_rules` | 质控规则 | 维度 / 严重程度 / 权重 / 启停 |
| `qc_reports` | 质控报告 | 总分、四维度分、`issues` JSON、模型、耗时 |
| `diagnosis_sessions` | 辅助诊断记录 | 入参 + 结果 JSON |
| `ai_chats` / `ai_messages` | AI 会话与消息 | 多轮上下文 |
| `audit_logs` | 审计日志 | 操作人、动作、对象、IP |

> 所有表 `ENGINE=InnoDB`、`utf8mb4`，外键约束齐全；`issues` 用 JSON 列存储，前端直接消费。

---

## 六、接口一览（前缀 `/api`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/login` | 登录，返回 JWT |
| GET | `/auth/me` | 当前用户 |
| POST | `/auth/change-password` | 修改密码 |
| GET | `/patients` `?page&size&keyword` | 患者分页 |
| POST/PUT | `/patients` `/patients/:id` | 新增 / 更新 |
| GET | `/patients/:id` | 患者 + 就诊档案 |
| GET/POST | `/visits` | 就诊分页 / 新建 |
| GET | `/departments` | 科室字典 |
| GET/POST | `/records` | 病历分页 / 新建 |
| GET/PUT | `/records/:id` | 病历详情 / 保存 |
| POST | `/records/:id/qc` | **运行 AI 质控** |
| GET | `/records/:id/qc-history` | 质控历史 |
| POST | `/ai/diagnosis` | **AI 辅助诊断** |
| POST | `/ai/chat` | 多轮问答 |
| GET | `/ai/chats` `/ai/chats/:id/messages` | 会话列表 / 消息 |
| GET | `/dashboard/overview` `trends` `dept-distribution` `issue-categories` `recent-qc` | 看板 |
| GET/PUT | `/rules` `/rules/:id` | 规则 |
| GET | `/logs` | 审计日志 |
| GET/POST/PUT | `/users` | 用户管理（仅 admin） |

统一响应：`{ code: 0, data, message? }`，`code` 非 0 时前端拦截器自动提示。

---

## 七、在 Trae 中使用

1. Trae →「文件 → 打开文件夹」→ 选择 `F:\deepseek文件\medai`。
2. 根目录已内置 `.trae/rules/project-rules.md`，Trae 的 AI 会自动加载项目规范（命名、分层、SQL 习惯），后续让它改功能时风格不会跑偏。
3. 建议开两个终端（Trae 内置终端）：
   - 终端 A：`cd server && npm run dev`
   - 终端 B：`cd web && npm run dev`
4. 在 Trae 里选中代码右键「解释代码」，或直接在对话里说「给病历列表加一个按评分区间筛选」，它会基于项目上下文改。

---

## 八、生产部署要点

```bash
cd web && npm run build          # 产物 web/dist
cd server && npm start           # 自动托管 web/dist，单端口 8801
```

- 反代示例（Nginx）：`location / { proxy_pass http://127.0.0.1:8801; }`
- 必须修改：`JWT_SECRET`、数据库密码、`DEEPSEEK_API_KEY`
- 建议补充：HTTPS、登录失败次数限制、患者数据脱敏、数据库定期备份

---

## 九、免责声明

本项目为教学 / 演示用途，AI 输出不构成诊疗建议。真实医疗场景使用需通过等保测评、数据安全评估，并建立医师复核机制；请勿录入真实患者隐私数据。
