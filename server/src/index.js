import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, hasRemoteAI } from './config.js';

import authRouter from './routes/auth.js';
import patientRouter from './routes/patients.js';
import visitRouter, { deptRouter } from './routes/visits.js';
import recordRouter from './routes/records.js';
import aiRouter from './routes/ai.js';
import dashboardRouter from './routes/dashboard.js';
import { ruleRouter, logRouter, userRouter } from './routes/admin.js';
import kbRouter from './routes/kb.js';
import agentRouter from './routes/agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 简单请求日志
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) console.log(`${new Date().toLocaleTimeString('zh-CN')} ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ code: 0, data: { status: 'ok', ai: hasRemoteAI ? 'deepseek' : 'rule-engine', time: new Date().toISOString() } });
});

app.use('/api/auth', authRouter);
app.use('/api/patients', patientRouter);
app.use('/api/visits', visitRouter);
app.use('/api/departments', deptRouter);
app.use('/api/records', recordRouter);
app.use('/api/ai', aiRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/rules', ruleRouter);
app.use('/api/logs', logRouter);
app.use('/api/users', userRouter);
app.use('/api/kb', kbRouter);
app.use('/api/agent', agentRouter);

// 生产模式：托管前端构建产物
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use('/api', (_req, res) => res.status(404).json({ code: 404, message: '接口不存在' }));

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ code: 500, message: err.message || '服务器内部错误' });
});

app.listen(config.port, config.host, () => {
  console.log(`\n  智医质控 MedAI 服务已启动`);
  console.log(`  接口地址: http://127.0.0.1:${config.port}/api/health`);
  console.log(`  AI 引擎: ${hasRemoteAI ? `DeepSeek (${config.deepseek.model})` : '内置规则引擎（未配置 DEEPSEEK_API_KEY）'}\n`);
});
