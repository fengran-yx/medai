<template>
  <view class="page">
    <view class="row head">
      <view>
        <text class="title">质控驾驶舱</text>
        <text class="sub">全院病历质控概览 · 数据实时刷新</text>
      </view>
      <text class="refresh" @click="load">刷新</text>
    </view>

    <view class="stats">
      <view class="stat"><text class="label">患者总数</text><text class="num">{{ overview.patientCount || 0 }}</text></view>
      <view class="stat"><text class="label">今日病历</text><text class="num">{{ overview.recordToday || 0 }}</text></view>
      <view class="stat"><text class="label">30天均分</text><text class="num green">{{ overview.avgScore || 0 }}</text></view>
      <view class="stat"><text class="label">通过率</text><text class="num green">{{ overview.passRate || 0 }}%</text></view>
      <view class="stat"><text class="label">待复核</text><text class="num red">{{ overview.pendingReviewCount || 0 }}</text></view>
      <view class="stat"><text class="label">逾期整改</text><text class="num red">{{ overview.overdueTaskCount || 0 }}</text></view>
    </view>

    <view class="card">
      <view class="row section-head">
        <text class="section-title">近 7 天趋势</text>
        <view class="spacer" />
        <text class="muted">病历量 / 平均分</text>
      </view>
      <view class="trend">
        <view v-for="t in trends" :key="t.date" class="trend-col">
          <text class="trend-score">{{ t.avgScore ?? '-' }}</text>
          <view class="trend-bar-wrap">
            <view class="trend-bar" :style="{ height: barHeight(t.records, maxTrend) }"></view>
          </view>
          <text class="trend-count">{{ t.records }}</text>
          <text class="trend-date">{{ t.date }}</text>
        </view>
      </view>
    </view>

    <view class="card">
      <view class="row section-head">
        <text class="section-title">科室分布</text>
        <view class="spacer" />
        <text class="muted">病历量 / 均分</text>
      </view>
      <view v-for="d in deptDist" :key="d.name" class="bar-row">
        <view class="bar-head"><text class="bar-name">{{ d.name }}</text><text class="bar-value">{{ d.value }} 份 · {{ d.avgScore ?? '-' }} 分</text></view>
        <view class="bar"><view class="bar-inner" :style="{ width: percent(d.value, maxDept) }"></view></view>
      </view>
      <view v-if="!deptDist.length" class="empty small">暂无科室数据</view>
    </view>

    <view class="card">
      <view class="row section-head">
        <text class="section-title">高频问题</text>
        <view class="spacer" />
        <text class="muted">近 200 份报告</text>
      </view>
      <view v-for="(it, i) in issues" :key="it.name" class="bar-row">
        <view class="bar-head"><text class="bar-name">{{ i + 1 }}. {{ it.name }}</text><text class="bar-value">{{ it.value }} 次</text></view>
        <view class="bar"><view class="bar-inner orange" :style="{ width: percent(it.value, maxIssue) }"></view></view>
      </view>
      <view v-if="!issues.length" class="empty small">暂无问题数据</view>
    </view>

    <view class="card">
      <view class="row section-head">
        <text class="section-title">整改闭环</text>
        <view class="spacer" />
        <text class="muted">近 30 天复评</text>
      </view>
      <view class="rect-grid">
        <view class="rect"><text class="rect-num">{{ rectification.pendingCount || 0 }}</text><text class="rect-label">待整改</text></view>
        <view class="rect"><text class="rect-num">{{ rectification.reviewedCount || 0 }}</text><text class="rect-label">已复评</text></view>
        <view class="rect"><text class="rect-num green">{{ rectification.improvedCount || 0 }}</text><text class="rect-label">有提升</text></view>
        <view class="rect"><text class="rect-num green">{{ rectification.closedRate || 0 }}%</text><text class="rect-label">通过率</text></view>
      </view>
      <text class="avg-gain">平均提分 {{ rectification.avgGain || 0 }} 分</text>
    </view>

    <view class="card">
      <view class="row section-head">
        <text class="section-title">最近质控</text>
        <view class="spacer" />
        <text class="link" @click="goRecords">全部病历 ›</text>
      </view>
      <view v-for="r in recent" :key="r.id" class="recent" @click="goRecord(r.record_id)">
        <view class="grow">
          <view class="row"><text class="patient">{{ r.patient_name }}</text><text class="muted inline">{{ r.dept_name || '-' }} · {{ r.doctor_name || '-' }}</text></view>
          <text class="muted">{{ fmt(r.created_at) }}</text>
        </view>
        <text class="recent-score" :class="`level-${String(r.level).toLowerCase()}`">{{ r.score }}<text class="level">{{ r.level }}</text></text>
      </view>
      <view v-if="!recent.length" class="empty small">暂无质控记录</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { api } from '@/api';

