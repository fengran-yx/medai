<template>
  <div class="report-page" v-loading="loading">
    <div class="toolbar no-print">
      <el-button :icon="ArrowLeft" @click="back">返回病历</el-button>
      <div class="spacer" />
      <span class="muted">浏览器打印时可选择「另存为 PDF」</span>
      <el-button type="primary" :icon="Printer" @click="print">打印 / 导出 PDF</el-button>
    </div>

    <div v-if="record && report" class="paper">
      <header class="paper-head">
        <div class="brand">
          <div class="mark">+</div>
          <div>
            <div class="brand-name">智医质控 MedAI</div>
            <div class="brand-sub">MEDICAL RECORD QUALITY CONTROL REPORT</div>
          </div>
        </div>
        <div class="doc-meta">
          <div>报告编号：QC-{{ record.id }}-{{ report.id }}</div>
          <div>生成时间：{{ fmt(report.created_at) }}</div>
        </div>
      </header>

      <h1 class="doc-title">病历质控报告</h1>

      <section class="patient">
        <div><span>患者姓名</span><strong>{{ record.patient_name }}</strong></div>
        <div><span>病案号</span><strong>{{ record.mrn }}</strong></div>
        <div><span>性别 / 年龄</span><strong>{{ record.gender }} / {{ age }}</strong></div>
        <div><span>就诊科室</span><strong>{{ record.dept_name || '-' }}</strong></div>
        <div><span>经治医师</span><strong>{{ record.doctor_name || '-' }}</strong></div>
        <div><span>就诊类型</span><strong>{{ visitType }}</strong></div>
        <div><span>就诊时间</span><strong>{{ fmt(record.visit_time) }}</strong></div>
        <div><span>病历状态</span><strong>{{ statusText(record.status) }}</strong></div>
      </section>

      <section class="summary">
        <div class="score-box" :class="finalLevel.toLowerCase()">
          <div class="score-num">{{ finalScore }}</div>
          <div class="score-level">{{ finalLevel }} 级</div>
          <div v-if="report.score_delta !== null && report.score_delta !== undefined" class="score-delta">
            AI 初筛较上轮 {{ Number(report.score_delta) > 0 ? '+' : '' }}{{ report.score_delta }} 分
          </div>
        </div>
        <div class="summary-main">
          <div class="summary-title">质控结论</div>
          <p>{{ report.summary }}</p>
          <div class="risk-line">
            风险等级：<strong>{{ riskText }}</strong>
            <span class="dot">·</span>
            问题 {{ issues.length }} 项（严重 {{ severityCount.critical }} / 主要 {{ severityCount.major }} / 一般 {{ severityCount.minor }}）
            <span class="dot">·</span>
            质控引擎：{{ report.model }}
          </div>
          <div class="review-line">
            复核状态：<strong>{{ reviewStatusText }}</strong>
            <span v-if="report.reviewer_name" class="dot">·</span>
            <span v-if="report.reviewer_name">复核人 {{ report.reviewer_name }}（{{ fmt(report.reviewed_at) }}）</span>
            <span v-if="report.review_note" class="dot">·</span>
            <span v-if="report.review_note">意见：{{ report.review_note }}</span>
          </div>
        </div>
      </section>

      <section class="dims">
        <div v-for="d in dims" :key="d.label" class="dim">
          <div class="dim-head"><span>{{ d.label }}</span><strong>{{ d.value }}</strong></div>
          <div class="bar"><i :style="{ width: `${d.value}%`, background: d.color }" /></div>
        </div>
      </section>

      <section class="block">
        <h2>一、质控问题清单</h2>
        <table v-if="issues.length" class="issue-table">
          <thead>
            <tr>
              <th style="width: 42px">序号</th>
              <th style="width: 70px">严重度</th>
              <th style="width: 90px">规则编码</th>
              <th style="width: 150px">问题</th>
              <th>问题描述</th>
              <th style="width: 220px">整改建议</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in issues" :key="i">
              <td class="center">{{ i + 1 }}</td>
              <td class="center"><span class="sev" :class="it.severity">{{ sevText(it.severity) }}</span></td>
              <td class="center mono">{{ it.ruleCode }}</td>
              <td>{{ it.rule }}</td>
              <td>{{ it.message }}</td>
              <td>{{ it.suggestion }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="no-issue">未发现质控问题，病历质量优秀。</p>
      </section>

      <section class="block">
        <h2>二、整改建议</h2>
        <ol v-if="suggestions.length" class="sugs">
          <li v-for="(s, i) in suggestions" :key="i">{{ s }}</li>
        </ol>
        <p v-else class="no-issue">无需整改。</p>
      </section>

      <section class="block">
        <h2>三、质控留痕</h2>
        <div class="trace">
          <div><span>质控轮次</span><strong>第 {{ report.record_version || 1 }} 轮</strong></div>
          <div><span>质控时间</span><strong>{{ fmt(report.created_at) }}</strong></div>
          <div><span>本次耗时</span><strong>{{ report.duration_ms ? `${(report.duration_ms / 1000).toFixed(1)} 秒` : '-' }}</strong></div>
          <div><span>质控引擎</span><strong>{{ report.model }}</strong></div>
          <div><span>复核状态</span><strong>{{ reviewStatusText }}</strong></div>
          <div><span>复核人</span><strong>{{ report.reviewer_name || '待复核' }}</strong></div>
          <div><span>复核时间</span><strong>{{ report.reviewed_at ? fmt(report.reviewed_at) : '-' }}</strong></div>
          <div><span>AI 初筛分</span><strong>{{ Number(report.score) }} 分（{{ report.level }} 级）</strong></div>
        </div>
      </section>

      <footer class="paper-foot">
        <div class="sign">
          <div>质控医师签名：<span class="line" /></div>
          <div>科室复核签名：<span class="line" /></div>
          <div>日期：<span class="line" /></div>
        </div>
        <p class="disclaimer">
          {{ reviewFooter }}
          如为演示数据，请勿用于真实诊疗决策。
        </p>
      </footer>
    </div>

    <el-empty v-else-if="!loading" description="该病历尚未运行质控，暂无可导出的报告" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Printer } from '@element-plus/icons-vue';
