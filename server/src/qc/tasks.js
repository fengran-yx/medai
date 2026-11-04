/**
 * 整改任务：AI 质控不通过时自动建单，复评通过或人工复核通过时自动关闭。
 * 医院场景里任务必须有承办人、科室和截止时间，否则“整改”只是报告上的一句话。
 */
import { one, query } from '../db.js';

export function levelOf(score) {
  const n = Number(score);
  return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 60 ? 'C' : 'D';
}

function dueDays() {
  const n = Number(process.env.RECTIFY_DUE_DAYS || 3);
  return Number.isFinite(n) && n > 0 ? Math.min(30, Math.floor(n)) : 3;
}

/**
 * 按最终/暂定得分同步整改任务。
 * - <80：没有 open/submitted 任务则建单，已有则更新关联报告；
 * - ≥80：关闭所有 open/submitted 任务，标记 passed。
 */
export async function syncRectifyTask(record, { reportId = null, score = 0 } = {}) {
  if (!record?.id) return null;
  const failed = Number(score) < 80;

  if (!failed) {
    const closed = await query(
      `UPDATE rectify_tasks SET status = 'passed', report_id = COALESCE(?, report_id), closed_at = NOW()
       WHERE record_id = ? AND status IN ('open','submitted')`,
      [reportId, record.id],
    );
    return { action: closed.affectedRows ? 'closed' : 'none' };
  }

  const existing = await one(
    `SELECT id FROM rectify_tasks
     WHERE record_id = ? AND status IN ('open','submitted')
     ORDER BY id DESC LIMIT 1`,
    [record.id],
  );
  if (existing) {
    await query('UPDATE rectify_tasks SET report_id = ?, updated_at = NOW() WHERE id = ?', [reportId, existing.id]);
    return { action: 'updated', taskId: existing.id };
  }

  const visit = await one('SELECT dept_id FROM visits WHERE id = ?', [record.visit_id]);
  const created = await query(
    `INSERT INTO rectify_tasks (record_id, report_id, doctor_id, dept_id, status, due_at)
     VALUES (?, ?, ?, ?, 'open', DATE_ADD(NOW(), INTERVAL ${dueDays()} DAY))`,
    [record.id, reportId, record.doctor_id ?? null, visit?.dept_id ?? null],
  );
  return { action: 'created', taskId: created.insertId };
}

