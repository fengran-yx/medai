import { Router } from 'express';
import { requireAuth, requireRole, audit } from '../middleware/auth.js';
import { listPendingReviews } from '../qc/tasks.js';
import { reviewReport } from '../qc/review.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('quality', 'admin'));

/** 待复核队列 */
router.get('/pending', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(50, Number(req.query.size) || 20);
  const data = await listPendingReviews({
    page,
    size,
    deptId: req.query.deptId || '',
    keyword: String(req.query.keyword || '').trim(),
  });
  res.json({ code: 0, data });
});

/** 复核/改判 */
router.post('/:id', async (req, res, next) => {
  try {
    const { action, score, note } = req.body || {};
    const result = await reviewReport({
      reportId: Number(req.params.id),
      reviewer: req.user,
      action,
      score,
      note,
    });
    if (result.error) return res.status(result.error.status).json({ code: result.error.status, message: result.error.message });

    await audit(
      req,
      'qc.review',
      'qc_report',
      Number(req.params.id),
      `质控复核${action === 'override' ? '改判' : '确认'}：AI ${result.report.score} → 最终 ${result.finalScore}（${result.finalLevel}级）`,
    );
    res.json({ code: 0, data: result, message: action === 'override' ? '已改判并更新病历状态' : '复核通过' });
  } catch (err) {
    next(err);
  }
});

export default router;
