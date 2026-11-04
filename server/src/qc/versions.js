/**
 * 病历质控版本快照与整改对比。
 *
 * 每次运行质控都会把「本次被质控的病历内容 + 分数」留档；
 * 医生按建议修改后再次质控，就能精确对比两次之间的字段变化与分数提升，
 * 形成「质控 → 整改 → 复评」的闭环证据链。
 */
import { one, query } from '../db.js';

export const SNAPSHOT_FIELDS = [
  { key: 'chief_complaint', label: '主诉' },
  { key: 'present_illness', label: '现病史' },
  { key: 'past_history', label: '既往史' },
  { key: 'physical_exam', label: '体格检查' },
  { key: 'auxiliary_exam', label: '辅助检查' },
  { key: 'diagnosis', label: '诊断' },
  { key: 'treatment', label: '处理意见' },
];

export function snapshotOf(record) {
  return Object.fromEntries(SNAPSHOT_FIELDS.map((f) => [f.key, String(record?.[f.key] ?? '')]));
}

function parseJSON(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** 写入一条版本记录，返回 { id, version } */
export async function createVersion(record, report, reportId) {
  const snapshot = JSON.stringify(snapshotOf(record));
  const dimensions = JSON.stringify(report.dimensions || {});

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const row = await one(
      'SELECT COALESCE(MAX(version), 0) + 1 AS nextVersion FROM record_versions WHERE record_id = ?',
      [record.id],
    );
    const version = Number(row?.nextVersion || 1);
    try {
      const r = await query(
        `INSERT INTO record_versions
         (record_id, version, snapshot, dimensions, score, level, report_id, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'qc')`,
        [record.id, version, snapshot, dimensions, report.score, report.level, reportId ?? null],
      );
      return { id: r.insertId, version };
    } catch (err) {
      // 并发质控同一份病历时唯一键冲突，重取版本号再试一次
      if (err.code !== 'ER_DUP_ENTRY' || attempt === 1) throw err;
    }
  }
  return { id: null, version: null };
}

/** 版本列表（不含快照正文，列表页够用） */
export async function listVersions(recordId, limit = 20) {
  const rows = await query(
    `SELECT id, record_id, version, score, level, report_id, source, created_at
     FROM record_versions WHERE record_id = ? ORDER BY version DESC LIMIT ?`,
    [recordId, limit],
  );
  return rows;
}

/** 字段级 diff：before/after + 是否变化 */
export function diffSnapshots(before, after) {
  return SNAPSHOT_FIELDS.map((f) => {
    const b = String(before?.[f.key] ?? '');
    const a = String(after?.[f.key] ?? '');
    return { field: f.key, label: f.label, before: b, after: a, changed: b !== a };
  });
}

/**
 * 对比两个版本；不传 from/to 时默认对比最近两次。
 * @returns {Promise<null | {from, to, changes, changedFields, scoreDelta}>}
 */
export async function compareVersions(recordId, fromVersion, toVersion) {
  let [to, from] = await query(
    'SELECT * FROM record_versions WHERE record_id = ? ORDER BY version DESC LIMIT 2',
    [recordId],
  );
  if (fromVersion && toVersion) {
    const rows = await query(
      'SELECT * FROM record_versions WHERE record_id = ? AND version IN (?, ?)',
      [recordId, Number(fromVersion), Number(toVersion)],
    );
    from = rows.find((r) => Number(r.version) === Number(fromVersion));
    to = rows.find((r) => Number(r.version) === Number(toVersion));
  }
  if (!from || !to) return null;

  const changes = diffSnapshots(parseJSON(from.snapshot, {}), parseJSON(to.snapshot, {}));
  const changedFields = changes.filter((c) => c.changed).map((c) => c.field);
  const fromScore = from.score === null ? null : Number(from.score);
  const toScore = to.score === null ? null : Number(to.score);
  const scoreDelta =
    fromScore === null || toScore === null ? null : Math.round((toScore - fromScore) * 10) / 10;

  const meta = (row) => ({
    id: row.id,
    version: Number(row.version),
    score: row.score === null ? null : Number(row.score),
    level: row.level,
    dimensions: parseJSON(row.dimensions, null),
    created_at: row.created_at,
    report_id: row.report_id,
  });

  return { from: meta(from), to: meta(to), changes, changedFields, scoreDelta };
}

/** 取某份病历最近一次版本 */
export async function latestVersion(recordId) {
  return one(
    'SELECT * FROM record_versions WHERE record_id = ? ORDER BY version DESC LIMIT 1',
    [recordId],
  );
}
