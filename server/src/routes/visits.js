import { Router } from 'express';
import { one, query } from '../db.js';
import { requireAuth, requireRole, audit } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/** 就诊列表 */
router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Number(req.query.size) || 10);
  const { patientId, deptId, keyword } = req.query;
  const where = [];
  const params = [];
  if (patientId) { where.push('v.patient_id = ?'); params.push(patientId); }
  if (deptId) { where.push('v.dept_id = ?'); params.push(deptId); }
  if (keyword) {
    where.push('(v.visit_no LIKE ? OR p.name LIKE ? OR v.diagnosis LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (req.user.role === 'clinician') { where.push('v.doctor_id = ?'); params.push(req.user.id); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await one(
    `SELECT COUNT(*) AS total FROM visits v JOIN patients p ON p.id = v.patient_id ${whereSql}`,
    params,
  );
  const rows = await query(
    `SELECT v.*, p.name AS patient_name, p.gender, p.birth_date, p.mrn,
            d.name AS dept_name, u.name AS doctor_name,
            (SELECT id FROM medical_records mr WHERE mr.visit_id = v.id ORDER BY mr.id DESC LIMIT 1) AS record_id
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     LEFT JOIN departments d ON d.id = v.dept_id
     LEFT JOIN users u ON u.id = v.doctor_id
     ${whereSql}
     ORDER BY v.visit_time DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  res.json({ code: 0, data: { list: rows, total: totalRow.total, page, size } });
});

/** 就诊详情（含患者、科室、经治医师） */
router.get('/:id', async (req, res) => {
  const visit = await one(
    `SELECT v.*, p.name AS patient_name, p.gender, p.birth_date, p.mrn, p.allergy,
            d.name AS dept_name, u.name AS doctor_name,
            (SELECT id FROM medical_records mr WHERE mr.visit_id = v.id ORDER BY mr.id DESC LIMIT 1) AS record_id
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     LEFT JOIN departments d ON d.id = v.dept_id
     LEFT JOIN users u ON u.id = v.doctor_id
     WHERE v.id = ?`,
    [req.params.id],
  );
  if (!visit) return res.status(404).json({ code: 404, message: '就诊记录不存在' });
  if (req.user.role === 'clinician' && Number(visit.doctor_id) !== Number(req.user.id)) {
    return res.status(403).json({ code: 403, message: '无权访问该就诊记录' });
  }
  res.json({ code: 0, data: visit });
});

/** 新建就诊（挂号/登记处创建，临床医师不可直接建就诊） */
router.post('/', requireRole('admin', 'quality'), async (req, res) => {
  const { patientId, deptId, visitType, chiefComplaint, diagnosis } = req.body || {};
  if (!patientId || !deptId) return res.status(400).json({ code: 400, message: '患者与科室为必填项' });
  const patient = await one('SELECT id FROM patients WHERE id = ?', [patientId]);
  if (!patient) return res.status(404).json({ code: 404, message: '患者不存在' });
  const visitNo = `V${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 90 + 10)}`;
  const r = await query(
    `INSERT INTO visits (visit_no, patient_id, dept_id, doctor_id, visit_type, chief_complaint, diagnosis)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [visitNo, patientId, deptId, req.user.id, visitType || 'outpatient', chiefComplaint || null, diagnosis || null],
  );
  await audit(req, 'visit.create', 'visit', r.insertId, `新建就诊 ${visitNo}`);
  res.json({ code: 0, data: { id: r.insertId, visitNo }, message: '就诊记录已创建' });
});

/** 科室字典 */
export const deptRouter = Router();
deptRouter.use(requireAuth);
deptRouter.get('/', async (_req, res) => {
  const rows = await query('SELECT * FROM departments ORDER BY id');
  res.json({ code: 0, data: rows });
});

export default router;
