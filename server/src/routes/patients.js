import { Router } from 'express';
import { one, query } from '../db.js';
import { requireAuth, requireRole, audit } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

function calcAge(birthDate) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

/** 患者分页列表 */
router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Number(req.query.size) || 10);
  const keyword = String(req.query.keyword || '').trim();
  const where = [];
  const params = [];
  if (keyword) {
    where.push('(p.name LIKE ? OR p.mrn LIKE ? OR p.phone LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (req.user.role === 'clinician') {
    where.push('EXISTS (SELECT 1 FROM visits v2 WHERE v2.patient_id = p.id AND v2.doctor_id = ?)');
    params.push(req.user.id);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await one(`SELECT COUNT(*) AS total FROM patients p ${whereSql}`, params);
  const rows = await query(
    `SELECT p.*,
            (SELECT COUNT(*) FROM visits v WHERE v.patient_id = p.id) AS visit_count,
            (SELECT MAX(v.visit_time) FROM visits v WHERE v.patient_id = p.id) AS last_visit_at
     FROM patients p ${whereSql}
     ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  res.json({
    code: 0,
    data: { list: rows.map((r) => ({ ...r, age: calcAge(r.birth_date) })), total: totalRow.total, page, size },
  });
});

/** 患者详情（含就诊记录） */
router.get('/:id', async (req, res) => {
  const patient = await one('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!patient) return res.status(404).json({ code: 404, message: '患者不存在' });
  if (req.user.role === 'clinician') {
    const access = await one('SELECT 1 AS ok FROM visits WHERE patient_id = ? AND doctor_id = ? LIMIT 1', [
      req.params.id,
      req.user.id,
    ]);
    if (!access) return res.status(403).json({ code: 403, message: '无权访问该患者' });
  }
  const visits = await query(
    `SELECT v.*, d.name AS dept_name, u.name AS doctor_name
     FROM visits v
     LEFT JOIN departments d ON d.id = v.dept_id
     LEFT JOIN users u ON u.id = v.doctor_id
     WHERE v.patient_id = ? ${req.user.role === 'clinician' ? 'AND v.doctor_id = ?' : ''}
     ORDER BY v.visit_time DESC`,
    req.user.role === 'clinician' ? [req.params.id, req.user.id] : [req.params.id],
  );
  res.json({ code: 0, data: { ...patient, age: calcAge(patient.birth_date), visits } });
});

/** 新建患者（患者主索引通常由登记处/HIS 维护） */
router.post('/', requireRole('admin', 'quality'), async (req, res) => {
  const { mrn, name, gender, birthDate, idCard, phone, bloodType, allergy } = req.body || {};
  if (!mrn || !name) return res.status(400).json({ code: 400, message: '病案号与姓名为必填项' });
  const exists = await one('SELECT id FROM patients WHERE mrn = ?', [mrn]);
  if (exists) return res.status(409).json({ code: 409, message: '病案号已存在' });
  const r = await query(
    `INSERT INTO patients (mrn, name, gender, birth_date, id_card, phone, blood_type, allergy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [mrn, name, gender || '男', birthDate || null, idCard || null, phone || null, bloodType || null, allergy || null],
  );
  await audit(req, 'patient.create', 'patient', r.insertId, `新增患者 ${name}`);
  res.json({ code: 0, data: { id: r.insertId }, message: '患者创建成功' });
});

/** 更新患者 */
router.put('/:id', requireRole('admin', 'quality'), async (req, res) => {
  const { name, gender, birthDate, idCard, phone, bloodType, allergy } = req.body || {};
  const patient = await one('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!patient) return res.status(404).json({ code: 404, message: '患者不存在' });
  await query(
    `UPDATE patients SET name = ?, gender = ?, birth_date = ?, id_card = ?, phone = ?, blood_type = ?, allergy = ?
     WHERE id = ?`,
    [
      name ?? patient.name,
      gender ?? patient.gender,
      birthDate ?? patient.birth_date,
      idCard ?? patient.id_card,
      phone ?? patient.phone,
      bloodType ?? patient.blood_type,
      allergy ?? patient.allergy,
      req.params.id,
    ],
  );
  await audit(req, 'patient.update', 'patient', Number(req.params.id), `更新患者 ${name || patient.name}`);
  res.json({ code: 0, message: '患者信息已更新' });
});

export default router;
