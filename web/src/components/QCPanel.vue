<template>
  <div v-if="report" class="qc">
    <div class="qc-head">
      <div class="score-ring" :class="String(report.level).toLowerCase()">
        <span class="num">{{ report.score }}</span>
        <span class="lv">{{ report.level }} 级</span>
      </div>
      <div class="head-main">
        <div class="head-top">
          <span class="tag-ai">✦ AI 质控 · {{ modelName }}</span>
          <span class="muted">{{ report.durationMs }} ms</span>
        </div>
        <p class="summary">{{ report.summary }}</p>
        <div class="risk">
          <span class="muted">风险等级：</span>
          <el-tag :type="riskType" size="small" effect="light">{{ riskText }}</el-tag>
          <span class="muted" style="margin-left: 12px">问题 {{ report.issues.length }} 项</span>
        </div>
      </div>
    </div>

    <div class="dims">
      <div v-for="d in dimList" :key="d.key" class="dim">
        <div class="dim-top">
          <span>{{ d.label }}</span>
          <strong :class="scoreClass(d.value)">{{ d.value }}</strong>
        </div>
        <el-progress :percentage="d.value" :stroke-width="7" :show-text="false" :color="barColor(d.value)" />
      </div>
    </div>

    <div v-if="report.issues.length" class="issues">
      <h4>问题清单</h4>
      <div v-for="(it, i) in report.issues" :key="i" class="issue" :class="it.severity">
        <div class="issue-head">
          <el-tag :type="sevType(it.severity)" size="small" effect="dark">{{ sevText(it.severity) }}</el-tag>
          <strong>{{ it.rule }}</strong>
          <code v-if="it.ruleCode">{{ it.ruleCode }}</code>
        </div>
        <p class="issue-msg">{{ it.message }}</p>
        <p class="issue-sug">建议：{{ it.suggestion }}</p>
      </div>
    </div>
    <el-empty v-else description="未发现质控问题，病历质量优秀" :image-size="80" />

    <div v-if="report.suggestions?.length" class="sugs">
      <h4>整改建议</h4>
      <ul>
        <li v-for="(s, i) in report.suggestions" :key="i">{{ s }}</li>
      </ul>
    </div>

    <p class="disclaimer">以上结果由 AI 生成，仅供病案质控参考，最终判定以质控科人工复核为准。</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { QCReport } from '@/api';

const props = defineProps<{ report: QCReport | null }>();

const modelName = computed(() => {
  const m = props.report?.model || '';
  return m.includes('deepseek') ? 'DeepSeek' : '规则引擎';
});

const dimList = computed(() => {
  const d = props.report?.dimensions;
  if (!d) return [];
  return [
    { key: 'completeness', label: '完整性', value: d.completeness },
    { key: 'accuracy', label: '准确性', value: d.accuracy },
    { key: 'logic', label: '逻辑性', value: d.logic },
    { key: 'terminology', label: '规范性', value: d.terminology },
  ];
});

const riskType = computed(() => (['success', 'info', 'warning', 'danger'] as const)[props.report?.risk ?? 0]);
const riskText = computed(() => ['无', '低', '中', '高'][props.report?.risk ?? 0]);
const scoreClass = (n: number) => (n >= 90 ? 'a' : n >= 80 ? 'b' : n >= 60 ? 'c' : 'd');
const barColor = (n: number) => (n >= 90 ? '#12a150' : n >= 80 ? '#0f8b7f' : n >= 60 ? '#f5a524' : '#e5484d');
const sevText = (s: string) => ({ critical: '严重', major: '主要', minor: '一般' }[s] || s);
const sevType = (s: string) => ({ critical: 'danger', major: 'warning', minor: 'info' }[s] || 'info') as any;
</script>

<style scoped>
.qc-head { display: flex; gap: 20px; align-items: center; }

.score-ring {
  width: 96px; height: 96px; border-radius: 50%; flex: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 4px solid currentColor;
  background: linear-gradient(180deg, #fff, #f8fbfa);
}
.score-ring.a { color: #12a150; }
.score-ring.b { color: #0f8b7f; }
.score-ring.c { color: #f5a524; }
.score-ring.d { color: #e5484d; }
.score-ring .num { font-size: 28px; font-weight: 700; line-height: 1; }
.score-ring .lv { font-size: 11px; margin-top: 4px; opacity: 0.8; }

.head-main { flex: 1; min-width: 0; }
.head-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.summary { margin: 0 0 8px; font-size: 13.5px; line-height: 1.7; color: var(--ink-700); }
.risk { display: flex; align-items: center; font-size: 12px; }

.dims { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 24px; margin: 20px 0 6px; }
.dim-top { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--ink-700); margin-bottom: 5px; }

.issues { margin-top: 18px; }
.issues h4, .sugs h4 { font-size: 13.5px; margin: 0 0 10px; color: var(--ink-900); }

.issue {
  border: 1px solid var(--line);
  border-left: 3px solid #cbd5e1;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 9px;
  background: #fcfdfe;
}
.issue.critical { border-left-color: #e5484d; background: #fffafa; }
.issue.major { border-left-color: #f5a524; background: #fffdf8; }
.issue.minor { border-left-color: #94a3b8; }

.issue-head { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.issue-head code { font-size: 11px; color: var(--ink-500); background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }
.issue-msg { margin: 6px 0 3px; font-size: 12.5px; color: var(--ink-700); line-height: 1.6; }
.issue-sug { margin: 0; font-size: 12.5px; color: var(--brand-700); line-height: 1.6; }

.sugs { margin-top: 18px; padding: 12px 14px; background: var(--brand-50); border-radius: 9px; }
.sugs ul { margin: 0; padding-left: 18px; }
.sugs li { font-size: 12.5px; color: var(--ink-700); line-height: 1.8; }

.disclaimer { margin-top: 16px; font-size: 11.5px; color: #94a3b8; }
</style>
