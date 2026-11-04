<template>
  <view class="page">
    <view v-if="loading" class="empty">加载中…</view>
    <template v-else>
      <view class="card head-card">
        <text class="title">质控历史与版本</text>
        <text class="muted">{{ record?.patient_name || '' }} · {{ record?.mrn || '' }} · {{ record?.dept_name || '' }}</text>
      </view>

      <view class="card">
        <text class="section-title">质控历史</text>
        <view v-for="item in history" :key="item.id" class="history-item">
          <view class="row">
            <view class="grow">
              <view class="row">
                <text class="score">{{ item.final_score ?? item.score }}</text>
                <text class="level" :class="`level-${String(item.level).toLowerCase()}`">{{ item.level }} 级</text>
                <text v-if="item.score_delta !== null && item.score_delta !== undefined" class="delta" :class="{ up: Number(item.score_delta) > 0 }">
                  {{ Number(item.score_delta) > 0 ? '+' : '' }}{{ item.score_delta }}
                </text>
              </view>
              <text class="meta">版本 V{{ item.record_version || '-' }} · {{ item.model }} · {{ fmt(item.created_at) }}</text>
              <text class="review">{{ reviewText(item.review_status) }}<text v-if="item.reviewer_name"> · {{ item.reviewer_name }}</text></text>
            </view>
            <text class="history-id">#{{ item.id }}</text>
          </view>
          <text v-if="item.review_note" class="note">{{ item.review_note }}</text>
        </view>
        <view v-if="!history.length" class="empty small">暂无质控记录</view>
      </view>

      <view class="card">
        <view class="row">
          <text class="section-title">版本对比</text>
          <view class="spacer" />
          <text class="muted">共 {{ versions.length }} 个版本</text>
        </view>
        <view v-if="versions.length >= 2" class="pickers">
          <view class="picker-col">
            <text class="picker-label">对比版本</text>
            <picker mode="selector" :range="versionLabels" :value="fromIndex" @change="onFrom">
              <view class="picker">{{ versionLabels[fromIndex] }}<text class="arrow">›</text></view>
            </picker>
          </view>
          <text class="vs">vs</text>
          <view class="picker-col">
            <text class="picker-label">当前版本</text>
            <picker mode="selector" :range="versionLabels" :value="toIndex" @change="onTo">
              <view class="picker">{{ versionLabels[toIndex] }}<text class="arrow">›</text></view>
            </picker>
          </view>
        </view>
        <button v-if="versions.length >= 2" class="btn-primary compare-btn" :loading="comparing" @click="compare">开始对比</button>

        <view v-if="compareData" class="compare-result">
          <view class="row compare-head">
            <view class="side">
              <text class="side-label">V{{ compareData.from.version }}</text>
              <text class="side-score">{{ compareData.from.score ?? '-' }}</text>
              <text class="side-level">{{ compareData.from.level || '-' }} 级</text>
            </view>
            <view class="arrow-box">
              <text class="delta-big" :class="{ up: Number(compareData.scoreDelta || 0) > 0 }">
                {{ Number(compareData.scoreDelta || 0) > 0 ? '+' : '' }}{{ compareData.scoreDelta ?? 0 }}
              </text>
              <text class="delta-label">分差</text>
            </view>
            <view class="side">
              <text class="side-label">V{{ compareData.to.version }}</text>
              <text class="side-score">{{ compareData.to.score ?? '-' }}</text>
              <text class="side-level">{{ compareData.to.level || '-' }} 级</text>
            </view>
          </view>
          <text class="change-title">变更字段（{{ compareData.changedFields.length }} 项）</text>
          <view v-for="c in changedChanges" :key="c.field" class="change">
            <text class="change-label">{{ c.label }}</text>
            <view class="change-row">
              <text class="before">{{ c.before || '（空）' }}</text>
              <text class="change-arrow">→</text>
              <text class="after">{{ c.after || '（空）' }}</text>
            </view>
          </view>
          <view v-if="!changedChanges.length" class="empty small">两个版本字段内容一致</view>
        </view>
        <view v-else-if="versions.length < 2" class="empty small">至少需要两个版本才能对比；先修改病历并重新质控。</view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { api, type QCHistoryItem, type RecordDetail, type RecordVersion, type VersionCompare } from '@/api';

const id = ref(0);
const record = ref<RecordDetail | null>(null);
const history = ref<QCHistoryItem[]>([]);
const versions = ref<RecordVersion[]>([]);
const loading = ref(false);
const comparing = ref(false);
const compareData = ref<VersionCompare | null>(null);
const fromIndex = ref(1);
const toIndex = ref(0);

const versionLabels = computed(() => versions.value.map((v) => `V${v.version} · ${v.score ?? '-'}分`));
const changedChanges = computed(() => (compareData.value?.changes || []).filter((c) => c.changed));

