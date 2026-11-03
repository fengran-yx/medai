/**
 * Agent 编排
 *
 * 两种模式：
 *  1. 大模型模式（配置了 Key）：function calling 循环，模型自己决定调哪个工具、传什么参数，
 *     最多 5 轮；每轮把工具结果回灌给模型，直到它给出最终答复。
 *  2. 规则模式（无 Key / 调用失败）：按关键词选择固定编排，也能跑出完整链路，
 *     保证演示与 CI 不依赖外部服务。
 */
import { hasRemoteAI } from '../config.js';
import { callChatCompletions } from '../ai/index.js';
import { TOOL_DEFS, executeTool } from './tools.js';

const MAX_STEPS = 5;

const SYSTEM_PROMPT = `你是医院质控科的 AI 助理，可以调用工具帮医生处理病历质控事务。

工作方式：
1. 先判断需要哪些数据，再调用工具；不要凭空编造病历编号或统计数字；
2. 需要多步时一步一步来，拿到上一步结果再决定下一步；
3. 涉及「批量质控」时，先查待质控病历，再逐条 run_qc，不要一次跑太多（最多 3 条）；
4. 最终答复用中文，结构清晰，包含：做了什么、关键结论、下一步建议；
5. 不确定的事情直说，不要编造。

可用工具：query_records（查病历）、run_qc（对单条病历质控）、qc_statistics（统计近期质控情况）。`;

/** 规则编排：按目标关键词挑选步骤 */
export function planFallback(goal) {
  const g = String(goal || '');
  const plan = [];

  const wantsBatch = /批量|全部|重新质控|不通过|failed/i.test(g);
  const wantsReport = /周报|报告|汇总|统计|趋势|指标/i.test(g);

  if (wantsBatch) {
    plan.push({ tool: 'query_records', args: { status: 'qc_failed', limit: 3 } });
    plan.push({ tool: 'run_qc', args: { fromRecords: true } });
  }
  if (wantsReport || !plan.length) {
    plan.push({ tool: 'qc_statistics', args: { days: 7 } });
  }

  return plan;
}

/** 根据执行结果拼一个可读的兜底答复 */
function composeFallbackAnswer(goal, steps) {
  const parts = [`（未配置大模型，使用固定编排完成「${goal}」）`];

  for (const s of steps) {
    if (s.tool === 'query_records' && s.result?.records) {
      parts.push(`查询到 ${s.result.count} 份病历：` +
        s.result.records.map((r) => `${r.patient}（${r.dept}，${r.score ?? '未质控'} 分）`).join('、'));
    }
    if (s.tool === 'run_qc' && s.result?.score !== undefined) {
      parts.push(`病历 ${s.result.recordId} 质控完成：${s.result.score} 分（${s.result.level} 级），` +
        `主要问题：${(s.result.issues || []).map((i) => i.rule).join('、') || '无'}`);
    }
    if (s.tool === 'qc_statistics' && s.result?.total !== undefined) {
      const r = s.result;
      parts.push(`近 ${r.days} 天质控 ${r.total} 份，平均 ${r.avgScore ?? '-'} 分，通过率 ${r.passRate ?? '-'}%；` +
        `高频问题：${(r.topIssues || []).map((i) => `${i.rule}(${i.count})`).join('、') || '无'}`);
    }
  }
  parts.push('如果要更自然的归纳，请在 server/.env 配置 DEEPSEEK_API_KEY。');
  return parts.join('\n\n');
}

async function runFallback(goal, startedAt) {
  const plan = planFallback(goal);
  const steps = [];

  for (const step of plan) {
    if (step.tool === 'run_qc' && step.args?.fromRecords) {
      // 批量质控：从上一个查询结果里取病历号
      const last = steps.findLast?.((s) => s.tool === 'query_records');
      const records = last?.result?.records || [];
      for (const r of records.slice(0, 3)) {
        const result = await executeTool('run_qc', { recordId: r.recordId });
        steps.push({ step: steps.length + 1, tool: 'run_qc', args: { recordId: r.recordId }, result, ms: result._ms });
      }
      continue;
    }
    const result = await executeTool(step.tool, step.args);
    steps.push({ step: steps.length + 1, tool: step.tool, args: step.args, result, ms: result._ms });
  }

  return {
    answer: composeFallbackAnswer(goal, steps),
    steps,
    model: 'rule-planner',
    status: 'fallback',
    durationMs: Date.now() - startedAt,
  };
}

/** 大模型 function calling 循环 */
async function runWithLLM(goal, startedAt) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: goal },
  ];
  const steps = [];
  let finalAnswer = '';

  for (let i = 0; i < MAX_STEPS; i++) {
    const message = await callChatCompletions({
      messages,
      tools: TOOL_DEFS,
      tool_choice: 'auto',
      temperature: 0.2,
    });

    if (!message) break;
    messages.push(message);

    if (!message.tool_calls?.length) {
      finalAnswer = message.content || '';
      break;
    }

    for (const call of message.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      const result = await executeTool(call.function.name, args);
      steps.push({
        step: steps.length + 1,
        tool: call.function.name,
        args,
        result,
        ms: result._ms,
      });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 4000),
      });
    }
  }

  if (!finalAnswer) {
    finalAnswer = composeFallbackAnswer(goal, steps);
  }

  return {
    answer: finalAnswer,
    steps,
    model: 'deepseek-chat',
    status: 'ok',
    durationMs: Date.now() - startedAt,
  };
}

/**
 * 运行 Agent
 * @param {string} goal 用户目标
 */
export async function runAgent(goal) {
  const startedAt = Date.now();

  if (!hasRemoteAI) {
    return runFallback(goal, startedAt);
  }

  try {
    return await runWithLLM(goal, startedAt);
  } catch (err) {
    console.warn('[agent] 大模型编排失败，降级规则编排:', err.message);
    const fb = await runFallback(goal, startedAt);
    return { ...fb, status: 'fallback', error: err.message };
  }
}
