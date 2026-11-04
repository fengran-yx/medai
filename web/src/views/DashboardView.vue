<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">质控驾驶舱</h1>
        <p class="page-sub">全院病历质量总览 · 数据每小时自动刷新</p>
      </div>
      <el-button :icon="Refresh" circle @click="load" />
    </div>

    <div class="stat-grid dash-stats">
      <div class="stat">
        <div class="label">患者总数</div>
        <div class="value">{{ overview.patientCount ?? '-' }}<span class="unit">人</span></div>
        <div class="icon"><el-icon><User /></el-icon></div>
      </div>
      <div class="stat">
        <div class="label">今日新增病历</div>
        <div class="value">{{ overview.recordToday ?? '-' }}<span class="unit">份</span></div>
        <div class="icon"><el-icon><Document /></el-icon></div>
      </div>
      <div class="stat">
        <div class="label">近 30 天平均质控分</div>
        <div class="value" :class="scoreClass(Number(overview.avgScore))">{{ overview.avgScore ?? '-' }}<span class="unit">分</span></div>
        <div class="icon"><el-icon><TrendCharts /></el-icon></div>
      </div>
      <div class="stat">
        <div class="label">质控通过率（≥80 分）</div>
        <div class="value">{{ overview.passRate ?? '-' }}<span class="unit">%</span></div>
        <div class="icon"><el-icon><CircleCheck /></el-icon></div>
      </div>
      <div class="stat">
        <div class="label">待处理病历</div>
        <div class="value" :style="{ color: Number(overview.pendingCount) > 0 ? '#e5484d' : undefined }">
          {{ overview.pendingCount ?? '-' }}<span class="unit">份</span>
        </div>
        <div class="icon"><el-icon><Warning /></el-icon></div>
      </div>
      <div class="stat clickable" @click="router.push('/workbench')">
        <div class="label">待复核报告</div>
        <div class="value" :style="{ color: Number(overview.pendingReviewCount) > 0 ? '#e5484d' : undefined }">
          {{ overview.pendingReviewCount ?? 0 }}<span class="unit">份</span>
        </div>
        <div class="icon"><el-icon><Stamp /></el-icon></div>
      </div>
      <div class="stat clickable" @click="router.push('/workbench')">
        <div class="label">整改逾期</div>
        <div class="value" :style="{ color: Number(overview.overdueTaskCount) > 0 ? '#e5484d' : undefined }">
          {{ overview.overdueTaskCount ?? 0 }}<span class="unit">项</span>
        </div>
        <div class="icon"><el-icon><Bell /></el-icon></div>
      </div>
      <div class="stat">
        <div class="label">AI 辅助诊断（30 天）</div>
        <div class="value">{{ overview.aiDiagnosisCount ?? '-' }}<span class="unit">次</span></div>
        <div class="icon"><el-icon><MagicStick /></el-icon></div>
      </div>
    </div>

    <div class="loop-grid">
      <div class="card loop-summary">
        <div class="loop-title">
          <h3 class="card-title">质控整改闭环</h3>
          <span class="muted">近 30 天</span>
        </div>
        <div class="loop-stats">
          <div class="ls">
            <span>待整改</span>
            <strong :class="{ danger: rect.pendingCount > 0 }">{{ rect.pendingCount }}<em>份</em></strong>
          </div>
          <div class="ls">
            <span>已完成复评</span>
            <strong>{{ rect.reviewedCount }}<em>份</em></strong>
          </div>
          <div class="ls">
            <span>整改通过率</span>
            <strong>{{ rect.closedRate }}<em>%</em></strong>
          </div>
          <div class="ls">
            <span>平均提升</span>
            <strong :class="rect.avgGain > 0 ? 'ok' : rect.avgGain < 0 ? 'danger' : ''">
              {{ rect.avgGain > 0 ? '+' : '' }}{{ rect.avgGain }}<em>分</em>
            </strong>
          </div>
        </div>
        <div class="loop-bar"><i :style="{ width: `${Math.min(100, Math.max(0, rect.closedRate))}%` }" /></div>
        <p class="loop-tip">
          每次质控都会留档病历版本；医生按建议修改后重新质控，系统自动计算分数提升与字段变化。
          通过率 = 最近两轮复评中最新得分 ≥ 80 的比例。
        </p>
        <div class="loop-steps">
          <span>AI 质控</span><i>→</i><span>医师整改</span><i>→</i><span>重新质控</span><i>→</i><span>通过归档</span>
        </div>
      </div>

      <div class="card pending-card">
        <div class="pending-head">
          <h3 class="card-title">待整改病历</h3>
          <el-button link type="primary" size="small" @click="router.push({ name: 'records', query: { status: 'qc_failed' } })">查看全部</el-button>
        </div>
        <el-table v-if="rect.items.length" :data="rect.items" size="small" height="218" @row-click="(row: any) => router.push(`/records/${row.record_id}`)">
          <el-table-column prop="patient_name" label="患者" width="82" show-overflow-tooltip />
          <el-table-column prop="dept_name" label="科室" min-width="90" show-overflow-tooltip />
          <el-table-column label="评分" width="70">
            <template #default="{ row }">
              <span class="score" :class="String(row.level).toLowerCase()">{{ row.score }}</span>
            </template>
          </el-table-column>
          <el-table-column label="时间" min-width="110">
            <template #default="{ row }">{{ fmt(row.created_at) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无待整改病历" :image-size="60" />
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3 class="card-title">病历量与质控分趋势</h3>
        <div ref="trendRef" class="chart" />
      </div>
      <div class="card">
        <h3 class="card-title">科室病历分布</h3>
        <div ref="deptRef" class="chart" />
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3 class="card-title">高频质控问题</h3>
        <div ref="issueRef" class="chart" />
      </div>
      <div class="card">
        <h3 class="card-title">最近质控动态</h3>
        <el-table :data="recent" size="small" height="300" @row-click="goRecord">
          <el-table-column prop="patient_name" label="患者" width="78" show-overflow-tooltip />
          <el-table-column prop="dept_name" label="科室" min-width="88" show-overflow-tooltip />
          <el-table-column label="评分" width="72">
            <template #default="{ row }">
              <span class="score" :class="String(row.level).toLowerCase()">{{ row.score }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="doctor_name" label="医师" width="76" show-overflow-tooltip />
          <el-table-column label="时间" min-width="130">
            <template #default="{ row }">{{ fmt(row.created_at) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { Refresh } from '@element-plus/icons-vue';
import { api, type Rectification } from '@/api';

const router = useRouter();
const overview = ref<Record<string, any>>({});
const recent = ref<any[]>([]);
const rect = ref<Rectification>({
  pendingCount: 0, reviewedCount: 0, improvedCount: 0, closedCount: 0, closedRate: 0, avgGain: 0, items: [],
});

const trendRef = ref<HTMLElement>();
const deptRef = ref<HTMLElement>();
const issueRef = ref<HTMLElement>();
let charts: echarts.ECharts[] = [];
const chartMap = new Map<HTMLElement, echarts.ECharts>();

const scoreClass = (n: number) => (n >= 90 ? 'a' : n >= 80 ? 'b' : n >= 60 ? 'c' : 'd');
const fmt = (s: string) => (s ? String(s).slice(5, 16) : '-');

/** 复用已有实例，避免刷新时重复 init */
function getChart(el?: HTMLElement) {
  if (!el) return undefined;
  let c = chartMap.get(el);
  if (!c) {
    c = echarts.init(el);
    chartMap.set(el, c);
    charts.push(c);
  }
  return c;
}

async function load() {
  const [ov, trend, dept, issues, rc, loop] = await Promise.all([
    api.overview(),
    api.trends(7),
    api.deptDistribution(),
    api.issueCategories(),
    api.recentQC(),
    api.rectification(),
  ]);
  overview.value = ov;
  recent.value = rc;
  rect.value = loop;

  const trendChart = getChart(trendRef.value);
  trendChart?.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['病历数（份）', '平均质控分（分）'], right: 0, top: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
    grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: trend.map((t) => t.date), axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b', fontSize: 11 } },
    yAxis: [
      { type: 'value', splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
      { type: 'value', min: 50, max: 100, splitLine: { show: false }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
    ],
    series: [
      {
        name: '病历数（份）', type: 'bar', barWidth: 16, data: trend.map((t) => t.records),
        itemStyle: { borderRadius: [5, 5, 0, 0], color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#2ec4b0' }, { offset: 1, color: '#a7e8de' }]) },
      },
      {
        name: '平均质控分（分）', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6,
        data: trend.map((t) => t.avgScore ?? 0),
        lineStyle: { width: 2.5, color: '#0f8b7f' },
        itemStyle: { color: '#0f8b7f' },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(15,139,127,0.18)' }, { offset: 1, color: 'rgba(15,139,127,0)' }]) },
      },
    ],
  });

  const deptChart = getChart(deptRef.value);
  deptChart?.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 20, top: 10, bottom: 4, containLabel: true },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
    yAxis: { type: 'category', data: dept.map((d) => d.name).reverse(), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 12 } },
    series: [{
      type: 'bar', barWidth: 14,
      data: dept.map((d) => d.value).reverse(),
      itemStyle: {
        borderRadius: [0, 6, 6, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#8fe0d3' }, { offset: 1, color: '#0f8b7f' }]),
      },
      label: { show: true, position: 'right', color: '#64748b', fontSize: 11 },
    }],
  });

  const issueChart = getChart(issueRef.value);
  issueChart?.setOption({
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 次（{d}%）' },
    legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'center', itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#475569' } },
    color: ['#0f8b7f', '#2ec4b0', '#68d8c8', '#f5a524', '#e5746a', '#7aa7e0', '#b9a6e8', '#94a3b8'],
    series: [{
      type: 'pie', radius: ['46%', '72%'], center: ['36%', '50%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 6 },
      label: { show: false },
      data: issues.length ? issues : [{ name: '暂无数据', value: 1 }],
    }],
  });
}

