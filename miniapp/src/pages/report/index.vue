<template>
  <view class="page">
    <view v-if="loading" class="empty">加载中…</view>
    <template v-else-if="record">
      <view class="report">
        <view class="report-head">
          <text class="hospital">智医质控 MedAI</text>
          <text class="report-title">病历质控报告</text>
          <text class="report-no">报告编号 QC-{{ record.id }}-{{ latestQC?.id || '-' }}</text>
        </view>

        <view class="patient-info">
          <view class="info-row"><text class="info-label">患者</text><text class="info-value">{{ record.patient_name }}（{{ record.gender }}）</text></view>
          <view class="info-row"><text class="info-label">病案号</text><text class="info-value">{{ record.mrn }}</text></view>
          <view class="info-row"><text class="info-label">科室</text><text class="info-value">{{ record.dept_name || '-' }}</text></view>
          <view class="info-row"><text class="info-label">经治医师</text><text class="info-value">{{ record.doctor_name || '-' }}</text></view>
          <view class="info-row"><text class="info-label">就诊号</text><text class="info-value">{{ record.visit_no }}</text></view>
          <view class="info-row"><text class="info-label">质控时间</text><text class="info-value">{{ fmt(latestQC?.created_at) }}</text></view>
        </view>

        <view v-if="latestQC" class="score-section">
          <view class="score-ring" :class="`level-${displayLevel.toLowerCase()}`">
            <text class="score-num">{{ displayScore }}</text>
            <text class="score-level">{{ displayLevel }} 级</text>
          </view>
          <view class="score-side">
            <text class="score-label">最终质控得分</text>
            <text class="score-summary">{{ latestQC.summary }}</text>
            <text class="review-status">复核状态：{{ reviewText }}</text>
          </view>
        </view>

        <view v-if="latestQC" class="dims">
          <view v-for="d in dims" :key="d.label" class="dim">
            <view class="row"><text class="dim-label">{{ d.label }}</text><text class="dim-value">{{ d.value }}</text></view>
            <view class="bar"><view class="bar-inner" :style="{ width: d.value + '%', background: d.color }"></view></view>
          </view>
        </view>

        <view class="section">
          <text class="section-title">问题清单（{{ issues.length }} 项）</text>
          <view v-for="(it, i) in issues" :key="i" class="issue">
            <view class="row">
              <text class="issue-index">{{ i + 1 }}.</text>
              <text class="issue-rule">{{ it.rule }}</text>
              <text class="tag" :class="sevTagClass(it.severity)">{{ sevText(it.severity) }}</text>
            </view>
            <text class="issue-msg">{{ it.message }}</text>
            <text class="issue-sug">整改建议：{{ it.suggestion }}</text>
          </view>
          <view v-if="!issues.length" class="empty small">未发现质控问题</view>
        </view>

        <view v-if="suggestions.length" class="section">
          <text class="section-title">总体建议</text>
          <text v-for="(s, i) in suggestions" :key="i" class="suggestion">{{ i + 1 }}. {{ s }}</text>
        </view>

        <view class="signature">
          <view class="sign-item">
            <text class="sign-label">质控医师</text>
            <text class="sign-value">{{ latestQC?.reviewer_name || '待复核' }}</text>
          </view>
          <view class="sign-item">
            <text class="sign-label">复核时间</text>
            <text class="sign-value">{{ fmt(latestQC?.reviewed_at) }}</text>
          </view>
        </view>

        <view v-if="latestQC?.review_status === 'overridden' && latestQC?.review_note" class="review-note">
          <text class="review-note-title">复核意见</text>
          <text class="review-note-text">{{ latestQC.review_note }}</text>
        </view>

        <text class="report-foot">本报告由 AI 初筛 + 人工复核形成，仅用于病历质控管理，不替代医师诊疗责任。</text>
      </view>

      <view class="actions">
        <button class="btn-secondary" open-type="share">分享给同事</button>
        <button class="btn-primary" @click="goDetail">查看病历</button>
      </view>
      <text class="tip">小程序暂不支持直接打印；需要 PDF/打印请到 Web 端「质控报告」页面。</text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import { api, type QCIssue, type RecordDetail } from '@/api';

const id = ref(0);
const record = ref<RecordDetail | null>(null);
const loading = ref(false);
const latestQC = computed(() => record.value?.latestQC || null);

const issues = computed<QCIssue[]>(() => {
  const raw = latestQC.value?.issues;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
});
const suggestions = computed<string[]>(() => {
  const raw = latestQC.value?.suggestions;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [raw]; } catch { return [raw]; }
  }
  return [];
});
const dims = computed(() => {
  const q = latestQC.value;
  if (!q) return [];
  return [
    { label: '完整性', value: Number(q.dim_completeness), color: '#0f8b7f' },
    { label: '准确性', value: Number(q.dim_accuracy), color: '#2ec4b0' },
    { label: '逻辑性', value: Number(q.dim_logic), color: '#f5a524' },
    { label: '规范性', value: Number(q.dim_terminology), color: '#7aa7e0' },
  ];
});
const displayScore = computed(() => {
  const q = latestQC.value;
  const final = q?.final_score;
  return final === null || final === undefined ? Number(q?.score || 0) : Number(final);
});
const displayLevel = computed(() => {
  const n = displayScore.value;
  return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 60 ? 'C' : 'D';
});
const reviewText = computed(() => ({
  pending: '待复核',
  confirmed: '已确认',
  overridden: '已改判',
} as Record<string, string>)[latestQC.value?.review_status || 'pending'] || '待复核');

