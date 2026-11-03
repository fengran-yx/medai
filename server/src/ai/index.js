/**
 * AI 引擎入口：优先调用 DeepSeek，失败或未配置 Key 时自动降级到本地规则引擎。
 * 统一返回 { ...result, source: 'deepseek' | 'rule-engine' }，前端据此展示来源标签。
 */
import { config, hasRemoteAI } from '../config.js';
import { localQC, localDiagnosis, localChat } from './local.js';

const TIMEOUT_MS = 45_000;

async function callDeepSeek(messages, { json = false, temperature = 0.2 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${config.deepseek.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.deepseek.apiKey}`,
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        messages,
        temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`DeepSeek HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('DeepSeek 返回内容为空');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function parseJSON(text) {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI 未返回 JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));

function normalizeQC(raw, fallback) {
  const dims = raw.dimensions || raw.dim || {};
  const dimensions = {
    completeness: clamp(dims.completeness ?? fallback.dimensions.completeness, 0, 100),
    accuracy: clamp(dims.accuracy ?? fallback.dimensions.accuracy, 0, 100),
    logic: clamp(dims.logic ?? fallback.dimensions.logic, 0, 100),
    terminology: clamp(dims.terminology ?? fallback.dimensions.terminology, 0, 100),
  };
  const score = clamp(raw.score ?? fallback.score, 0, 100);
  const issues = Array.isArray(raw.issues) ? raw.issues.slice(0, 20).map((i) => ({
    ruleCode: i.ruleCode || i.code || 'AI-001',
    rule: i.rule || '质控问题',
    severity: ['critical', 'major', 'minor'].includes(i.severity) ? i.severity : 'minor',
    field: i.field || '',
    message: i.message || '',
    suggestion: i.suggestion || '',
  })) : fallback.issues;
  return {
    score: Math.round(score * 10) / 10,
    level: raw.level || (score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 60 ? 'C' : 'D'),
    dimensions,
    risk: clamp(raw.risk ?? fallback.risk, 0, 3),
    issues,
    suggestions: Array.isArray(raw.suggestions) && raw.suggestions.length ? raw.suggestions.slice(0, 8) : fallback.suggestions,
    summary: raw.summary || fallback.summary,
  };
}

const QC_SYSTEM = `你是一名三甲医院病案质控专家。请严格依据《病历书写基本规范》对电子病历进行质控，只输出 JSON，不要输出任何解释文字。
JSON 结构：
{"score":0-100,"level":"A|B|C|D","dimensions":{"completeness":0-100,"accuracy":0-100,"logic":0-100,"terminology":0-100},
"risk":0-3,"issues":[{"ruleCode":"C-001","rule":"问题名称","severity":"critical|major|minor","field":"字段名","message":"问题描述","suggestion":"修改建议"}],
"suggestions":["整改建议"],"summary":"总评，100字以内"}
评分要求：完整性 35%、准确性 30%、逻辑性 20%、规范性 15% 加权；发现缺项、前后矛盾、诊断与检查不符、术语不规范均应扣分。`;

/** 病历质控 */
export async function runQC(record) {
  const startedAt = Date.now();
  const fallback = localQC(record);
  if (!hasRemoteAI) {
    return { ...fallback, model: 'rule-engine', durationMs: Date.now() - startedAt };
  }
  const userContent = `病历字段如下（空字符串表示未填写）：
【主诉】${record.chief_complaint || ''}
【现病史】${record.present_illness || ''}
【既往史】${record.past_history || ''}
【体格检查】${record.physical_exam || ''}
【辅助检查】${record.auxiliary_exam || ''}
【诊断】${record.diagnosis || ''}
【处理意见】${record.treatment || ''}`;
  try {
    const text = await callDeepSeek(
      [{ role: 'system', content: QC_SYSTEM }, { role: 'user', content: userContent }],
      { json: true },
    );
    const result = normalizeQC(parseJSON(text), fallback);
    return { ...result, model: config.deepseek.model, durationMs: Date.now() - startedAt };
  } catch (err) {
    console.warn('[ai] 质控调用失败，降级规则引擎:', err.message);
    return { ...fallback, model: 'rule-engine(fallback)', durationMs: Date.now() - startedAt };
  }
}

const DX_SYSTEM = `你是一名临床主治医师，负责输出辅助诊断参考意见。只输出 JSON：
{"possibleDiagnoses":[{"name":"疾病名","icd":"ICD-10编码","probability":"高|中|低|待定","basis":"判断依据","rank":1}],
"recommendedExams":["检查建议"],"redFlags":["需立即处理的危险信号"],"triage":"分诊建议","disclaimer":"免责声明"}
要求：按可能性排序，最多 5 条；不得给出具体处方剂量；必须包含免责声明。`;

/** 辅助诊断 */
export async function runDiagnosis(payload) {
  const startedAt = Date.now();
  const fallback = localDiagnosis(payload);
  if (!hasRemoteAI) {
    return { ...fallback, model: 'rule-engine', durationMs: Date.now() - startedAt };
  }
  const userContent = `患者信息：年龄 ${payload.age ?? '未知'}，性别 ${payload.gender || '未知'}。
症状与病史：${payload.symptoms || '未提供'}
检查检验结果：${payload.exams || '未提供'}`;
  try {
    const text = await callDeepSeek(
      [{ role: 'system', content: DX_SYSTEM }, { role: 'user', content: userContent }],
      { json: true, temperature: 0.3 },
    );
    const raw = parseJSON(text);
    return {
      possibleDiagnoses: Array.isArray(raw.possibleDiagnoses) ? raw.possibleDiagnoses.slice(0, 5) : fallback.possibleDiagnoses,
      recommendedExams: raw.recommendedExams?.length ? raw.recommendedExams : fallback.recommendedExams,
      redFlags: raw.redFlags?.length ? raw.redFlags : fallback.redFlags,
      triage: raw.triage || fallback.triage,
      disclaimer: raw.disclaimer || fallback.disclaimer,
      model: config.deepseek.model,
      durationMs: Date.now() - startedAt,
      source: 'deepseek',
    };
  } catch (err) {
    console.warn('[ai] 诊断调用失败，降级规则引擎:', err.message);
    return { ...fallback, model: 'rule-engine(fallback)', durationMs: Date.now() - startedAt };
  }
}

const CHAT_SYSTEM = `你是「智医质控」平台的医学助手，服务对象是医院医生与质控人员。
要求：回答专业、结构清晰、可使用要点列表；不给出具体药物剂量；涉及诊疗决策时提醒以临床指南和面诊为准；无法确定时明确说明。`;

/** 多轮问答 */
export async function runChat(messages) {
  const last = messages[messages.length - 1]?.content || '';
  if (!hasRemoteAI) {
    return { content: localChat(last), model: 'rule-engine', source: 'rule-engine' };
  }
  try {
    const content = await callDeepSeek(
      [{ role: 'system', content: CHAT_SYSTEM }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
      { temperature: 0.5 },
    );
    return { content, model: config.deepseek.model, source: 'deepseek' };
  } catch (err) {
    console.warn('[ai] 问答调用失败，降级规则引擎:', err.message);
    return { content: localChat(last), model: 'rule-engine(fallback)', source: 'rule-engine' };
  }
}