import { api } from '@/api';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);

const loading = ref(false);
const record = ref<any>(null);
const report = ref<any>(null);
const issues = ref<any[]>([]);
const suggestions = ref<string[]>([]);

const visitType = computed(
  () => (({ outpatient: '门诊', emergency: '急诊', inpatient: '住院' } as Record<string, string>)[record.value?.visit_type] || '-'),
);
const age = computed(() => {
  const birth = record.value?.birth_date;
  if (!birth) return '未知';
  const y = Number(String(birth).slice(0, 4));
  return Number.isFinite(y) ? `${new Date().getFullYear() - y} 岁` : '未知';
});
const riskText = computed(() => ['无', '低', '中', '高'][Number(report.value?.risk) || 0]);
const finalScore = computed(() => {
  const v = report.value?.final_score;
  return v === null || v === undefined ? Number(report.value?.score || 0) : Number(v);
});
const finalLevel = computed(() => {
  const n = finalScore.value;
  return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 60 ? 'C' : 'D';
});
const reviewStatusText = computed(() => (
  ({ pending: '待质控医师复核', confirmed: '已复核确认', overridden: '已人工改判' } as Record<string, string>)[report.value?.review_status || 'confirmed']
  || '已复核'
));
const reviewFooter = computed(() => (
  report.value?.review_status === 'pending'
    ? '本报告由 AI 质控引擎初筛生成，尚未完成质控医师复核，暂不作为最终归档依据。'
    : '本报告由 AI 质控引擎初筛、质控医师复核后形成，仅用于病案质量改进参考。'
));
const severityCount = computed(() => ({
  critical: issues.value.filter((i) => i.severity === 'critical').length,
  major: issues.value.filter((i) => i.severity === 'major').length,
  minor: issues.value.filter((i) => i.severity === 'minor').length,
}));
const dims = computed(() => {
  const r = report.value;
  if (!r) return [];
  return [
    { label: '完整性', value: Number(r.dim_completeness), color: '#0f8b7f' },
    { label: '准确性', value: Number(r.dim_accuracy), color: '#2ec4b0' },
    { label: '逻辑性', value: Number(r.dim_logic), color: '#f5a524' },
    { label: '规范性', value: Number(r.dim_terminology), color: '#7aa7e0' },
  ];
});