const fmt = (s?: string | null) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const sevText = (s: string) => ({ critical: '严重', major: '主要', minor: '一般' } as Record<string, string>)[s] || s;
const sevTagClass = (s: string) => ({ critical: 'tag-red', major: 'tag-amber', minor: 'tag-gray' } as Record<string, string>)[s] || 'tag-gray';

function goDetail() {
  uni.redirectTo({ url: `/pages/record-detail/index?id=${id.value}` });
}

onLoad(async (options: any) => {
  id.value = Number(options?.id || 0);
  if (!id.value) {
    uni.showToast({ title: '缺少病历ID', icon: 'none' });
    return;
  }
  loading.value = true;
  try {
    record.value = await api.record(id.value);
    uni.setNavigationBarTitle({ title: '质控报告' });
  } catch (e: any) {
    uni.showModal({ title: '加载失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    loading.value = false;
  }
});

onShareAppMessage(() => ({
  title: record.value ? `${record.value.patient_name} · 病历质控报告` : '病历质控报告',
  path: `/pages/report/index?id=${id.value}`,
}));
</script>

<style scoped>
.report { background: #fff; border-radius: 20rpx; padding: 28rpx; box-shadow: 0 8rpx 32rpx rgba(15,23,42,.06); }
.report-head { text-align: center; padding-bottom: 20rpx; border-bottom: 2rpx solid #0b5c56; }
.hospital { display: block; color: #0b5c56; font-size: 22rpx; letter-spacing: 2rpx; }
.report-title { display: block; margin-top: 8rpx; font-size: 38rpx; font-weight: 800; }
.report-no { display: block; margin-top: 6rpx; color: #94a3b8; font-size: 20rpx; }
.patient-info { margin-top: 20rpx; }
.info-row { display: flex; padding: 8rpx 0; font-size: 24rpx; }
.info-label { width: 140rpx; color: #64748b; flex: none; }
.info-value { color: #1e293b; }
.score-section { display: flex; align-items: flex-start; margin-top: 20rpx; padding: 20rpx; background: #f8fbfd; border-radius: 14rpx; }
.score-ring { width: 130rpx; height: 130rpx; border-radius: 50%; border: 6rpx solid currentColor; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-right: 20rpx; flex: none; }
.score-num { font-size: 44rpx; font-weight: 800; line-height: 1; }
.score-level { font-size: 20rpx; margin-top: 4rpx; opacity: .8; }
.level-a { color: #12a150; }
.level-b { color: #0f8b7f; }
.level-c { color: #f5a524; }
.level-d { color: #e5484d; }
.score-side { flex: 1; }
.score-label { display: block; font-size: 22rpx; color: #64748b; }
.score-summary { display: block; margin-top: 6rpx; font-size: 22rpx; line-height: 1.65; color: #334155; }
.review-status { display: block; margin-top: 8rpx; font-size: 21rpx; color: #0b5c56; }
.dims { margin-top: 20rpx; }
.dim { margin-bottom: 12rpx; }
.dim-label { color: #64748b; font-size: 22rpx; flex: 1; }
.dim-value { color: #334155; font-size: 22rpx; font-weight: 700; }
.bar { height: 8rpx; border-radius: 6rpx; background: #eef2f5; overflow: hidden; margin-top: 6rpx; }
.bar-inner { height: 100%; border-radius: 6rpx; }
.section { margin-top: 24rpx; }
.section-title { display: block; font-size: 26rpx; font-weight: 700; padding-bottom: 10rpx; border-bottom: 1rpx solid #eef2f5; }
.issue { padding: 14rpx 0; border-bottom: 1rpx dashed #eef2f5; }
.issue-index { color: #94a3b8; font-size: 22rpx; margin-right: 6rpx; }
.issue-rule { font-size: 24rpx; font-weight: 600; flex: 1; }
.issue-msg { display: block; margin-top: 6rpx; font-size: 22rpx; color: #334155; line-height: 1.65; }
.issue-sug { display: block; margin-top: 4rpx; font-size: 22rpx; color: #0b5c56; line-height: 1.65; }
.suggestion { display: block; margin-top: 8rpx; font-size: 22rpx; color: #334155; line-height: 1.6; }
.signature { display: flex; margin-top: 30rpx; padding-top: 20rpx; border-top: 1rpx solid #eef2f5; }
.sign-item { flex: 1; }
.sign-label { display: block; color: #94a3b8; font-size: 20rpx; }
.sign-value { display: block; margin-top: 6rpx; font-size: 24rpx; color: #1e293b; }
.review-note { margin-top: 18rpx; padding: 14rpx; background: #fff8e8; border-radius: 10rpx; }
.review-note-title { display: block; color: #8a5a00; font-size: 21rpx; font-weight: 700; }
.review-note-text { display: block; margin-top: 4rpx; color: #8a5a00; font-size: 22rpx; line-height: 1.6; }
.report-foot { display: block; margin-top: 24rpx; padding-top: 16rpx; border-top: 1rpx solid #eef2f5; color: #94a3b8; font-size: 19rpx; line-height: 1.6; }
.actions { display: flex; margin-top: 20rpx; }
.actions button { flex: 1; height: 84rpx; line-height: 84rpx; margin-right: 14rpx; font-size: 27rpx; }
.actions button:last-child { margin-right: 0; }
.btn-secondary { background: #fff; color: #0b5c56; border: 1rpx solid #b9ded7; border-radius: 16rpx; }
.btn-secondary::after { border: none; }
.tip { display: block; margin-top: 16rpx; color: #94a3b8; font-size: 20rpx; line-height: 1.6; }
.small { padding: 24rpx 0; font-size: 22rpx; }
</style>
