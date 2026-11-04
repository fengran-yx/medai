/**
 * 质控规则的「默认定义」与手工规则库。
 *
 * 为什么单独一个文件：
 * - local.js（离线规则引擎）在单元测试里会被直接 import，不应该顺带连数据库；
 * - DB 里的 qc_rules 只存"可调项"（启停 / 权重 / 严重程度），默认值在这里兜底；
 * - 历史报告里的旧规则编码（C-CHIEF_COMPLAINT 等）通过 alias 归一，保证统计口径连续。
 */

export const RULE_DEFAULTS = [
  { code: 'C-001', name: '主诉缺失', category: 'completeness', severity: 'critical', weight: 22 },
  { code: 'C-002', name: '现病史缺失', category: 'completeness', severity: 'critical', weight: 22 },
  { code: 'C-003', name: '既往史缺失', category: 'completeness', severity: 'major', weight: 12 },
  { code: 'C-004', name: '体格检查缺失', category: 'completeness', severity: 'major', weight: 12 },
  { code: 'C-005', name: '辅助检查缺失', category: 'completeness', severity: 'minor', weight: 8 },
  { code: 'C-006', name: '处理意见缺失', category: 'completeness', severity: 'major', weight: 12 },
  { code: 'C-007', name: '诊断缺失', category: 'completeness', severity: 'critical', weight: 20 },
  { code: 'C-008', name: '病历字段过于简略', category: 'completeness', severity: 'minor', weight: 6 },
  { code: 'L-001', name: '主诉与现病史不一致', category: 'logic', severity: 'major', weight: 12 },
  { code: 'L-002', name: '病程时间描述缺失', category: 'logic', severity: 'major', weight: 8 },
  { code: 'A-001', name: '诊断名称不规范', category: 'accuracy', severity: 'major', weight: 8 },
  { code: 'A-002', name: '检查结果与诊断不符', category: 'accuracy', severity: 'major', weight: 10 },
  { code: 'T-001', name: '表述不规范', category: 'terminology', severity: 'minor', weight: 10 },
  { code: 'T-002', name: '医学术语缩写未说明', category: 'terminology', severity: 'minor', weight: 5 },
];

export const RULE_ALIAS = {
  'C-CHIEF_COMPLAINT': 'C-001',
  'C-PRESENT_ILLNESS': 'C-002',
  'C-PAST_HISTORY': 'C-003',
  'C-PHYSICAL_EXAM': 'C-004',
  'C-AUXILIARY_EXAM': 'C-005',
  'C-TREATMENT': 'C-006',
  'C-DIAGNOSIS': 'C-007',
};

const DEFAULT_MAP = new Map(RULE_DEFAULTS.map((r) => [r.code, { ...r, defaultWeight: r.weight, enabled: 1 }]));
const DEFAULT_WEIGHT = Object.fromEntries(RULE_DEFAULTS.map((r) => [r.code, r.weight]));

/** 把历史编码归一到当前规则编码 */
export function normalizeCode(code) {
  const raw = String(code || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.endsWith('-SHORT')) {
    const base = raw.slice(0, -6);
    return RULE_ALIAS[base] ? 'C-008' : raw;
  }
  return RULE_ALIAS[raw] || raw;
}

const FIELD_RULE = {
  chief_complaint: 'C-001',
  present_illness: 'C-002',
  past_history: 'C-003',
  physical_exam: 'C-004',
  auxiliary_exam: 'C-005',
  treatment: 'C-006',
  diagnosis: 'C-007',
};
const FIELD_ALIAS = {
  主诉: 'chief_complaint',
  现病史: 'present_illness',
  既往史: 'past_history',
  体格检查: 'physical_exam',
  辅助检查: 'auxiliary_exam',
  处理意见: 'treatment',
  诊断: 'diagnosis',
};
const COMPLETENESS_CODES = new Set(['C-001', 'C-002', 'C-003', 'C-004', 'C-005', 'C-006', 'C-007', 'C-008']);

/**
 * 把 AI/规则引擎返回的问题对齐到规则库编码。
 *
 * 大模型有时会把「主诉与现病史不符」也标成 C-001，直接按编码套严重程度会张冠李戴；
 * 这里先看编码与规则名是否一致，再用语义关键词重新归类，无法归类时保留 AI-xxx。
 */
