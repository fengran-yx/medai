<template>
  <view class="page">
    <view class="search-row">
      <input
        v-model="keyword"
        class="search"
        placeholder="患者姓名 / 病案号 / 诊断"
        confirm-type="search"
        @confirm="search"
      />
      <view class="search-btn" @click="search">查询</view>
    </view>

    <scroll-view scroll-x class="chips" :show-scrollbar="false">
      <view v-for="item in statusOptions" :key="item.value" class="chip" :class="{ active: status === item.value }" @click="setStatus(item.value)">
        {{ item.label }}
      </view>
    </scroll-view>

    <view class="row batch-row">
      <view class="batch-toggle" :class="{ active: selectMode }" @click="toggleSelectMode">
        {{ selectMode ? '退出批量' : '批量质控' }}
      </view>
      <view v-if="selectMode" class="select-all" @click="selectAll">{{ allSelected ? '取消全选' : '全选本页' }}</view>
      <view class="spacer" />
      <text v-if="selectMode" class="selected-text">已选 {{ selected.length }} 份</text>
    </view>

    <view v-if="loading && !rows.length" class="empty">加载中…</view>

    <view v-for="row in rows" :key="row.id" class="card record-card" :class="{ selecting: selectMode }" @click="onCard(row.id)">
      <view class="row">
        <view v-if="selectMode" class="check" :class="{ on: selected.includes(row.id) }" @click.stop="toggle(row.id)">✓</view>
        <view class="grow">
          <view class="row">
            <text class="patient">{{ row.patient_name }}</text>
            <text class="meta-inline">{{ row.gender }} · {{ row.mrn }}</text>
          </view>
          <text class="meta">{{ row.dept_name || '-' }} · {{ row.doctor_name || '-' }} · {{ fmt(row.updated_at) }}</text>
          <text class="diagnosis">{{ row.diagnosis || '未填写诊断' }}</text>
        </view>
        <view class="score-box" :class="`level-${displayLevel(row).toLowerCase()}`">
          <text v-if="row.qc_score !== null && row.qc_score !== undefined" class="score-num">{{ displayScore(row) }}</text>
          <text v-else class="score-none">未质控</text>
          <text v-if="row.qc_score !== null && row.qc_score !== undefined" class="score-level">{{ displayLevel(row) }} 级</text>
        </view>
      </view>

      <view class="row record-foot">
        <text class="tag" :class="statusTagClass(row.status)">{{ statusText(row.status) }}</text>
        <text v-if="row.qc_review_status === 'pending'" class="tag tag-amber">待复核</text>
        <text v-if="row.open_task_id" class="tag tag-red">整改中</text>
        <view class="spacer" />
        <text class="link">{{ selectMode ? '点选' : '查看详情 ›' }}</text>
      </view>
    </view>

    <view v-if="!loading && !rows.length" class="empty">没有符合条件的病历</view>
    <view v-if="rows.length && rows.length >= total" class="empty small">已经到底了</view>

    <view v-if="selectMode && selected.length" class="batch-bar">
      <view class="batch-info">
        <text class="batch-count">{{ selected.length }}</text>
        <text class="batch-label">份病历待质控</text>
      </view>
      <button class="btn-primary batch-btn" :loading="batching" @click="runBatch">开始批量质控</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { api, type RecordRow } from '@/api';

const keyword = ref('');
const status = ref('');
const rows = ref<RecordRow[]>([]);
const total = ref(0);
const page = ref(1);
const size = 20;
const loading = ref(false);
const selectMode = ref(false);
const selected = ref<number[]>([]);
const batching = ref(false);

const allSelected = computed(() => rows.value.length > 0 && rows.value.every((r) => selected.value.includes(r.id)));

const statusOptions = [
  { label: '全部', value: '' },
  { label: '质控不通过', value: 'qc_failed' },
  { label: '质控通过', value: 'qc_passed' },
  { label: '已提交', value: 'submitted' },
  { label: '草稿', value: 'draft' },
];

const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const displayScore = (row: RecordRow) => row.qc_final_score ?? row.qc_score;
const displayLevel = (row: RecordRow) => {
  const n = Number(displayScore(row));
  return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 60 ? 'C' : 'D';
};
const statusText = (s: string) => ({ draft: '草稿', submitted: '已提交', qc_passed: '质控通过', qc_failed: '质控不通过' } as Record<string, string>)[s] || s;
const statusTagClass = (s: string) => ({ draft: 'tag-gray', submitted: 'tag-amber', qc_passed: 'tag-green', qc_failed: 'tag-red' } as Record<string, string>)[s] || 'tag-gray';

