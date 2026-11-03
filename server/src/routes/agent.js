import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, audit } from '../middleware/auth.js';
import { runAgent } from '../agent/index.js';
import { TOOL_DEFS } from '../agent/tools.js';

const router = Router();
router.use(requireAuth);

/** 可用工具清单（前端展示用） */
router.get('/tools', (_req, res) => {
  res.json({
    code: 0,
    data: TOOL_DEFS.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      params: Object.keys(t.function.parameters.properties || {}),
    })),
  });
});

/** 执行一个目标 */
router.post('/run', async (req, res) => {
  const goal = String(req.body?.goal || '').trim();
  if (goal.length < 4) {
    return res.status(400).json({ code: 400, message: '请描述你想让 Agent 做的事（至少 4 个字）' });
  }

  const result = await runAgent(goal);

  const r = await query(
    `INSERT INTO agent_runs (user_id, goal, steps, answer, model, status, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      goal.slice(0, 500),
      JSON.stringify(result.steps),
      result.answer,
      result.model,
      result.status,
      result.durationMs,
    ],
  );
  await audit(req, 'agent.run', 'agent_run', r.insertId, `目标：${goal.slice(0, 60)}`);

  res.json({ code: 0, data: { runId: r.insertId, ...result } });
});

/** 运行历史 */
router.get('/runs', async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const rows = await query(
    `SELECT id, goal, answer, model, status, duration_ms, created_at,
            JSON_LENGTH(steps) AS step_count
     FROM agent_runs ORDER BY id DESC LIMIT ?`,
    [limit],
  );
  res.json({ code: 0, data: rows });
});

/** 单次运行详情（回放） */
router.get('/runs/:id', async (req, res) => {
  const row = await one('SELECT * FROM agent_runs WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ code: 404, message: '记录不存在' });
  res.json({
    code: 0,
    data: {
      ...row,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
    },
  });
});

export default router;
