<template>
  <view class="page">
    <view class="search-row">
      <input v-model="keyword" class="search" placeholder="姓名 / 病案号 / 手机号" confirm-type="search" @confirm="search" />
      <view class="search-btn" @click="search">查询</view>
    </view>

    <view class="row head-row">
      <text class="head-title">患者主索引</text>
      <view class="spacer" />
      <view v-if="canManage" class="add-btn" @click="addPatient">+ 新增患者</view>
    </view>

    <view v-if="loading && !rows.length" class="empty">加载中…</view>

    <view v-for="row in rows" :key="row.id" class="card patient-card" @click="goDetail(row.id)">
      <view class="row">
        <view class="avatar">{{ row.name.slice(-2) }}</view>
        <view class="grow">
          <view class="row">
            <text class="patient-name">{{ row.name }}</text>
            <text class="meta-inline">{{ row.gender }}<text v-if="row.age !== null && row.age !== undefined"> · {{ row.age }}岁</text></text>
          </view>
          <text class="mrn">{{ row.mrn }}</text>
          <text class="meta">{{ row.phone || '未登记手机号' }} · {{ row.visit_count || 0 }} 次就诊</text>
        </view>
        <text class="link">详情 ›</text>
      </view>
      <view v-if="row.allergy" class="allergy">过敏：{{ row.allergy }}</view>
      <view class="foot">
        <text class="muted">最近就诊 {{ fmt(row.last_visit_at) }}</text>
      </view>
    </view>

    <view v-if="!loading && !rows.length" class="empty">没有找到患者</view>
    <view v-if="rows.length && rows.length >= total" class="empty small">已经到底了</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { api, type PatientRow } from '@/api';
import { canQC } from '@/stores/auth';

const canManage = canQC;
const keyword = ref('');
const rows = ref<PatientRow[]>([]);
const total = ref(0);
const page = ref(1);
const size = 20;
const loading = ref(false);

const fmt = (s?: string | null) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');

async function load(reset = false) {
  if (loading.value) return;
  if (reset) {
    page.value = 1;
    rows.value = [];
  }
  loading.value = true;
  try {
    const data = await api.patients({ page: page.value, size, keyword: keyword.value });
    rows.value = reset || page.value === 1 ? data.list : rows.value.concat(data.list);
    total.value = data.total;
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

function search() {
  load(true);
}

function addPatient() {
  uni.navigateTo({ url: '/pages/patient-edit/index' });
}

function goDetail(id: number) {
  uni.navigateTo({ url: `/pages/patient-detail/index?id=${id}` });
}

onShow(() => load(true));
onPullDownRefresh(() => load(true));
onReachBottom(() => {
  if (rows.value.length < total.value && !loading.value) {
    page.value += 1;
    load();
  }
});
</script>

<style scoped>
.search-row { display: flex; align-items: center; margin-bottom: 18rpx; }
.search { flex: 1; height: 82rpx; background: #fff; border-radius: 16rpx; padding: 0 22rpx; font-size: 26rpx; box-shadow: 0 4rpx 18rpx rgba(15,23,42,.04); }
.search-btn { margin-left: 14rpx; height: 82rpx; line-height: 82rpx; padding: 0 28rpx; border-radius: 16rpx; background: #0f8b7f; color: #fff; font-size: 26rpx; }
.head-row { margin-bottom: 16rpx; padding: 0 4rpx; }
.head-title { font-size: 32rpx; font-weight: 800; }
.add-btn { color: #0f8b7f; font-size: 25rpx; font-weight: 600; border: 1rpx solid #b9ded7; border-radius: 999rpx; padding: 10rpx 22rpx; }
.patient-card { padding: 24rpx; }
.avatar { width: 82rpx; height: 82rpx; border-radius: 26rpx; background: linear-gradient(135deg,#2ec4b0,#0b5c56); color: #fff; font-size: 26rpx; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-right: 18rpx; }
.grow { flex: 1; min-width: 0; }
.patient-name { font-size: 30rpx; font-weight: 700; }
.meta-inline { margin-left: 12rpx; color: #64748b; font-size: 22rpx; }
.mrn { display: block; margin-top: 4rpx; color: #94a3b8; font-size: 22rpx; }
.meta { display: block; margin-top: 6rpx; color: #64748b; font-size: 22rpx; }
.link { color: #0f8b7f; font-size: 24rpx; font-weight: 600; }
.allergy { margin-top: 14rpx; padding: 10rpx 14rpx; background: #fdeeec; color: #b02a2f; border-radius: 10rpx; font-size: 22rpx; }
.foot { margin-top: 14rpx; padding-top: 12rpx; border-top: 1rpx solid #eef2f5; }
.small { padding: 30rpx 0; font-size: 22rpx; }
</style>