const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const statusText = (s: string) => ({ draft: '草稿', submitted: '已提交', qc_passed: '质控通过', qc_failed: '质控不通过' }[s] || s);
const sevText = (s: string) => ({ critical: '严重', major: '主要', minor: '一般' }[s] || s);

async function load() {
  loading.value = true;
  try {
    const data = await api.record(id);
    record.value = data;
    const q = data.latestQC;
    if (q) {
      report.value = q;
      issues.value = typeof q.issues === 'string' ? JSON.parse(q.issues) : q.issues || [];
      suggestions.value = typeof q.suggestions === 'string' ? JSON.parse(q.suggestions) : q.suggestions || [];
    }
  } finally {
    loading.value = false;
  }
}

function print() {
  window.print();
}

function back() {
  router.push(`/records/${id}`);
}

onMounted(load);
</script>

<style scoped>
.report-page { min-height: 100vh; background: #eef2f5; padding: 20px 16px 40px; }
.toolbar { max-width: 900px; margin: 0 auto 14px; display: flex; align-items: center; gap: 12px; }
.toolbar .spacer { flex: 1; }

.paper {
  max-width: 900px; margin: 0 auto; background: #fff; padding: 42px 48px 34px;
  border-radius: 6px; box-shadow: 0 10px 40px rgba(15, 23, 42, .12);
  color: #1f2937; font-size: 12.5px; line-height: 1.7;
}

.paper-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f8b7f; padding-bottom: 14px; }
.brand { display: flex; align-items: center; gap: 10px; }
.mark { width: 34px; height: 34px; border-radius: 8px; background: #0f8b7f; color: #fff; display: grid; place-items: center; font-size: 24px; font-weight: 300; }
.brand-name { font-size: 16px; font-weight: 800; letter-spacing: .5px; color: #0b5c56; }
.brand-sub { font-size: 8.5px; letter-spacing: 1.2px; color: #94a3b8; margin-top: 2px; }
.doc-meta { text-align: right; font-size: 11px; color: #64748b; line-height: 1.8; }

.doc-title { text-align: center; font-size: 22px; letter-spacing: 6px; margin: 26px 0 20px; font-weight: 700; }

.patient { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border: 1px solid #dbe4ea; border-radius: 6px; overflow: hidden; }
.patient > div { display: flex; gap: 6px; padding: 7px 10px; border-right: 1px solid #eef2f5; border-bottom: 1px solid #eef2f5; font-size: 11.5px; }
.patient > div:nth-child(4n) { border-right: none; }
.patient > div:nth-last-child(-n+4) { border-bottom: none; }
.patient span { color: #64748b; flex: none; }
.patient strong { font-weight: 600; }

.summary { display: flex; gap: 20px; margin-top: 18px; align-items: stretch; }
.score-box { width: 130px; flex: none; border: 2px solid #0f8b7f; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px 0; }
.score-box.d { border-color: #e5484d; }
.score-box.c { border-color: #f5a524; }
.score-box.b { border-color: #0f8b7f; }
.score-box.a { border-color: #12a150; }
.score-num { font-size: 42px; font-weight: 800; line-height: 1; }
.score-box.a .score-num { color: #12a150; }
.score-box.b .score-num { color: #0f8b7f; }
.score-box.c .score-num { color: #f5a524; }
.score-box.d .score-num { color: #e5484d; }
.score-level { font-size: 12px; margin-top: 4px; color: #475569; }
.score-delta { font-size: 10.5px; margin-top: 4px; color: #0b7a52; }
.summary-main { flex: 1; background: #f6fbfa; border-radius: 8px; padding: 12px 16px; }
.summary-title { font-size: 12px; font-weight: 700; color: #0b5c56; margin-bottom: 4px; }
.summary-main p { margin: 0 0 6px; line-height: 1.8; }
.risk-line { font-size: 11.5px; color: #475569; }
.review-line { font-size: 11.5px; color: #475569; margin-top: 4px; }
.risk-line strong { color: #0f172a; }
.dot { margin: 0 6px; color: #cbd5e1; }

.dims { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 18px; }
.dim-head { display: flex; justify-content: space-between; font-size: 11.5px; color: #475569; margin-bottom: 5px; }
.bar { height: 6px; background: #eef2f5; border-radius: 4px; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 4px; }

.block { margin-top: 22px; }
.block h2 { font-size: 13px; margin: 0 0 8px; color: #0b5c56; border-left: 3px solid #0f8b7f; padding-left: 8px; }
.issue-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.issue-table th { background: #f1f7f6; color: #334155; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #dbe4ea; }
.issue-table td { padding: 6px 8px; border: 1px solid #e6edf3; vertical-align: top; line-height: 1.6; }
.issue-table tr:nth-child(even) td { background: #fbfdfd; }
.center { text-align: center; }
.mono { font-family: Consolas, monospace; font-size: 10px; }
.sev { display: inline-block; padding: 0 6px; border-radius: 4px; font-size: 10px; line-height: 16px; }
.sev.critical { background: #fdecec; color: #c0353a; }
.sev.major { background: #fff5e6; color: #a86400; }
.sev.minor { background: #eef2f7; color: #475569; }
.no-issue { color: #12a150; margin: 0; }
.sugs { margin: 0; padding-left: 20px; }
.sugs li { margin-bottom: 4px; }

.trace { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border: 1px solid #dbe4ea; border-radius: 6px; overflow: hidden; }
.trace > div { padding: 7px 10px; font-size: 11.5px; border-right: 1px solid #eef2f5; }
.trace > div:last-child { border-right: none; }
.trace span { color: #64748b; margin-right: 6px; }

.paper-foot { margin-top: 26px; border-top: 1px solid #e6edf3; padding-top: 14px; }
.sign { display: flex; gap: 34px; font-size: 11.5px; color: #475569; }
.sign .line { display: inline-block; width: 90px; border-bottom: 1px solid #94a3b8; height: 12px; }
.disclaimer { font-size: 10px; color: #94a3b8; margin-top: 12px; line-height: 1.7; }

@media (max-width: 720px) {
  .report-page { padding: 10px 6px 24px; }
  .paper { padding: 20px 14px; }
  .paper-head { flex-direction: column; gap: 10px; }
  .doc-meta { text-align: left; }
  .doc-title { font-size: 18px; letter-spacing: 3px; margin: 18px 0 14px; }
  .patient { grid-template-columns: repeat(2, 1fr); }
  .patient > div:nth-child(4n) { border-right: 1px solid #eef2f5; }
  .patient > div:nth-child(2n) { border-right: none; }
  .patient > div:nth-last-child(-n+4) { border-bottom: 1px solid #eef2f5; }
  .patient > div:nth-last-child(-n+2) { border-bottom: none; }
  .summary { flex-direction: column; }
  .score-box { width: 100%; padding: 12px 0; }
  .dims { grid-template-columns: repeat(2, 1fr); }
  .issue-table { display: block; overflow-x: auto; }
  .trace { grid-template-columns: repeat(2, 1fr); }
  .trace > div:nth-child(2n) { border-right: none; }
  .sign { flex-direction: column; gap: 10px; }
  .toolbar .muted { display: none; }
}

@media print {
  .no-print { display: none !important; }
  .report-page { background: #fff; padding: 0; }
  .paper { box-shadow: none; border-radius: 0; max-width: none; padding: 0; font-size: 11.5px; }
  @page { size: A4; margin: 14mm 12mm; }
  .block { break-inside: avoid; }
}
</style>
