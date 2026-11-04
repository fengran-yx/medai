/**
 * 质控规则的数据库读取与缓存。
 *
 * 管理端调整规则后必须让下一次质控立即生效，所以：
 * - 读缓存 10 秒（多进程部署时也能自动过期）；
 * - 单进程内 PUT /rules/:id 成功后主动 invalidate，下一次质控立刻用新规则。
 */
import { query } from '../db.js';
import { normalizeRules } from './rule-defs.js';

const TTL_MS = 10_000;
let cache = { at: 0, rules: null };

export async function getRules({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cache.rules && now - cache.at < TTL_MS) return cache.rules;

  try {
    const rows = await query(
      'SELECT code, name, category, severity, weight, enabled, description FROM qc_rules ORDER BY id',
    );
    const rules = normalizeRules(rows);
    cache = { at: now, rules };
    return rules;
  } catch (err) {
    console.warn('[rules] 读取质控规则失败，使用默认规则:', err.message);
    const rules = normalizeRules();
    cache = { at: now, rules };
    return rules;
  }
}

export function invalidateRules() {
  cache = { at: 0, rules: null };
}

/** 供前端规则页展示"近 30 天命中次数" */
export function countIssueHits(reports, aliasFn) {
  const counter = new Map();
  for (const row of reports) {
    let issues = [];
    try {
      issues = typeof row.issues === 'string' ? JSON.parse(row.issues) : row.issues || [];
    } catch {
      issues = [];
    }
    for (const it of issues) {
      const code = aliasFn(it.ruleCode || it.code || '');
      if (!code) continue;
      counter.set(code, (counter.get(code) || 0) + 1);
    }
  }
  return Object.fromEntries(counter);
}
