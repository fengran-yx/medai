/**
 * 质控人工复核/终审。
 *
 * AI 结果只作为「初筛」；医院必须由质控医师确认或改判后，
 * 才能形成最终分并驱动整改任务/通过状态。
 */
import { one, query } from '../db.js';
import { syncRectifyTask, levelOf } from './tasks.js';

const ACTIONS = new Set(['confirm', 'override']);

/**
 * @param {{reportId:number, reviewer:{id:number,name:string}, action:'confirm'|'override', score?:number, note?:string}} input
 */
export async function reviewReport({ reportId, reviewer, action, score, note }) {
  if (!ACTIONS.has(action)) return { error: { status: 400, message: '复核动作只能是 confirm 或 override' } };

  const report = await one('SELECT * FROM qc_reports WHERE id = ?', [reportId]);
  if (!report) return { error: { status: 404, message: '质控报告不存在' } };
  const latest = await one(
    'SELECT id FROM qc_reports WHERE record_id = ? ORDER BY id DESC LIMIT 1',
    [report.record_id],
  );
  if (latest && Number(latest.id) !== Number(reportId)) {
    return { error: { status: 409, message: '只能复核该病历最新一次质控报告' } };
  }
  const record = await one('SELECT * FROM medical_records WHERE id = ?', [report.record_id]);
  if (!record) return { error: { status: 404, message: '病历不存在' } };

  let finalScore;
  if (action === 'override') {
    finalScore = Number(score);
    if (!Number.isFinite(finalScore) || finalScore < 0 || finalScore > 100) {
      return { error: { status: 400, message: '改判分数必须在 0-100 之间' } };
    }
    finalScore = Math.round(finalScore * 10) / 10;
  } else {
    finalScore = Number(report.score);
  }

  const reviewStatus = action === 'override' ? 'overridden' : 'confirmed';
  await query(
    `UPDATE qc_reports
     SET review_status = ?, reviewer_id = ?, reviewer_name = ?, reviewed_at = NOW(),
         final_score = ?, review_note = ?
     WHERE id = ?`,
    [
      reviewStatus,
      reviewer?.id ?? null,
      reviewer?.name ?? null,
      finalScore,
      note ? String(note).slice(0, 500) : null,
      reportId,
    ],
  );

  const nextStatus = finalScore >= 80 ? 'qc_passed' : 'qc_failed';
  await query('UPDATE medical_records SET status = ? WHERE id = ?', [nextStatus, record.id]);
  const task = await syncRectifyTask(record, { reportId, score: finalScore });

  return {
    report: {
      ...report,
      review_status: reviewStatus,
      reviewer_id: reviewer?.id ?? null,
      reviewer_name: reviewer?.name ?? null,
      final_score: finalScore,
      review_note: note || null,
      level: levelOf(finalScore),
    },
    finalScore,
    finalLevel: levelOf(finalScore),
    recordStatus: nextStatus,
    task,
  };
}
