/**
 * 重建审计哈希链（运维工具）
 * 用途：清洗历史日志、迁移数据后重新计算 prev_hash/hash，并同步链头。
 * 用法：npm run audit:rebuild
 */
import 'dotenv/config';
import { pool } from '../src/db.js';
import { backfillAuditChain } from '../src/audit/chain.js';

const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  const result = await backfillAuditChain(conn);
  await conn.commit();
  console.log(`✔ 审计链已重建：${result.count} 条，链头 ${result.lastHash.slice(0, 16)}…`);
} catch (err) {
  await conn.rollback();
  console.error('✖ 重建失败：', err.message);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
