/**
 * 批量质控：把一次勾选的病历做成可追踪的异步任务。
 *
 * 为什么不直接在请求里循环：
 * - 20 份病历 × 每份 4 秒的大模型调用会超过浏览器/网关超时；
 * - 需要给用户实时进度、失败明细，并且服务重启后不能永远显示"运行中"。
 *
 * 这里用「任务表 + 明细表 + 进程内并发 2」实现，前端轮询 /records/batch-qc/:id。
 */
import { one, query } from '../db.js';
import { audit } from '../middleware/auth.js';
import { evaluateRecord } from './service.js';

const MAX_BATCH = 20;
const CONCURRENCY = 2;
const activeBatches = new Set();

export class BatchError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function normalizeIds(input) {
  if (!Array.isArray(input)) throw new BatchError('recordIds 必须是数组');
  const ids = [...new Set(input.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) throw new BatchError('请至少选择 1 份病历');
  if (ids.length > MAX_BATCH) throw new BatchError(`单次最多 ${MAX_BATCH} 份病历，请分批提交`);
  return ids;
}

/**
 * 创建批次并立即返回；实际质控在 setImmediate 中异步执行。
 * @returns {Promise<{batchId:number,total:number,skipped:number[]}>}
 */
export async function createBatch({ user, recordIds }) {
  const ids = normalizeIds(recordIds);

  const rows = await query(
    `SELECT mr.* FROM medical_records mr WHERE mr.id IN (?)`,
    [ids],
  );
  const records = user?.role === 'clinician' ? rows.filter((r) => Number(r.doctor_id) === Number(user.id)) : rows;
  if (!records.length) throw new BatchError('没有可质控的病历（可能不存在或无权操作）', 404);

  // 同一份病历如果已经在跑，先跳过，避免重复扣费与版本号竞争
  const running = await query(
    `SELECT qi.record_id FROM qc_batch_items qi
     JOIN qc_batches qb ON qb.id = qi.batch_id
     WHERE qb.status IN ('queued','running') AND qi.record_id IN (?)`,
    [records.map((r) => r.id)],
  );
  const runningIds = new Set(running.map((r) => Number(r.record_id)));
  const targets = records.filter((r) => !runningIds.has(Number(r.id)));
  const skipped = records.filter((r) => runningIds.has(Number(r.id))).map((r) => Number(r.id));
  if (!targets.length) throw new BatchError('所选病历正在批量质控中，请等待当前任务完成', 409);

  const batch = await query(
    'INSERT INTO qc_batches (user_id, user_name, total, status) VALUES (?, ?, ?, ?)',
    [user?.id ?? null, user?.name ?? null, targets.length, 'queued'],
  );
  const batchId = batch.insertId;

  for (const rec of targets) {
    await query('INSERT INTO qc_batch_items (batch_id, record_id) VALUES (?, ?)', [batchId, rec.id]);
  }

  setImmediate(() => {
    runBatch(batchId, targets, user).catch((err) => {
      console.error(`[batch ${batchId}] 执行失败:`, err);
    });
  });

  return { batchId, total: targets.length, skipped };
}

async function runBatch(batchId, records, user) {
  activeBatches.add(batchId);
  const fakeReq = { user: { id: user?.id, name: user?.name }, ip: 'batch' };
  const queue = [...records];
  let done = 0;
  let failed = 0;
  let improved = 0;
  let deltaSum = 0;
  let deltaCount = 0;

  await query("UPDATE qc_batches SET status = 'running' WHERE id = ?", [batchId]);

  async function worker() {
    while (queue.length) {
      const rec = queue.shift();
      const item = await one('SELECT id FROM qc_batch_items WHERE batch_id = ? AND record_id = ?', [batchId, rec.id]);
      if (!item) continue;
      await query("UPDATE qc_batch_items SET status = 'running', error = NULL WHERE id = ?", [item.id]);
      const startedAt = Date.now();
      try {
        const result = await evaluateRecord(rec);
        const ms = Date.now() - startedAt;
        if (result.scoreDelta !== null && result.scoreDelta !== undefined) {
          deltaSum += result.scoreDelta;
          deltaCount += 1;
          if (result.scoreDelta > 0) improved += 1;
        }
        done += 1;
        await query(
          "UPDATE qc_batch_items SET status = 'ok', score = ?, level = ?, report_id = ?, ms = ? WHERE id = ?",
          [result.score, result.level, result.reportId, ms, item.id],
        );
        await audit(fakeReq, 'record.qc', 'record', rec.id, `批量质控得分 ${result.score}（${result.level}级）`);
      } catch (err) {
        failed += 1;
        await query(
          "UPDATE qc_batch_items SET status = 'failed', error = ?, ms = ? WHERE id = ?",
          [String(err.message || '质控失败').slice(0, 300), Date.now() - startedAt, item.id],
        );
      }
      await query('UPDATE qc_batches SET done = ?, failed = ? WHERE id = ?', [done, failed, batchId]);
    }
  }

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    const avgDelta = deltaCount ? Math.round((deltaSum / deltaCount) * 10) / 10 : null;
    await query(
      `UPDATE qc_batches
       SET status = 'done', improved = ?, avg_delta = ?, finished_at = NOW()
       WHERE id = ?`,
      [improved, avgDelta, batchId],
    );
  } catch (err) {
    console.error(`[batch ${batchId}]`, err);
    await query(
      "UPDATE qc_batches SET status = 'failed', finished_at = NOW() WHERE id = ?",
      [batchId],
    );
    await query(
      "UPDATE qc_batch_items SET status = 'failed', error = '任务异常中断' WHERE batch_id = ? AND status IN ('pending','running')",
      [batchId],
    );
  } finally {
    activeBatches.delete(batchId);
  }
}