const fmt = (s?: string | null) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const reviewText = (s: string) => ({ pending: '待复核', confirmed: '已确认', overridden: '已改判' } as Record<string, string>)[s] || s || '-';

async function load() {
  loading.value = true;
  try {
    const [rec, h, v] = await Promise.all([
      api.record(id.value),
      api.qcHistory(id.value),
      api.versions(id.value),
    ]);
    record.value = rec;
    history.value = h;
    versions.value = v;
    if (v.length >= 2) {
      fromIndex.value = 1;
      toIndex.value = 0;
      await compare();
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function onFrom(e: any) {
  fromIndex.value = Number(e.detail.value);
}
function onTo(e: any) {
  toIndex.value = Number(e.detail.value);
}

async function compare() {
  if (versions.value.length < 2) return;
  const from = versions.value[fromIndex.value];
  const to = versions.value[toIndex.value];
  if (!from || !to) return;
  if (from.version === to.version) {
    uni.showToast({ title: '请选择两个不同版本', icon: 'none' });
    return;
  }
  comparing.value = true;
  try {
    compareData.value = await api.compareVersions(id.value, from.version, to.version);
  } catch (e: any) {
    uni.showToast({ title: e.message || '对比失败', icon: 'none' });
  } finally {
    comparing.value = false;
  }
}

onLoad((options: any) => {
  id.value = Number(options?.id || 0);
  if (!id.value) {
    uni.showToast({ title: '缺少病历ID', icon: 'none' });
    return;
  }
  load();
});
</script>

<style scoped>
.head-card { padding: 24rpx; }
.title { display: block; font-size: 34rpx; font-weight: 800; }
.muted { display: block; margin-top: 6rpx; color: #64748b; font-size: 22rpx; }
.section-title { font-size: 28rpx; font-weight: 700; }
.history-item { padding: 18rpx 0; border-top: 1rpx solid #eef2f5; }
.history-item:first-of-type { border-top: none; }
.grow { flex: 1; min-width: 0; }
.score { font-size: 34rpx; font-weight: 800; }
.level { margin-left: 8rpx; font-size: 21rpx; color: #64748b; }
.level-a { color: #12a150; }
.level-b { color: #0f8b7f; }
.level-c { color: #f5a524; }
.level-d { color: #e5484d; }
.delta { margin-left: 8rpx; font-size: 21rpx; color: #e5484d; }
.delta.up { color: #0b7a52; }
.meta { display: block; margin-top: 4rpx; color: #94a3b8; font-size: 21rpx; }
.review { display: block; margin-top: 4rpx; color: #64748b; font-size: 21rpx; }
.history-id { color: #cbd5e1; font-size: 20rpx; }
.note { display: block; margin-top: 8rpx; padding: 10rpx 14rpx; background: #fff8e8; color: #8a5a00; border-radius: 8rpx; font-size: 21rpx; }
.pickers { display: flex; align-items: flex-end; margin-top: 18rpx; }
.picker-col { flex: 1; }
.picker-label { display: block; color: #64748b; font-size: 21rpx; margin-bottom: 6rpx; }
.picker { height: 72rpx; line-height: 72rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 16rpx; font-size: 24rpx; }
.arrow { float: right; color: #94a3b8; }
.vs { margin: 0 12rpx 24rpx; color: #94a3b8; font-size: 22rpx; }
.compare-btn { margin-top: 18rpx; height: 80rpx; line-height: 80rpx; font-size: 27rpx; }
.compare-result { margin-top: 20rpx; }
.compare-head { background: #f4f7fa; border-radius: 14rpx; padding: 18rpx; }
.side { flex: 1; text-align: center; }
.side-label { display: block; color: #64748b; font-size: 20rpx; }
.side-score { display: block; font-size: 40rpx; font-weight: 800; margin-top: 4rpx; }
.side-level { display: block; color: #94a3b8; font-size: 20rpx; }
.arrow-box { width: 120rpx; text-align: center; }
.delta-big { display: block; font-size: 32rpx; font-weight: 800; color: #e5484d; }
.delta-big.up { color: #0b7a52; }
.delta-label { display: block; color: #94a3b8; font-size: 20rpx; }
.change-title { display: block; margin: 20rpx 0 10rpx; font-size: 24rpx; font-weight: 700; }
.change { padding: 14rpx; background: #fbfdfe; border-radius: 10rpx; margin-bottom: 10rpx; }
.change-label { display: block; font-size: 22rpx; color: #64748b; margin-bottom: 6rpx; }
.change-row { display: flex; }
.before, .after { flex: 1; font-size: 22rpx; line-height: 1.6; word-break: break-all; }
.before { color: #94a3b8; }
.after { color: #0b5c56; }
.change-arrow { margin: 0 10rpx; color: #94a3b8; }
.small { padding: 24rpx 0; font-size: 22rpx; }
</style>
