import { Router } from 'express';
import { one, query } from '../db.js';
import { requireAuth, audit } from '../middleware/auth.js';
import { evaluateRecord } from '../qc/service.js';
import { listVersions, compareVersions } from '../qc/versions.js';
import { createBatch, getBatch, BatchError } from '../qc/batch.js';
import { toCsv } from '../qc/csv.js';

const router = Router();
router.use(requireAuth);

const RECORD_FIELDS = [
  'chief_complaint', 'present_illness', 'past_history',
  'physical_exam', 'auxiliary_exam', 'diagnosis', 'treatment',
];

const STATUS_TEXT = {
  draft: '草稿',
  submitted: '已提交',
  qc_passed: '质控通过',
  qc_failed: '质控不通过',
};

/** 临床医师只能访问本人经治病历；质控/管理员不受限 */
function denied(req, res, record) {
  if (req.user.role === 'clinician' && Number(record.doctor_id) !== Number(req.user.id)) {
    res.status(403).json({ code: 403, message: '无权访问该病历' });
    return true;
  }
  return false;
}

/** 列表与导出共用的筛选条件（含临床医师只看本人病历的数据权限） */
function buildFilters(req) {
  const where = [];
  const params = [];
  const { status, deptId, keyword } = req.query;
  if (status) { where.push('mr.status = ?'); params.push(status); }
  if (deptId) { where.push('v.dept_id = ?'); params.push(deptId); }
  if (keyword) {
    where.push('(p.name LIKE ? OR p.mrn LIKE ? OR mr.diagnosis LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (req.user.role === 'clinician') { where.push('mr.doctor_id = ?'); params.push(req.user.id); }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/** 病历列表 */
router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Number(req.query.size) || 10);
  const { whereSql, params } = buildFilters(req);

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
            qc.score AS qc_score, qc.level AS qc_level, qc.score_delta,
            qc.final_score AS qc_final_score, qc.review_status AS qc_review_status,
            qc.reviewer_name AS qc_reviewer,
            (SELECT t.id FROM rectify_tasks t WHERE t.record_id = mr.id AND t.status IN ('open','submitted')
             ORDER BY t.id DESC LIMIT 1) AS open_task_id,
            (SELECT t.due_at FROM rectify_tasks t WHERE t.record_id = mr.id AND t.status IN ('open','submitted')
             ORDER BY t.id DESC LIMIT 1) AS task_due_at
     FROM medical_records mr
     JOIN patients p ON p.id = mr.patient_id
     JOIN visits v ON v.id = mr.visit_id
     LEFT JOIN departments d ON d.id = v.dept_id
     LEFT JOIN users u ON u.id = mr.doctor_id
     LEFT JOIN (
       SELECT q.* FROM qc_reports q
       JOIN (SELECT record_id, MAX(id) AS id FROM qc_reports GROUP BY record_id) m ON m.id = q.id
     ) qc ON qc.record_id = mr.id
     ${whereSql}
     ORDER BY mr.id DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  res.json({ code: 0, data: { list: rows, total: totalRow.total, page, size } });
});

/**
 * 导出病历清单 CSV（Excel 可直接打开）
 * 注意：必须定义在 /:id 之前，否则 "export.csv" 会被当成 id。
 */
router.get('/export.csv', async (req, res) => {
  const { whereSql, params } = buildFilters(req);
  const rows = await query(
    `SELECT p.name AS patient_name, p.mrn, p.gender, d.name AS dept_name, u.name AS doctor_name,
            mr.diagnosis, mr.status, mr.created_at, mr.updated_at,
            qc.score AS qc_score, qc.level AS qc_level, qc.created_at AS qc_at,
            qc.final_score AS qc_final_score, qc.review_status, qc.reviewer_name
     FROM medical_records mr
     JOIN patients p ON p.id = mr.patient_id
     JOIN visits v ON v.id = mr.visit_id
     LEFT JOIN departments d ON d.id = v.dept_id
     LEFT JOIN users u ON u.id = mr.doctor_id
     LEFT JOIN (
       SELECT q.* FROM qc_reports q
       JOIN (SELECT record_id, MAX(id) AS id FROM qc_reports GROUP BY record_id) m ON m.id = q.id
     ) qc ON qc.record_id = mr.id
     ${whereSql}
     ORDER BY mr.id DESC LIMIT 5000`,
    params,
  );

  const reviewText = { pending: '待复核', confirmed: '已确认', overridden: '已改判' };
  const csv = toCsv(
    ['患者姓名', '病案号', '性别', '科室', '经治医师', '诊断', '状态', 'AI 质控分', '最终分', '等级', '复核状态', '复核人', '最近质控时间', '更新时间'],
    rows.map((r) => [
      r.patient_name,
      r.mrn,
      r.gender,
      r.dept_name,
      r.doctor_name,
      r.diagnosis,
      STATUS_TEXT[r.status] || r.status,
      r.qc_score ?? '',
      r.qc_final_score ?? '',
      r.qc_level ?? '',
      reviewText[r.review_status] || r.review_status || '',
      r.reviewer_name ?? '',
      r.qc_at ?? '',
      r.updated_at,
    ]),
  );

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="medai-records-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`智医质控-病历清单-${stamp}.csv`)}`,
  );
  res.send(csv);
});

