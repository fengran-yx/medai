import { Router } from 'express';
import { requireAuth, requireRole, audit } from '../middleware/auth.js';
import { listTasks, closeTask, submitTask } from '../qc/tasks.js';

const router = Router();
router.use(requireAuth);

/** 整改任务列表：质控/管理员看全量，临床医师只看本人 */
router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Number(req.query.size) || 20);
  const data = await listTasks({
    user: req.user,
    page,
    size,
    status: req.query.status || '',
    deptId: req.query.deptId || '',
    keyword: String(req.query.keyword || '').trim(),
  });
  res.json({ code: 0, data });
});

/** 提交整改（临床医师提交本人任务，质控/管理员可代提交） */
router.post('/:id/submit', async (req, res, next) => {
  try {
    const result = await submitTask({
      taskId: Number(req.params.id),
      user: req.user,
      note: req.body?.note,
    });
    if (result.error) return res.status(result.error.status).json({ code: result.error.status, message: result.error.message });
    await audit(req, 'rectify.submit', 'rectify_task', Number(req.params.id), `提交整改：${req.body?.note || '已整改待复核'}`);
    res.json({ code: 0, message: '整改已提交，等待质控复核' });
  } catch (err) {
    next(err);
  }
});

/** 质控科人工关闭任务 */
router.post('/:id/close', requireRole('quality', 'admin'), async (req, res, next) => {
  try {
    const result = await closeTask({
      taskId: Number(req.params.id),
      user: req.user,
      note: req.body?.note,
    });
    if (result.error) return res.status(result.error.status).json({ code: result.error.status, message: result.error.message });
    await audit(req, 'rectify.close', 'rectify_task', Number(req.params.id), `关闭整改任务：${req.body?.note || '人工确认完成'}`);
    res.json({ code: 0, message: '整改任务已关闭' });
  } catch (err) {
    next(err);
  }
});

export default router;
