/**
 * 审计哈希链的数据库写入、回填与校验。
 * 所有审计写入都串行到 audit_chain 单行上（SELECT ... FOR UPDATE），
 * 保证并发（例如批量质控 2 个 worker）时不会把链写断。
 */
import { query, transaction } from '../db.js';
import { formatDateTime, hashAudit, verifyAuditRows } from './hash.js';

/**
 * 追加一条审计日志。
 * @param {{user?:{id?:number,name?:string}, action:string, targetType?:string|null, targetId?:number|null, detail?:string|null, ip?:string|null}} input
 */
export async function appendAudit({ user, action, targetType = null, targetId = null, detail = null, ip = null }) {
  if (!action) throw new Error('审计动作不能为空');
  const createdAt = formatDateTime(new Date());
  const row = {
    user_id: user?.id ?? null,
    user_name: user?.name ?? null,
    action,
    target_type: targetType,
    target_id: targetId,
    detail: detail ? String(detail).slice(0, 500) : null,
    ip: ip ? String(ip).replace('::ffff:', '').slice(0, 45) : null,
    created_at: createdAt,
  };

  return transaction(async (conn) => {
    await conn.query("INSERT INTO audit_chain (id, last_id, last_hash) VALUES (1, 0, '') ON DUPLICATE KEY UPDATE id = id");
    const [heads] = await conn.query('SELECT last_hash FROM audit_chain WHERE id = 1 FOR UPDATE');
    const prevHash = heads[0]?.last_hash || '';
    const hash = hashAudit(row, prevHash);

    const [result] = await conn.query(
      `INSERT INTO audit_logs
       (user_id, user_name, action, target_type, target_id, detail, ip, prev_hash, hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.user_id, row.user_name, row.action, row.target_type, row.target_id,
        row.detail, row.ip, prevHash, hash, createdAt,
      ],
    );
    await conn.query('UPDATE audit_chain SET last_id = ?, last_hash = ? WHERE id = 1', [result.insertId, hash]);
    return { id: result.insertId, hash };
  });
}

/**
 * 重建整条审计链（迁移旧库/seed 后调用）。
 * @param {import('mysql2/promise').Connection} conn
 * @returns {Promise<{count:number,lastHash:string}>}
 */
export async function backfillAuditChain(conn) {
  await conn.query("INSERT INTO audit_chain (id, last_id, last_hash) VALUES (1, 0, '') ON DUPLICATE KEY UPDATE id = id");
  const [rows] = await conn.query(
    `SELECT id, user_id, user_name, action, target_type, target_id, detail, ip, created_at
     FROM audit_logs ORDER BY id ASC`,
  );

  let prevHash = '';
  for (const row of rows) {
    const hash = hashAudit(row, prevHash);
    await conn.query('UPDATE audit_logs SET prev_hash = ?, hash = ? WHERE id = ?', [prevHash, hash, row.id]);
    prevHash = hash;
  }
  const lastId = rows.length ? rows[rows.length - 1].id : 0;
  await conn.query('UPDATE audit_chain SET last_id = ?, last_hash = ? WHERE id = 1', [lastId, prevHash]);
  return { count: rows.length, lastHash: prevHash };
}

/** 校验当前审计链是否完整（全量） */
export async function verifyStoredChain() {
  const rows = await query(
    `SELECT id, user_id, user_name, action, target_type, target_id, detail, ip, prev_hash, hash, created_at
     FROM audit_logs ORDER BY id ASC`,
  );
  const result = verifyAuditRows(rows);
  const head = await query('SELECT last_id, last_hash FROM audit_chain WHERE id = 1');
  const chain = head[0] || { last_id: 0, last_hash: '' };
  const lastRow = rows[rows.length - 1];

  if (result.ok) {
    if (!lastRow && (Number(chain.last_id) !== 0 || chain.last_hash !== '')) {
      return { ...result, ok: false, reason: '链头存在但日志为空' };
    }
    if (lastRow && (Number(chain.last_id) !== Number(lastRow.id) || chain.last_hash !== lastRow.hash)) {
      return { ...result, ok: false, reason: '链头与最后一条日志不一致' };
    }
  }
  return {
    ...result,
    total: rows.length,
    head: { lastId: Number(chain.last_id), lastHash: chain.last_hash },
  };
}