async function load(reset = false) {
  if (loading.value) return;
  if (reset) {
    page.value = 1;
    rows.value = [];
  }
  loading.value = true;
  try {
    const data = await api.records({ page: page.value, size, keyword: keyword.value, status: status.value });
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

function setStatus(value: string) {
  status.value = value;
  load(true);
}

function goDetail(id: number) {
  uni.navigateTo({ url: `/pages/record-detail/index?id=${id}` });
}

function toggleSelectMode() {
  selectMode.value = !selectMode.value;
  if (!selectMode.value) selected.value = [];
}

function toggle(id: number) {
  const i = selected.value.indexOf(id);
  if (i >= 0) selected.value.splice(i, 1);
  else selected.value.push(id);
}

function selectAll() {
  if (allSelected.value) {
    selected.value = [];
  } else {
    selected.value = rows.value.map((r) => r.id);
  }
}

function onCard(id: number) {
  if (selectMode.value) toggle(id);
  else goDetail(id);
}

async function runBatch() {
  if (!selected.value.length) {
    uni.showToast({ title: '请先选择病历', icon: 'none' });
    return;
  }
  if (selected.value.length > 20) {
    uni.showToast({ title: '单次最多 20 份', icon: 'none' });
    return;
  }
  batching.value = true;
  uni.showLoading({ title: '创建批量任务…', mask: true });
  try {
    const data = await api.createBatch(selected.value);
    uni.hideLoading();
    if (data.skipped?.length) {
      uni.showToast({ title: `${data.skipped.length} 份已在队列中，已跳过`, icon: 'none' });
    }
    selected.value = [];
    selectMode.value = false;
    uni.navigateTo({ url: `/pages/batch/index?id=${data.batchId}` });
  } catch (e: any) {
    uni.hideLoading();
    uni.showModal({ title: '批量质控失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    batching.value = false;
  }
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
.search-row {
  display: flex;
  align-items: center;
  margin-bottom: 18rpx;
}

.search {
  flex: 1;
  height: 82rpx;
  background: #ffffff;
  border-radius: 16rpx;
  padding: 0 22rpx;
  font-size: 26rpx;
  box-shadow: 0 4rpx 18rpx rgba(15, 23, 42, 0.04);
}

.search-btn {
  margin-left: 14rpx;
  height: 82rpx;
  line-height: 82rpx;
  padding: 0 28rpx;
  border-radius: 16rpx;
  background: #0f8b7f;
  color: #ffffff;
  font-size: 26rpx;
}

.chips {
  white-space: nowrap;
  margin-bottom: 18rpx;
}

.chip {
  display: inline-block;
  padding: 12rpx 24rpx;
  margin-right: 12rpx;
  border-radius: 999rpx;
  background: #ffffff;
  color: #64748b;
  font-size: 24rpx;
}

.chip.active {
  background: #0b5c56;
  color: #ffffff;
  font-weight: 600;
}

.record-card {
  padding: 24rpx;
}

.grow { flex: 1; min-width: 0; }

.patient {
  font-size: 30rpx;
  font-weight: 700;
}

.meta-inline {
  margin-left: 12rpx;
  color: #94a3b8;
  font-size: 22rpx;
}

.meta {
  display: block;
  margin-top: 6rpx;
  color: #64748b;
  font-size: 22rpx;
}

.diagnosis {
  display: block;
  margin-top: 8rpx;
  color: #334155;
  font-size: 24rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-box {
  width: 110rpx;
  text-align: right;
}

.score-num {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  line-height: 1;
}

.score-none {
  display: block;
  color: #94a3b8;
  font-size: 22rpx;
}

.score-level {
  display: block;
  margin-top: 6rpx;
  color: #64748b;
  font-size: 20rpx;
}

.level-a .score-num { color: #12a150; }
.level-b .score-num { color: #0f8b7f; }
.level-c .score-num { color: #f5a524; }
.level-d .score-num { color: #e5484d; }

.record-foot {
  margin-top: 18rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #eef2f5;
}

.record-foot .tag {
  margin-right: 10rpx;
}

.link {
  color: #0f8b7f;
  font-size: 24rpx;
  font-weight: 600;
}

.small {
  padding: 30rpx 0;
  font-size: 22rpx;
}

.batch-row {
  margin: 0 2rpx 16rpx;
  align-items: center;
}

.batch-toggle {
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  border: 1rpx solid #b9ded7;
  color: #0b5c56;
  font-size: 23rpx;
  font-weight: 600;
}

.batch-toggle.active {
  background: #0b5c56;
  color: #fff;
  border-color: #0b5c56;
}

.select-all {
  margin-left: 14rpx;
  color: #0f8b7f;
  font-size: 22rpx;
}

.selected-text {
  color: #64748b;
  font-size: 22rpx;
}

.record-card.selecting {
  padding-left: 20rpx;
}

.check {
  width: 44rpx;
  height: 44rpx;
  line-height: 44rpx;
  text-align: center;
  border-radius: 50%;
  border: 2rpx solid #cbd5e1;
  color: transparent;
  font-size: 24rpx;
  margin-right: 14rpx;
  flex: none;
}

.check.on {
  background: #0f8b7f;
  border-color: #0f8b7f;
  color: #fff;
}

.batch-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #ffffff;
  display: flex;
  align-items: center;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -8rpx 30rpx rgba(15, 23, 42, 0.1);
  z-index: 20;
}

.batch-info {
  flex: 1;
}

.batch-count {
  font-size: 40rpx;
  font-weight: 800;
  color: #0b5c56;
}

.batch-label {
  margin-left: 8rpx;
  color: #64748b;
  font-size: 22rpx;
}

.batch-btn {
  width: 300rpx;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 26rpx;
  margin: 0;
}
</style>