/* ---------------- 批量质控 ---------------- */

/** 创建批量质控任务（异步执行，前端轮询进度） */
router.post('/batch-qc', async (req, res, next) => {
  try {
    const result = await createBatch({ user: req.user, recordIds: req.body?.recordIds });
    await audit(req, 'record.batch_qc', 'qc_batch', result.batchId, `批量质控 ${result.total} 份病历`);
    res.json({
      code: 0,
      data: result,
      message: result.skipped.length
        ? `已提交 ${result.total} 份，${result.skipped.length} 份已在队列中跳过`
        : `已提交 ${result.total} 份病历质控`,
    });
  } catch (err) {
    if (err instanceof BatchError) return res.status(err.status).json({ code: err.status, message: err.message });
    next(err);
  }
});

/** 批量任务进度 + 明细 */
router.get('/batch-qc/:id', async (req, res, next) => {
  try {
    const data = await getBatch(Number(req.params.id), req.user);
    res.json({ code: 0, data });
  } catch (err) {
    if (err instanceof BatchError) return res.status(err.status).json({ code: err.status, message: err.message });
    next(err);
  }
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
  if (denied(req, res, record)) return;
  const latestQC = await one(
    'SELECT * FROM qc_reports WHERE record_id = ? ORDER BY id DESC LIMIT 1',
    [req.params.id],
  );
  const versionCount = await one(
    'SELECT COUNT(*) AS c FROM record_versions WHERE record_id = ?',
    [req.params.id],
  );
  const openTask = await one(
    `SELECT id, status, due_at, created_at FROM rectify_tasks
     WHERE record_id = ? AND status IN ('open','submitted') ORDER BY id DESC LIMIT 1`,
    [req.params.id],
  );
  res.json({ code: 0, data: { ...record, latestQC, versionCount: versionCount.c, openTask } });
});

/** 新建病历 */
router.post('/', async (req, res) => {
  const { visitId } = req.body || {};
  if (!visitId) return res.status(400).json({ code: 400, message: '请先选择就诊记录' });
  const visit = await one('SELECT * FROM visits WHERE id = ?', [visitId]);
  if (!visit) return res.status(404).json({ code: 404, message: '就诊记录不存在' });
  if (req.user.role === 'clinician' && Number(visit.doctor_id) !== Number(req.user.id)) {
    return res.status(403).json({ code: 403, message: '只能为自己经治的就诊创建病历' });
  }

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
  if (denied(req, res, record)) return;
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

/** 运行 AI 质控（规则引擎 / 大模型，规则配置实时生效） */
router.post('/:id/qc', async (req, res, next) => {
  try {
    const record = await one('SELECT * FROM medical_records WHERE id = ?', [req.params.id]);
    if (!record) return res.status(404).json({ code: 404, message: '病历不存在' });
    if (denied(req, res, record)) return;

    const result = await evaluateRecord(record);
    const deltaText = result.scoreDelta === null ? '' : `，较上次 ${result.scoreDelta >= 0 ? '+' : ''}${result.scoreDelta} 分`;
    await audit(req, 'record.qc', 'record', record.id, `AI 质控得分 ${result.score}（${result.level}级）${deltaText}`);

    res.json({ code: 0, data: result });
  } catch (err) {
    next(err);
  }
});

/** 质控历史（含整改分差） */
router.get('/:id/qc-history', async (req, res) => {
  const record = await one('SELECT id, doctor_id FROM medical_records WHERE id = ?', [req.params.id]);
  if (!record) return res.status(404).json({ code: 404, message: '病历不存在' });
  if (denied(req, res, record)) return;
  const rows = await query(
    `SELECT id, score, level, risk, model, duration_ms, prev_score, score_delta, record_version,
            review_status, reviewer_name, reviewed_at, final_score, review_note, created_at
     FROM qc_reports WHERE record_id = ? ORDER BY id DESC`,
    [req.params.id],
  );
  res.json({ code: 0, data: rows });
});

/** 质控版本列表 */
router.get('/:id/versions', async (req, res) => {
  const record = await one('SELECT id, doctor_id FROM medical_records WHERE id = ?', [req.params.id]);
  if (!record) return res.status(404).json({ code: 404, message: '病历不存在' });
  if (denied(req, res, record)) return;
  const rows = await listVersions(Number(req.params.id), 20);
  res.json({ code: 0, data: rows });
});

/** 版本对比：默认最近两次，支持 ?from=1&to=2 */
router.get('/:id/versions/compare', async (req, res) => {
  const record = await one('SELECT id, doctor_id FROM medical_records WHERE id = ?', [req.params.id]);
  if (!record) return res.status(404).json({ code: 404, message: '病历不存在' });
  if (denied(req, res, record)) return;
  const from = Number(req.query.from) || null;
  const to = Number(req.query.to) || null;
  const data = await compareVersions(Number(req.params.id), from, to);
  res.json({ code: 0, data });
});

export default router;
