/**
 * 审计日志哈希链：纯函数，不依赖数据库，便于迁移脚本、单测和校验端点共用。
 *
 * 每条日志的 hash = sha256(prev_hash + 规范化字段)；
 * 任意一条被修改/删除，后续 hash 都会对不上，从而发现篡改。
 */
import crypto from 'node:crypto';

export function formatDateTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 参与哈希的规范化内容，字段顺序固定 */
export function canonicalAudit(row = {}) {
  return [
    row.user_id ?? '',
    row.user_name ?? '',
    row.action ?? '',
    row.target_type ?? '',
    row.target_id ?? '',
    row.detail ?? '',
    row.ip ?? '',
    row.created_at ?? '',
  ].map((v) => String(v)).join('\n');
}

export function hashAudit(row, prevHash = '') {
  return crypto.createHash('sha256').update(`${prevHash}\n${canonicalAudit(row)}`, 'utf8').digest('hex');
}

/**
 * 校验按 id 升序排列的日志。
 * @returns {{ok:boolean, checked:number, lastHash:string, brokenId?:number, reason?:string}}
 */
export function verifyAuditRows(rows) {
  let prevHash = '';
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const expected = hashAudit(row, prevHash);
    if (!row.hash || row.prev_hash !== prevHash || row.hash !== expected) {
      return {
        ok: false,
        checked: i,
        lastHash: prevHash,
        brokenId: row.id,
        reason: !row.hash ? '缺少哈希值' : row.prev_hash !== prevHash ? '前序哈希不匹配' : '内容哈希不匹配',
      };
    }
    prevHash = expected;
  }
  return { ok: true, checked: rows.length, lastHash: prevHash };
}
