import { Router } from 'express';
import { one, query } from '../db.js';
import { requireAuth, audit } from '../middleware/auth.js';
import { runQC } from '../ai/index.js';

const router = Router();
router.use(requireAuth);

const RECORD_FIELDS = [
  'chief_complaint', 'present_illness', 'past_history',
  'physical_exam', 'auxiliary_exam', 'diagnosis', 'treatment',
];

/** 病历列表 */
router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Number(req.query.size) || 10);
  const { status, deptId, keyword } = req.query;
  const where = [];
  const params = [];
  if (status) { where.push('mr.status = ?'); params.push(status); }
  if (deptId) { where.push('v.dept_id = ?'); params.push(deptId); }
  if (keyword) {
    where.push('(p.name LIKE ? OR p.mrn LIKE ? OR mr.diagnosis LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (req.user.role === 'clinician') { where.push('mr.doctor_id = ?'); params.push(req.user.id); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await one(
    `SELECT COUNT(*) AS total FROM medical_records mr
     JOIN patients p ON p.id = mr.patient_id
     JOIN visits v ON v.id = mr.visit_id ${whereSql}`,
    params,
  );
  const rows = await query(
    `SELECT mr.id, mr.visit_id, mr.patient_id, mr.status, mr.diagnosis, mr.created_at, mr.updated_at,
            p.name AS patient_name, p.gender, p.mrn,
            d.name AS dept_name, u.name AS doctor_name,
            (SELECT q.score FROM qc_reports q WHERE q.record_id = mr.id ORDER BY q.id DESC LIMIT 1) AS qc_score,
            (SELECT q.level FROM qc_reports q WHERE q.record_id = mr.id ORDER BY q.id DESC LIMIT 1) AS qc_level
     FROM medical_records mr
     JOIN patients p ON p.id = mr.patient_id
     JOIN visits v ON v.id = mr.visit_id
     LEFT JOIN departments d ON d.id = v.dept_id
     LEFT JOIN users u ON u.id = mr.doctor_id
     ${whereSql}
     ORDER BY mr.id DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  res.json({ code: 0, data: { list: rows, total: totalRow.total, page, size } });
});

/** 病历详情 + 最近一次质控 */
router.get('/:id', async (req, res) => {
  const record = await one(
    `SELECT mr.*, p.name AS patient_name, p.gender, p.birth_date, p.mrn, p.allergy,
            v.visit_no, v.visit_type, v.chief_complaint AS visit_chief_complaint, v.visit_time,
            d.name AS dept_name, u.name AS doctor_name
     FROM medical_records mr
     JOIN patients p ON p.id = mr.patient_id
     JOIN visits v ON v.id = mr.visit_id
     LEFT JOIN departments d ON d.id = v.dept_id
     LEFT JOIN users u ON u.id = mr.doctor_id
     WHERE mr.id = ?`,
    [req.params.id],
  );
  if (!record) return res.status(404).json({ code: 404, message: '病历不存在' });
  const latestQC = await one(
    'SELECT * FROM qc_reports WHERE record_id = ? ORDER BY id DESC LIMIT 1',
    [req.params.id],
  );
  res.json({ code: 0, data: { ...record, latestQC } });
});

/** 新建病历 */
router.post('/', async (req, res) => {
  const { visitId } = req.body || {};
  if (!visitId) return res.status(400).json({ code: 400, message: '请先选择就诊记录' });
  const visit = await one('SELECT * FROM visits WHERE id = ?', [visitId]);
  if (!visit) return res.status(404).json({ code: 404, message: '就诊记录不存在' });

  const values = RECORD_FIELDS.map((f) => req.body[f] ?? null);
  const r = await query(
    `INSERT INTO medical_records
     (visit_id, patient_id, doctor_id, chief_complaint, present_illness, past_history,
      physical_exam, auxiliary_exam, diagnosis, treatment, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    [visitId, visit.patient_id, req.user.id, ...values],
  );
  await audit(req, 'record.create', 'record', r.insertId, `新建病历（就诊 ${visit.visit_no}）`);
  res.json({ code: 0, data: { id: r.insertId }, message: '病历已创建' });
});

/** 更新病历 */
router.put('/:id', async (req, res) => {
  const record = await one('SELECT * FROM medical_records WHERE id = ?', [req.params.id]);
  if (!record) return res.status(404).json({ code: 404, message: '病历不存在' });
  const values = RECORD_FIELDS.map((f) => (req.body[f] !== undefined ? req.body[f] : record[f]));
  const status = req.body.status || record.status;
  await query(
    `UPDATE medical_records SET chief_complaint = ?, present_illness = ?, past_history = ?,
       physical_exam = ?, auxiliary_exam = ?, diagnosis = ?, treatment = ?, status = ?,
       submitted_at = CASE WHEN ? = 'submitted' AND submitted_at IS NULL THEN NOW() ELSE submitted_at END
     WHERE id = ?`,
    [...values, status, status, req.params.id],
  );
  await audit(req, 'record.update', 'record', Number(req.params.id), '更新病历内容');
  res.json({ code: 0, message: '病历已保存' });
});

/** 运行 AI 质控 */
router.post('/:id/qc', async (req, res) => {
  const record = await one('SELECT * FROM medical_records WHERE id = ?', [req.params.id]);
  if (!record) return res.status(404).json({ code: 404, message: '病历不存在' });

  const report = await runQC(record);
  const r = await query(
    `INSERT INTO qc_reports
     (record_id, score, level, dim_completeness, dim_accuracy, dim_logic, dim_terminology,
      risk, issues, suggestions, summary, model, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      report.score,
      report.level,
      report.dimensions.completeness,
      report.dimensions.accuracy,
      report.dimensions.logic,
      report.dimensions.terminology,
      report.risk,
      JSON.stringify(report.issues),
      JSON.stringify(report.suggestions),
      report.summary,
      report.model,
      report.durationMs,
    ],
  );
  const nextStatus = report.score >= 80 ? 'qc_passed' : 'qc_failed';
  await query('UPDATE medical_records SET status = ? WHERE id = ?', [nextStatus, record.id]);
  await audit(req, 'record.qc', 'record', record.id, `AI 质控得分 ${report.score}（${report.level}级）`);

  res.json({
    code: 0,
    data: {
      reportId: r.insertId,
      recordId: record.id,
      ...report,
      status: nextStatus,
    },
  });
});

/** 质控历史 */
router.get('/:id/qc-history', async (req, res) => {
  const rows = await query(
    'SELECT id, score, level, risk, model, duration_ms, created_at FROM qc_reports WHERE record_id = ? ORDER BY id DESC',
    [req.params.id],
  );
  res.json({ code: 0, data: rows });
});

export default router;