export function matchRuleCode(issue = {}) {
  const existing = normalizeCode(issue.ruleCode || issue.code || '');
  const existingRule = DEFAULT_MAP.get(existing);
  const ruleName = String(issue.rule || '');
  const message = String(issue.message || '');
  const hay = `${ruleName} ${message}`;
  const field = FIELD_ALIAS[issue.field] || issue.field;

  if (existingRule && (ruleName.includes(existingRule.name) || existingRule.name.includes(ruleName))) {
    return existing;
  }

  if (/主诉/.test(hay) && /现病史|病史/.test(hay) && /不一致|不符|矛盾|未描述|未体现/.test(hay)) return 'L-001';
  if (/时间|病程/.test(hay) && /现病史|病史|缺/.test(hay)) return 'L-002';
  if (/诊断/.test(hay) && /ICD|编码|标准名称|规范/.test(hay)) return 'A-001';
  if (/诊断/.test(hay) && /依据|证据/.test(hay) && /不足|不充分/.test(hay)) return 'A-002';
  if (/检查/.test(hay) && /诊断/.test(hay) && /不符|矛盾|依据不充分|依据不足|无依据/.test(hay)) return 'A-002';
  if (/缩写/.test(hay)) return 'T-002';
  if (/术语|表述/.test(hay) && /不规范|模糊|口语|未说明|不准确/.test(hay)) return 'T-001';

  if (FIELD_RULE[field]) {
    // 先判断"部分缺项/写得太简"，否则会把"现病史缺项"误判成整段缺失
    if (/缺项|不完整|不具体|过简|过短|信息量不足|不充分/.test(hay)) return 'C-008';
    if (/缺失|未填写|未记录|未描述|空缺/.test(hay)) return FIELD_RULE[field];
  }
  if (/缺失|未填写/.test(hay)) {
    for (const [key, code] of Object.entries(FIELD_RULE)) {
      if (hay.includes(key)) return code;
    }
  }

  // 完整性问题的编码不可盲信（AI 容易按示例套 C-001）；其他规则编码可保留
  if (existingRule && !COMPLETENESS_CODES.has(existing)) return existing;
  return existing && !existingRule ? existing : 'AI-001';
}

function normalizeEnabled(v) {
  if (v === undefined || v === null) return 1;
  return v === true || v === 1 || v === '1' ? 1 : 0;
}

function normalizeSeverity(v) {
  return ['critical', 'major', 'minor'].includes(v) ? v : 'minor';
}

/**
 * 接受 DB 行数组 / Map / undefined，返回 code -> rule 的 Map。
 * 未出现在 DB 里的规则用默认值补齐（兼容旧库尚未迁移的情况）。
 */
export function normalizeRules(input) {
  const map = new Map();
  for (const [code, rule] of DEFAULT_MAP) map.set(code, { ...rule });

  if (input instanceof Map) {
    for (const [code, rule] of input) mergeRule(map, code, rule);
  } else if (Array.isArray(input)) {
    for (const rule of input) mergeRule(map, rule?.code, rule);
  } else if (input && typeof input === 'object') {
    for (const [code, rule] of Object.entries(input)) mergeRule(map, code, rule);
  }
  return map;
}

function mergeRule(map, code, rule) {
  if (!code || !rule) return;
  const key = normalizeCode(code);
  const base = map.get(key) || { code: key, name: key, category: 'completeness', severity: 'minor', weight: DEFAULT_WEIGHT[key] ?? 10 };
  map.set(key, {
    ...base,
    ...rule,
    code: key,
    defaultWeight: DEFAULT_WEIGHT[key] ?? base.defaultWeight ?? base.weight ?? 10,
    severity: normalizeSeverity(rule.severity ?? base.severity),
    enabled: normalizeEnabled(rule.enabled),
    weight: Math.max(0, Number(rule.weight ?? base.weight ?? 0) || 0),
  });
}

/** 规则是否启用（未知编码默认启用，避免旧数据被误伤） */
export function isEnabled(map, code) {
  const rule = map.get(normalizeCode(code));
  return !rule || rule.enabled !== 0;
}

/** 计算权重系数：权重改了，扣分按比例缩放；默认权重得 1 */
export function weightFactor(map, code) {
  const rule = map.get(normalizeCode(code));
  if (!rule) return 1;
  const base = rule.defaultWeight || 1;
  return Math.max(0, Number(rule.weight) || 0) / base;
}

export { DEFAULT_MAP as DEFAULT_RULE_MAP };
