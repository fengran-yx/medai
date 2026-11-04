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

    <view v-if="loading && !rows.length" class="empty">加载中…</view>

    <view v-for="row in rows" :key="row.id" class="card record-card" @click="goDetail(row.id)">
      <view class="row">
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
        <text class="link">查看详情 ›</text>
      </view>
    </view>

    <view v-if="!loading && !rows.length" class="empty">没有符合条件的病历</view>
    <view v-if="rows.length && rows.length >= total" class="empty small">已经到底了</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { api, type RecordRow } from '@/api';

const keyword = ref('');
const status = ref('');
const rows = ref<RecordRow[]>([]);
const total = ref(0);
const page = ref(1);
const size = 20;
const loading = ref(false);

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
</style>
