<template>
  <view class="page">
    <view class="card summary-card">
      <view class="row">
        <view class="grow">
          <text class="title">批量质控</text>
          <text class="muted">任务 #{{ id }} · {{ statusText }}</text>
        </view>
        <text class="percent">{{ batch?.percent || 0 }}%</text>
      </view>
      <view class="bar"><view class="bar-inner" :style="{ width: (batch?.percent || 0) + '%' }"></view></view>
      <view class="stats">
        <view class="stat"><text class="num">{{ batch?.total || 0 }}</text><text class="label">总数</text></view>
        <view class="stat"><text class="num green">{{ batch?.done || 0 }}</text><text class="label">完成</text></view>
        <view class="stat"><text class="num red">{{ batch?.failed || 0 }}</text><text class="label">失败</text></view>
        <view class="stat"><text class="num">{{ batch?.improved || 0 }}</text><text class="label">提分</text></view>
      </view>
      <text v-if="batch?.avg_delta !== null && batch?.avg_delta !== undefined" class="muted avg">平均分差 {{ Number(batch.avg_delta) > 0 ? '+' : '' }}{{ batch.avg_delta }}</text>
    </view>

    <view v-for="item in batch?.items || []" :key="item.id" class="card item-card">
      <view class="row">
        <view class="grow">
          <view class="row">
            <text class="patient">{{ item.patient_name }}</text>
            <text class="mrn">{{ item.mrn }}</text>
          </view>
          <text class="meta">{{ item.dept_name || '-' }}</text>
          <text v-if="item.error" class="error">{{ item.error }}</text>
        </view>
        <view class="right">
          <text v-if="item.status === 'ok'" class="score">{{ item.score }}<text class="level">{{ item.level }}级</text></text>
          <text v-else class="status" :class="item.status">{{ itemStatusText(item.status) }}</text>
        </view>
      </view>
    </view>

    <view v-if="batch && !batch.running" class="bottom">
      <button class="btn-primary" @click="backToList">返回病历列表</button>
    </view>
    <view v-else class="empty small">质控执行中，页面会自动刷新…</view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { api, type BatchStatus } from '@/api';

const id = ref(0);
const batch = ref<BatchStatus | null>(null);
let timer: any = null;

const statusText = computed(() => ({
  queued: '排队中',
  running: '执行中',
  done: '已完成',
  failed: '部分失败',
} as Record<string, string>)[batch.value?.status || 'queued'] || '执行中');

const itemStatusText = (s: string) => ({
  pending: '等待中',
  running: '质控中',
  ok: '完成',
  failed: '失败',
} as Record<string, string>)[s] || s;

async function poll() {
  try {
    batch.value = await api.batchStatus(id.value);
    if (batch.value.running) {
      timer = setTimeout(poll, 1500);
    } else {
      uni.stopPullDownRefresh();
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '查询失败', icon: 'none' });
    timer = setTimeout(poll, 3000);
  }
}

function backToList() {
  uni.switchTab({ url: '/pages/records/index' });
}

onLoad((options: any) => {
  id.value = Number(options?.id || 0);
  if (!id.value) {
    uni.showToast({ title: '缺少批量任务ID', icon: 'none' });
    return;
  }
  poll();
});

onPullDownRefresh(() => {
  if (timer) clearTimeout(timer);
  poll();
});

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});
</script>

<style scoped>
.summary-card { padding: 26rpx; }
.title { display: block; font-size: 34rpx; font-weight: 800; }
.muted { display: block; margin-top: 6rpx; color: #64748b; font-size: 22rpx; }
.percent { font-size: 40rpx; font-weight: 800; color: #0f8b7f; }
.bar { height: 14rpx; border-radius: 8rpx; background: #eef2f5; overflow: hidden; margin: 20rpx 0; }
.bar-inner { height: 100%; background: linear-gradient(90deg,#2ec4b0,#0b5c56); border-radius: 8rpx; transition: width .3s; }
.stats { display: flex; margin-top: 8rpx; }
.stat { flex: 1; text-align: center; }
.num { display: block; font-size: 32rpx; font-weight: 800; }
.num.green { color: #0b7a52; }
.num.red { color: #e5484d; }
.label { display: block; margin-top: 4rpx; color: #94a3b8; font-size: 20rpx; }
.avg { margin-top: 14rpx; }
.item-card { padding: 20rpx 24rpx; }
.grow { flex: 1; min-width: 0; }
.patient { font-size: 28rpx; font-weight: 700; }
.mrn { margin-left: 10rpx; color: #94a3b8; font-size: 21rpx; }
.meta { display: block; margin-top: 4rpx; color: #64748b; font-size: 21rpx; }
.error { display: block; margin-top: 6rpx; color: #c0353a; font-size: 21rpx; }
.right { text-align: right; }
.score { font-size: 34rpx; font-weight: 800; color: #0f8b7f; }
.level { font-size: 20rpx; color: #64748b; margin-left: 4rpx; }
.status { font-size: 22rpx; color: #64748b; }
.status.ok { color: #0b7a52; }
.status.failed { color: #e5484d; }
.status.running { color: #f5a524; }
.bottom { margin-top: 10rpx; }
.bottom button { height: 88rpx; line-height: 88rpx; }
.small { padding: 30rpx 0; font-size: 22rpx; }
</style>