function goRecord(row: any) {
  if (row?.record_id) router.push(`/records/${row.record_id}`);
}

const onResize = () => charts.forEach((c) => c.resize());

onMounted(() => {
  load();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  charts.forEach((c) => c.dispose());
  charts = [];
});
</script>

<style scoped>
.grid-2 { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin-bottom: 16px; }
.dash-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.grid-2:last-child { grid-template-columns: 1fr 1.3fr; margin-bottom: 0; }
.chart { height: 300px; }

.loop-grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px; margin-bottom: 16px; }
.stat.clickable { cursor: pointer; transition: transform .15s ease, box-shadow .15s ease; }
.stat.clickable:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(15, 23, 42, .1); }
.loop-title, .pending-head { display: flex; align-items: center; justify-content: space-between; }
.loop-title :deep(.card-title), .pending-head :deep(.card-title) { margin-bottom: 0; }
.loop-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0 14px; }
.ls { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; background: #f7fbfa; border: 1px solid #e6f1ee; border-radius: 9px; }
.ls span { font-size: 11.5px; color: var(--ink-500); }
.ls strong { font-size: 23px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; }
.ls strong em { font-size: 11px; font-weight: 500; font-style: normal; color: var(--ink-500); margin-left: 2px; }
.ls strong.danger { color: var(--danger); }
.ls strong.ok { color: #0b7a52; }
.loop-bar { height: 8px; background: #eef3f2; border-radius: 6px; overflow: hidden; }
.loop-bar i { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, #2ec4b0, #0f8b7f); transition: width .4s ease; }
.loop-tip { margin: 10px 0 0; font-size: 11.5px; line-height: 1.7; color: var(--ink-500); }
.loop-steps { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
.loop-steps span { flex: 1; text-align: center; padding: 7px 4px; border-radius: 7px; background: #eef8f5; color: var(--brand-700); font-size: 11.5px; font-weight: 600; }
.loop-steps i { font-style: normal; color: #94a3b8; font-size: 12px; }
.pending-head { margin-bottom: 10px; }

@media (max-width: 1200px) {
  .grid-2, .grid-2:last-child { grid-template-columns: 1fr; }
  .loop-grid { grid-template-columns: 1fr; }
  .loop-stats { grid-template-columns: repeat(2, 1fr); }
  .dash-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (max-width: 900px) {
  .dash-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
