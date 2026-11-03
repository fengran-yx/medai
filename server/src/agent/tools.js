/**
 * Agent 工具定义与执行器
 *
 * 设计原则：
 *  - 工具只做「读」和「一次质控」这类幂等或可控的操作，避免模型乱删数据；
 *  - 每个工具都有参数白名单与上限（limit 最大 20），防止模型要求全表扫描；
 *  - 返回结构统一裁剪，避免把整份病历塞回上下文浪费 token。
 */
import { one, query } from '../db.js';
import { runQC } from '../ai/index.js';

/** 给大模型看的工具声明（OpenAI / DeepSeek function calling 格式） */
export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'query_records',
      description: '按条件查询病历列表，返回病历编号、患者、科室、状态、最近质控分。最多返回 20 条。',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['draft', 'submitted', 'qc_passed', 'qc_failed'],
            description: '病历状态，可不填',
          },
          keyword: { type: 'string', description: '患者姓名、病案号或诊断关键词' },
          limit: { type: 'integer', description: '返回条数，默认 5，最大 20' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_qc',
      description: '对指定病历运行 AI 质控，返回总分、等级与主要问题清单。一次只处理一条。',
      parameters: {
        type: 'object',
        properties: {
          recordId: { type: 'integer', description: '病历 ID（来自 query_records 的返回）' },
        },
        required: ['recordId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'qc_statistics',
      description: '统计最近 N 天的质控情况：质控份数、平均分、通过率、高频问题 Top5、科室分布。',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: '统计天数，默认 7，最大 90' },
        },
        required: [],
      },
    },
  },
];

/** 工具执行器 */
const EXECUTORS = {
  async query_records(args) {
    const limit = Math.min(20, Math.max(1, Number(args.limit) || 5));
    const where = [];
    const params = [];

    if (args.status) {
      where.push('mr.status = ?');
      params.push(String(args.status));
    }
    if (args.keyword) {
      where.push('(p.name LIKE ? OR p.mrn LIKE ? OR mr.diagnosis LIKE ?)');
      const k = `%${args.keyword}%`;
      params.push(k, k, k);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await query(
      `SELECT mr.id, p.name AS patient, p.mrn, d.name AS dept, mr.status, mr.diagnosis,
              (SELECT q.score FROM qc_reports q WHERE q.record_id = mr.id ORDER BY q.id DESC LIMIT 1) AS score
       FROM medical_records mr
       JOIN patients p ON p.id = mr.patient_id
       JOIN visits v ON v.id = mr.visit_id
       LEFT JOIN departments d ON d.id = v.dept_id
       ${whereSql}
       ORDER BY mr.id DESC
       LIMIT ?`,
      [...params, limit],
    );

    return {
      count: rows.length,
      records: rows.map((r) => ({
        recordId: r.id,
        patient: r.patient,
        mrn: r.mrn,
        dept: r.dept,
        status: r.status,
        diagnosis: r.diagnosis,
        score: r.score === null ? null : Number(r.score),
      })),
    };
  },

  async run_qc(args) {
    const recordId = Number(args.recordId);
    if (!recordId) return { error: 'recordId 必填' };

    const record = await one('SELECT * FROM medical_records WHERE id = ?', [recordId]);
    if (!record) return { error: `病历 ${recordId} 不存在` };

    const report = await runQC(record);
    const saved = await query(
      `INSERT INTO qc_reports
       (record_id, score, level, dim_completeness, dim_accuracy, dim_logic, dim_terminology,
        risk, issues, suggestions, summary, model, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ],
    );
    await query('UPDATE medical_records SET status = ? WHERE id = ?', [
      report.score >= 80 ? 'qc_passed' : 'qc_failed',
      record.id,
    ]);

    return {
      reportId: saved.insertId,
      recordId: record.id,
      score: report.score,
      level: report.level,
      risk: report.risk,
      model: report.model,
      issues: (report.issues || []).slice(0, 5).map((i) => ({
        rule: i.rule,
        severity: i.severity,
        message: i.message,
      })),
      summary: report.summary,
    };
  },

  async qc_statistics(args) {
    const days = Math.min(90, Math.max(1, Number(args.days) || 7));

    const agg = await one(
      `SELECT COUNT(*) AS total, ROUND(AVG(score), 1) AS avgScore,
              ROUND(SUM(score >= 80) / COUNT(*) * 100, 1) AS passRate
       FROM qc_reports WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days],
    );

    const issues = await query(
      `SELECT jt.rule AS rule, COUNT(*) AS c
       FROM qc_reports q,
            JSON_TABLE(q.issues, '$[*]' COLUMNS (rule VARCHAR(100) PATH '$.rule')) AS jt
       WHERE q.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY jt.rule ORDER BY c DESC LIMIT 5`,
      [days],
    );

    const depts = await query(
      `SELECT d.name AS dept, COUNT(*) AS c
       FROM qc_reports q
       JOIN medical_records mr ON mr.id = q.record_id
       JOIN visits v ON v.id = mr.visit_id
       JOIN departments d ON d.id = v.dept_id
       WHERE q.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY d.id, d.name ORDER BY c DESC`,
      [days],
    );

    return {
      days,
      total: agg.total,
      avgScore: agg.avgScore === null ? null : Number(agg.avgScore),
      passRate: agg.passRate === null ? null : Number(agg.passRate),
      topIssues: issues.map((i) => ({ rule: i.rule, count: i.c })),
      depts: depts.map((d) => ({ dept: d.dept, count: d.c })),
    };
  },
};

/** 执行一个工具调用，异常不抛出，作为结果返回给模型 */
export async function executeTool(name, args) {
  const fn = EXECUTORS[name];
  if (!fn) return { error: `未知工具: ${name}` };
  try {
    const started = Date.now();
    const result = await fn(args || {});
    return { ...result, _ms: Date.now() - started };
  } catch (err) {
    return { error: `工具执行失败: ${err.message}` };
  }
}

export const TOOL_NAMES = Object.keys(EXECUTORS);