/** 待复核队列：只取每份病历最新一次报告 */
export async function listPendingReviews({ page = 1, size = 20, deptId = '', keyword = '' } = {}) {
  const where = ["q.review_status = 'pending'"];
  const params = [];
  if (deptId) { where.push('v.dept_id = ?'); params.push(deptId); }
  if (keyword) {
    where.push('(p.name LIKE ? OR p.mrn LIKE ? OR mr.diagnosis LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const totalRow = await one(
    `SELECT COUNT(*) AS total
     FROM qc_reports q
     JOIN (SELECT record_id, MAX(id) AS id FROM qc_reports GROUP BY record_id) latest ON latest.id = q.id
     JOIN medical_records mr ON mr.id = q.record_id
     JOIN patients p ON p.id = mr.patient_id
     JOIN visits v ON v.id = mr.visit_id
     ${whereSql}`,
    params,
  );
  const rows = await query(
    `SELECT q.id, q.record_id, q.score, q.level, q.risk, q.issues, q.model, q.created_at, q.review_status,
            mr.status AS record_status, p.name AS patient_name, p.mrn,
            d.name AS dept_name, u.name AS doctor_name
     FROM qc_reports q
     JOIN (SELECT record_id, MAX(id) AS id FROM qc_reports GROUP BY record_id) latest ON latest.id = q.id
     JOIN medical_records mr ON mr.id = q.record_id
     JOIN patients p ON p.id = mr.patient_id
     JOIN visits v ON v.id = mr.visit_id
     LEFT JOIN departments d ON d.id = v.dept_id
     LEFT JOIN users u ON u.id = mr.doctor_id
     ${whereSql}
     ORDER BY q.score ASC, q.id DESC
     LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  const list = rows.map((r) => {
    let issues = [];
    try { issues = typeof r.issues === 'string' ? JSON.parse(r.issues) : r.issues || []; } catch { issues = []; }
    return { ...r, issueCount: issues.length };
  });
  return { list, total: totalRow.total, page, size };
}

/** 整改任务列表（含逾期计算） */
export async function listTasks({ user, page = 1, size = 20, status = '', deptId = '', keyword = '' } = {}) {
  const where = [];
  const params = [];
  if (status === 'overdue') {
    where.push("t.status IN ('open','submitted') AND t.due_at < NOW()");
  } else if (status) {
    where.push('t.status = ?');
    params.push(status);
  }
  if (deptId) { where.push('v.dept_id = ?'); params.push(deptId); }
  if (keyword) {
    where.push('(p.name LIKE ? OR p.mrn LIKE ? OR mr.diagnosis LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (user?.role === 'clinician') { where.push('t.doctor_id = ?'); params.push(user.id); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const base = `FROM rectify_tasks t
    JOIN medical_records mr ON mr.id = t.record_id
    JOIN patients p ON p.id = mr.patient_id
    JOIN visits v ON v.id = mr.visit_id
    LEFT JOIN departments d ON d.id = v.dept_id
    LEFT JOIN users u ON u.id = t.doctor_id`;

  const totalRow = await one(`SELECT COUNT(*) AS total ${base} ${whereSql}`, params);
  const summaryWhere = user?.role === 'clinician' ? 'WHERE t.doctor_id = ?' : '';
  const summaryParams = user?.role === 'clinician' ? [user.id] : [];
  const summaryRow = await one(
    `SELECT
       SUM(t.status IN ('open','submitted')) AS pending,
       SUM(t.status IN ('open','submitted') AND t.due_at < NOW()) AS overdue,
       SUM(t.status = 'passed') AS passed
     FROM rectify_tasks t ${summaryWhere}`,
    summaryParams,
  );

  const rows = await query(
    `SELECT t.id, t.record_id, t.report_id, t.status, t.due_at, t.note, t.created_at, t.closed_at,
            p.name AS patient_name, p.mrn, mr.diagnosis, mr.status AS record_status,
            d.name AS dept_name, u.name AS doctor_name,
            CASE WHEN t.status IN ('open','submitted') AND t.due_at < NOW() THEN 1 ELSE 0 END AS overdue
     ${base} ${whereSql}
     ORDER BY overdue DESC, t.due_at ASC, t.id DESC
     LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  return {
    list: rows,
    total: totalRow.total,
    page,
    size,
    summary: {
      pending: Number(summaryRow.pending || 0),
      overdue: Number(summaryRow.overdue || 0),
      passed: Number(summaryRow.passed || 0),
    },
  };
}

/** 临床医师提交整改（质控科可代提交） */
export async function submitTask({ taskId, user, note = '' }) {
  const task = await one('SELECT * FROM rectify_tasks WHERE id = ?', [taskId]);
  if (!task) return { error: { status: 404, message: '整改任务不存在' } };
  if (!['open', 'submitted'].includes(task.status)) {
    return { error: { status: 409, message: '该任务已通过或已关闭，不能重复提交' } };
  }
  if (user?.role === 'clinician' && Number(task.doctor_id) !== Number(user.id)) {
    return { error: { status: 403, message: '只能提交本人的整改任务' } };
  }
  const text = note ? String(note).slice(0, 500) : task.note;
  await query(
    `UPDATE rectify_tasks SET status = 'submitted', note = ?, updated_at = NOW() WHERE id = ?`,
    [text, taskId],
  );
  return { task: { ...task, status: 'submitted', note: text } };
}

/** 人工关闭任务（质控科确认整改完成/免整改） */
export async function closeTask({ taskId, user, note = '' }) {
  const task = await one('SELECT * FROM rectify_tasks WHERE id = ?', [taskId]);
  if (!task) return { error: { status: 404, message: '整改任务不存在' } };
  if (user?.role === 'clinician') return { error: { status: 403, message: '临床医师不能关闭整改任务' } };
  await query(
    `UPDATE rectify_tasks SET status = 'closed', note = ?, closed_at = NOW() WHERE id = ?`,
    [note ? String(note).slice(0, 500) : task.note, taskId],
  );
  return { task: { ...task, status: 'closed', note: note || task.note } };
}