/** 查询批次进度与明细 */
export async function getBatch(batchId, user) {
  const batch = await one('SELECT * FROM qc_batches WHERE id = ?', [batchId]);
  if (!batch) throw new BatchError('批量任务不存在', 404);
  if (user?.role === 'clinician' && Number(batch.user_id) !== Number(user.id)) {
    throw new BatchError('无权查看该批量任务', 403);
  }
  const items = await query(
    `SELECT qi.id, qi.record_id, qi.status, qi.score, qi.level, qi.report_id, qi.error, qi.ms,
            p.name AS patient_name, p.mrn, mr.status AS record_status,
            d.name AS dept_name
     FROM qc_batch_items qi
     JOIN medical_records mr ON mr.id = qi.record_id
     JOIN patients p ON p.id = mr.patient_id
     LEFT JOIN visits v ON v.id = mr.visit_id
     LEFT JOIN departments d ON d.id = v.dept_id
     WHERE qi.batch_id = ?
     ORDER BY qi.id`,
    [batchId],
  );
  const total = Number(batch.total) || 0;
  const percent = total ? Math.round(((Number(batch.done) + Number(batch.failed)) / total) * 100) : 0;
  return {
    ...batch,
    total,
    done: Number(batch.done),
    failed: Number(batch.failed),
    improved: Number(batch.improved),
    avg_delta: batch.avg_delta === null ? null : Number(batch.avg_delta),
    percent,
    running: activeBatches.has(Number(batchId)),
    items,
  };
}

/** 服务启动时把上次异常退出的任务收尾，避免前端一直轮询 */
export async function recoverInterruptedBatches() {
  const stale = await query("SELECT id FROM qc_batches WHERE status IN ('queued','running')");
  if (!stale.length) return 0;
  await query("UPDATE qc_batches SET status = 'failed', finished_at = NOW() WHERE status IN ('queued','running')");
  await query(
    "UPDATE qc_batch_items SET status = 'failed', error = '服务重启，任务中断' WHERE status IN ('pending','running')",
  );
  return stale.length;
}
