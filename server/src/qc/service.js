/**
 * 一次完整质控的服务层：调用 AI/规则引擎 → 落库报告 → 更新病历状态 → 生成版本快照。
 * 单条质控与批量质控共用这一条路径，避免两套逻辑算出两种结果。
 */
import { one, query } from '../db.js';
import { runQC } from '../ai/index.js';
import { getRules } from './rules.js';
import { createVersion } from './versions.js';
import { syncRectifyTask } from './tasks.js';

/**
 * @param {object} record medical_records 行
 * @returns 质控结果 + reportId + prevScore/scoreDelta + status + version + task
 */
export async function evaluateRecord(record) {
  const rules = await getRules();
  const report = await runQC(record, { rules });

  const previous = await one(
    'SELECT COALESCE(final_score, score) AS score FROM qc_reports WHERE record_id = ? ORDER BY id DESC LIMIT 1',
    [record.id],
  );
  const prevScore = previous ? Number(previous.score) : null;
  const scoreDelta =
    prevScore === null ? null : Math.round((Number(report.score) - prevScore) * 10) / 10;

  const inserted = await query(
    `INSERT INTO qc_reports
     (record_id, score, level, dim_completeness, dim_accuracy, dim_logic, dim_terminology,
      risk, issues, suggestions, summary, model, duration_ms, prev_score, score_delta, record_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      prevScore,
      scoreDelta,
      null,
    ],
  );

  const version = await createVersion(record, report, inserted.insertId);
  if (version?.version) {
    await query('UPDATE qc_reports SET record_version = ? WHERE id = ?', [version.version, inserted.insertId]);
  }

  const nextStatus = Number(report.score) >= 80 ? 'qc_passed' : 'qc_failed';
  await query('UPDATE medical_records SET status = ? WHERE id = ?', [nextStatus, record.id]);
  const task = await syncRectifyTask(record, { reportId: inserted.insertId, score: Number(report.score) });

  return {
    reportId: inserted.insertId,
    recordId: record.id,
    ...report,
    prevScore,
    scoreDelta,
    status: nextStatus,
    version: version?.version ?? null,
    review_status: 'pending',
    final_score: null,
    task,
  };
}