const overview = ref<Record<string, number>>({});
const trends = ref<any[]>([]);
const deptDist = ref<any[]>([]);
const issues = ref<any[]>([]);
const recent = ref<any[]>([]);
const rectification = ref<any>({});

const maxTrend = computed(() => Math.max(1, ...trends.value.map((t) => Number(t.records) || 0)));
const maxDept = computed(() => Math.max(1, ...deptDist.value.map((d) => Number(d.value) || 0)));
const maxIssue = computed(() => Math.max(1, ...issues.value.map((d) => Number(d.value) || 0)));

const barHeight = (v: number, max: number) => `${Math.max(6, Math.round((Number(v) || 0) / max * 150))}rpx`;
const percent = (v: number, max: number) => `${Math.max(4, Math.round((Number(v) || 0) / max * 100))}%`;
const fmt = (s?: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');

async function load() {
  try {
    const [ov, tr, dd, ic, rc, rf] = await Promise.all([
      api.overview(),
      api.trends(7),
      api.deptDistribution(),
      api.issueCategories(),
      api.recentQC(),
      api.rectification(),
    ]);
    overview.value = ov;
    trends.value = tr;
    deptDist.value = dd;
    issues.value = ic;
    recent.value = rc;
    rectification.value = rf || {};
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    uni.stopPullDownRefresh();
  }
}

function goRecords() {
  uni.switchTab({ url: '/pages/records/index' });
}
function goRecord(id: number) {
  uni.navigateTo({ url: `/pages/record-detail/index?id=${id}` });
}

onShow(load);
onPullDownRefresh(load);
</script>

<style scoped>
.head { padding: 8rpx 4rpx 20rpx; }
.title { display: block; font-size: 40rpx; font-weight: 800; }
.sub { display: block; margin-top: 6rpx; color: #64748b; font-size: 22rpx; }
.refresh { color: #0f8b7f; font-size: 25rpx; }
.stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16rpx; margin-bottom: 22rpx; }
.stat { background: #fff; border-radius: 18rpx; padding: 20rpx; box-shadow: 0 6rpx 22rpx rgba(15,23,42,.05); }
.label { display: block; color: #64748b; font-size: 22rpx; }
.num { display: block; margin-top: 6rpx; font-size: 40rpx; font-weight: 800; }
.num.green { color: #0b7a52; }
.num.red { color: #e5484d; }
.card { padding: 24rpx; }
.section-head { margin-bottom: 16rpx; }
.section-title { font-size: 28rpx; font-weight: 700; }
.trend { display: flex; align-items: flex-end; height: 230rpx; padding-top: 20rpx; }
.trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.trend-score { font-size: 18rpx; color: #0f8b7f; height: 24rpx; }
.trend-bar-wrap { height: 150rpx; width: 26rpx; display: flex; align-items: flex-end; }
.trend-bar { width: 100%; background: linear-gradient(180deg,#2ec4b0,#0b5c56); border-radius: 6rpx 6rpx 0 0; }
.trend-count { margin-top: 4rpx; font-size: 18rpx; color: #334155; }
.trend-date { font-size: 18rpx; color: #94a3b8; }
.bar-row { margin-bottom: 14rpx; }
.bar-head { display: flex; justify-content: space-between; margin-bottom: 5rpx; }
.bar-name { font-size: 22rpx; color: #334155; flex: 1; }
.bar-value { font-size: 20rpx; color: #94a3b8; margin-left: 10rpx; }
.bar { height: 10rpx; border-radius: 6rpx; background: #eef2f5; overflow: hidden; }
.bar-inner { height: 100%; border-radius: 6rpx; background: linear-gradient(90deg,#2ec4b0,#0f8b7f); }
.bar-inner.orange { background: linear-gradient(90deg,#f7c46c,#f5a524); }
.rect-grid { display: flex; }
.rect { flex: 1; text-align: center; }
.rect-num { display: block; font-size: 34rpx; font-weight: 800; }
.rect-num.green { color: #0b7a52; }
.rect-label { display: block; color: #94a3b8; font-size: 20rpx; margin-top: 2rpx; }
.avg-gain { display: block; margin-top: 14rpx; color: #64748b; font-size: 21rpx; }
.recent { display: flex; align-items: center; padding: 14rpx 0; border-top: 1rpx solid #eef2f5; }
.recent:first-of-type { border-top: none; }
.grow { flex: 1; min-width: 0; }
.patient { font-size: 26rpx; font-weight: 700; }
.muted { color: #94a3b8; font-size: 21rpx; }
.inline { margin-left: 10rpx; }
.recent-score { font-size: 32rpx; font-weight: 800; }
.level { font-size: 18rpx; margin-left: 2rpx; }
.level-a { color: #12a150; }
.level-b { color: #0f8b7f; }
.level-c { color: #f5a524; }
.level-d { color: #e5484d; }
.link { color: #0f8b7f; font-size: 22rpx; }
.small { padding: 24rpx 0; font-size: 22rpx; }
</style>
