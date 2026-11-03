import { Router } from 'express';
import { one, query } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/** 顶部概览卡片 */
router.get('/overview', async (_req, res) => {
  const [patientCnt, recordToday, qcAgg, pending, chatCnt] = await Promise.all([
    one('SELECT COUNT(*) AS c FROM patients'),
    one('SELECT COUNT(*) AS c FROM medical_records WHERE DATE(created_at) = CURDATE()'),
    one('SELECT ROUND(AVG(score),1) AS avg_score, COUNT(*) AS c FROM qc_reports WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'),
    one("SELECT COUNT(*) AS c FROM medical_records WHERE status IN ('submitted','qc_failed')"),
    one('SELECT COUNT(*) AS c FROM diagnosis_sessions WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'),
  ]);
  const passRate = await one(
    `SELECT ROUND(SUM(score >= 80) / COUNT(*) * 100, 1) AS rate FROM qc_reports
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
  );
  res.json({
    code: 0,
    data: {
      patientCount: patientCnt.c,
      recordToday: recordToday.c,
      avgScore: qcAgg.avg_score ?? 0,
      qcCount: qcAgg.c,
      passRate: passRate.rate ?? 0,
      pendingCount: pending.c,
      aiDiagnosisCount: chatCnt.c,
    },
  });
});

/** 近 N 天趋势 */
router.get('/trends', async (req, res) => {
  const days = Math.min(30, Math.max(3, Number(req.query.days) || 7));
  const rows = await query(
    `SELECT DATE_FORMAT(d.day, '%m-%d') AS date,
            (SELECT COUNT(*) FROM medical_records r WHERE DATE(r.created_at) = d.day) AS records,
            (SELECT ROUND(AVG(q.score),1) FROM qc_reports q WHERE DATE(q.created_at) = d.day) AS avgScore,
            (SELECT COUNT(*) FROM diagnosis_sessions s WHERE DATE(s.created_at) = d.day) AS aiCalls
     FROM (SELECT DATE_SUB(CURDATE(), INTERVAL seq DAY) AS day
           FROM (SELECT 0 AS seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
                 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
                 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
                 UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
                 UNION SELECT 20 UNION SELECT 21 UNION SELECT 22 UNION SELECT 23 UNION SELECT 24
                 UNION SELECT 25 UNION SELECT 26 UNION SELECT 27 UNION SELECT 28 UNION SELECT 29) t
           WHERE seq < ?) d
     ORDER BY d.day`,
    [days],
  );
  res.json({ code: 0, data: rows });
});

/** 科室分布 */
router.get('/dept-distribution', async (_req, res) => {
  const rows = await query(
    `SELECT d.name AS name, COUNT(r.id) AS value, ROUND(AVG(q.score),1) AS avgScore
     FROM departments d
     LEFT JOIN visits v ON v.dept_id = d.id
     LEFT JOIN medical_records r ON r.visit_id = v.id
     LEFT JOIN qc_reports q ON q.record_id = r.id
     WHERE d.dept_type = 'clinical'
     GROUP BY d.id, d.name
     HAVING value > 0
     ORDER BY value DESC`,
  );
  res.json({ code: 0, data: rows });
});

/** 问题类型分布（从最近 200 份质控报告解析） */
router.get('/issue-categories', async (_req, res) => {
  const rows = await query(
    'SELECT issues FROM qc_reports ORDER BY id DESC LIMIT 200',
  );
  const counter = new Map();
  for (const row of rows) {
    let issues = [];
    try { issues = typeof row.issues === 'string' ? JSON.parse(row.issues) : row.issues || []; } catch { issues = []; }
    for (const it of issues) {
      const key = it.rule || it.ruleCode || '其他问题';
      counter.set(key, (counter.get(key) || 0) + 1);
    }
  }
  const list = [...counter.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  res.json({ code: 0, data: list });
});

/** 最近质控动态 */
router.get('/recent-qc', async (_req, res) => {
  const rows = await query(
    `SELECT q.id, q.score, q.level, q.created_at, mr.id AS record_id,
            p.name AS patient_name, u.name AS doctor_name, d.name AS dept_name
     FROM qc_reports q
     JOIN medical_records mr ON mr.id = q.record_id
     JOIN patients p ON p.id = mr.patient_id
     LEFT JOIN users u ON u.id = mr.doctor_id
     LEFT JOIN visits v ON v.id = mr.visit_id
     LEFT JOIN departments d ON d.id = v.dept_id
     ORDER BY q.id DESC LIMIT 8`,
  );
  res.json({ code: 0, data: rows });
});

export default router;
