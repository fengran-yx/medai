<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">质控驾驶舱</h1>
        <p class="page-sub">全院病历质量总览 · 数据每小时自动刷新</p>
      </div>
      <el-button :icon="Refresh" circle @click="load" />
    </div>

    <div class="stat-grid">
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
      <div class="stat">
        <div class="label">AI 辅助诊断（30 天）</div>
        <div class="value">{{ overview.aiDiagnosisCount ?? '-' }}<span class="unit">次</span></div>
        <div class="icon"><el-icon><MagicStick /></el-icon></div>
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
          <el-table-column prop="patient_name" label="患者" width="90" />
          <el-table-column prop="dept_name" label="科室" width="110" show-overflow-tooltip />
          <el-table-column label="评分" width="90">
            <template #default="{ row }">
              <span class="score" :class="String(row.level).toLowerCase()">{{ row.score }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="doctor_name" label="医师" width="90" />
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
import { api } from '@/api';

const router = useRouter();
const overview = ref<Record<string, any>>({});
const recent = ref<any[]>([]);

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
  const [ov, trend, dept, issues, rc] = await Promise.all([
    api.overview(),
    api.trends(7),
    api.deptDistribution(),
    api.issueCategories(),
    api.recentQC(),
  ]);
  overview.value = ov;
  recent.value = rc;

  const trendChart = getChart(trendRef.value);
  trendChart?.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['病历数', '平均质控分'], right: 0, top: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
    grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: trend.map((t) => t.date), axisLine: { lineStyle: { color: '#e2e8f0' } }, axisLabel: { color: '#64748b', fontSize: 11 } },
    yAxis: [
      { type: 'value', name: '份', splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
      { type: 'value', name: '分', min: 50, max: 100, splitLine: { show: false }, axisLabel: { color: '#94a3b8', fontSize: 11 } },
    ],
    series: [
      {
        name: '病历数', type: 'bar', barWidth: 16, data: trend.map((t) => t.records),
        itemStyle: { borderRadius: [5, 5, 0, 0], color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#2ec4b0' }, { offset: 1, color: '#a7e8de' }]) },
      },
      {
        name: '平均质控分', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6,
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
.grid-2:last-child { grid-template-columns: 1fr 1.3fr; margin-bottom: 0; }
.chart { height: 300px; }

@media (max-width: 1200px) {
  .grid-2, .grid-2:last-child { grid-template-columns: 1fr; }
}
</style>
