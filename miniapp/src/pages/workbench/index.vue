<template>
  <view class="page">
    <view class="hello">
      <view>
        <text class="hello-title">{{ greeting }}{{ authState.user?.name || '' }}</text>
        <text class="hello-sub">{{ roleText }} · {{ authState.user?.deptName || '未绑定科室' }}</text>
      </view>
      <view class="refresh" @click="load">刷新</view>
    </view>

    <view class="stat-grid">
      <view v-if="canQC" class="stat">
        <text class="stat-label">待复核</text>
        <text class="stat-value red">{{ overview.pendingReviewCount || 0 }}<text class="stat-unit">份</text></text>
      </view>
      <view class="stat">
        <text class="stat-label">待整改</text>
        <text class="stat-value red">{{ taskSummary.pending }}<text class="stat-unit">项</text></text>
      </view>
      <view class="stat">
        <text class="stat-label">已逾期</text>
        <text class="stat-value">{{ taskSummary.overdue }}<text class="stat-unit">项</text></text>
      </view>
      <view class="stat">
        <text class="stat-label">整改通过</text>
        <text class="stat-value green">{{ taskSummary.passed }}<text class="stat-unit">项</text></text>
      </view>
    </view>

    <view class="tabs">
      <view v-if="canQC" class="tab" :class="{ active: tab === 'review' }" @click="tab = 'review'">
        待复核<text v-if="reviewTotal" class="tab-badge">{{ reviewTotal }}</text>
      </view>
      <view class="tab" :class="{ active: tab === 'tasks' }" @click="tab = 'tasks'">
        整改任务<text v-if="taskSummary.overdue" class="tab-badge">{{ taskSummary.overdue }}</text>
      </view>
    </view>

    <view v-if="loading" class="empty">加载中…</view>

    <template v-else>
      <view v-if="tab === 'review' && canQC">
        <view v-for="item in reviews" :key="item.id" class="card review-card" @click="goRecord(item.record_id, true)">
          <view class="row">
            <view class="grow">
              <view class="row">
                <text class="patient">{{ item.patient_name }}</text>
                <text class="mrn">{{ item.mrn }}</text>
              </view>
              <text class="meta">{{ item.dept_name || '-' }} · {{ item.doctor_name || '-' }} · {{ fmt(item.created_at) }}</text>
            </view>
            <view class="score-box" :class="levelClass(item.level)">
              <text class="score-num">{{ item.score }}</text>
              <text class="score-level">{{ item.level }} 级</text>
            </view>
          </view>
          <view class="row review-foot">
            <text class="tag tag-amber">待复核</text>
            <text class="muted">问题 {{ item.issueCount }} 项</text>
            <view class="spacer" />
            <text class="link">去复核 ›</text>
          </view>
        </view>
        <view v-if="!reviews.length" class="empty">暂无待复核报告</view>
      </view>

      <view v-if="tab === 'tasks'">
        <view v-for="item in tasks" :key="item.id" class="card task-card" @click="goRecord(item.record_id)">
          <view class="row">
            <view class="grow">
              <view class="row">
                <text class="patient">{{ item.patient_name }}</text>
                <text class="mrn">{{ item.mrn }}</text>
              </view>
              <text class="meta">{{ item.dept_name || '-' }} · {{ item.doctor_name || '-' }}</text>
              <text class="diagnosis">{{ item.diagnosis || '未填写诊断' }}</text>
            </view>
            <text class="tag" :class="taskTagClass(item)">{{ taskText(item) }}</text>
          </view>
          <view class="row review-foot">
            <text class="muted">截止 {{ fmt(item.due_at) }}</text>
            <text v-if="item.overdue === 1" class="overdue">已逾期</text>
            <view class="spacer" />
            <text class="link">查看病历 ›</text>
          </view>
        </view>
        <view v-if="!tasks.length" class="empty">暂无整改任务</view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { api, type ReviewItem, type TaskItem } from '@/api';
import { authState, canQC, roleText } from '@/stores/auth';

const tab = ref<'review' | 'tasks'>('review');
const loading = ref(false);
const overview = ref<Record<string, number>>({});
const reviews = ref<ReviewItem[]>([]);
const reviewTotal = ref(0);
const tasks = ref<TaskItem[]>([]);
const taskSummary = ref({ pending: 0, overdue: 0, passed: 0 });

const greeting = computed(() => (new Date().getHours() < 12 ? '上午好，' : new Date().getHours() < 18 ? '下午好，' : '晚上好，'));

const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const levelClass = (level: string) => `level-${String(level || 'c').toLowerCase()}`;
const taskText = (row: TaskItem) => {
  if (row.overdue === 1 && ['open', 'submitted'].includes(row.status)) return '已逾期';
  return ({ open: '待整改', submitted: '已提交', passed: '已通过', closed: '已关闭' } as Record<string, string>)[row.status] || row.status;
};
const taskTagClass = (row: TaskItem) => {
  if (row.overdue === 1 && ['open', 'submitted'].includes(row.status)) return 'tag-red';
  return ({ open: 'tag-amber', submitted: 'tag-gray', passed: 'tag-green', closed: 'tag-gray' } as Record<string, string>)[row.status] || 'tag-gray';
};

async function load() {
  loading.value = true;
  try {
    const [ov, taskData] = await Promise.all([
      api.overview(),
      api.tasks({ page: 1, size: 20 }),
    ]);
    overview.value = ov;
    tasks.value = taskData.list;
    taskSummary.value = taskData.summary;

    if (canQC.value) {
      const reviewData = await api.reviews({ page: 1, size: 20 });
      reviews.value = reviewData.list;
      reviewTotal.value = reviewData.total;
      if (!reviews.value.length && tasks.value.length) tab.value = 'tasks';
    } else {
      tab.value = 'tasks';
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

function goRecord(id: number, review = false) {
  uni.navigateTo({ url: `/pages/record-detail/index?id=${id}${review ? '&review=1' : ''}` });
}

onShow(load);
onPullDownRefresh(load);
</script>

<style scoped>
.hello {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 8rpx 4rpx 24rpx;
}

.hello-title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  letter-spacing: -1rpx;
}

.hello-sub {
  display: block;
  margin-top: 8rpx;
  color: #64748b;
  font-size: 24rpx;
}

.refresh {
  color: #0f8b7f;
  font-size: 26rpx;
  padding: 8rpx 0 8rpx 20rpx;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18rpx;
  margin-bottom: 24rpx;
}

.stat {
  background: #ffffff;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 6rpx 24rpx rgba(15, 23, 42, 0.05);
}

.stat-label {
  display: block;
  color: #64748b;
  font-size: 24rpx;
}

.stat-value {
  display: block;
  margin-top: 8rpx;
  font-size: 44rpx;
  font-weight: 800;
}

.stat-value.red { color: #e5484d; }
.stat-value.green { color: #0b7a52; }
.stat-unit { font-size: 22rpx; font-weight: 400; color: #94a3b8; margin-left: 4rpx; }

.tabs {
  display: flex;
  background: #e9eff4;
  border-radius: 16rpx;
  padding: 6rpx;
  margin-bottom: 20rpx;
}

.tab {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 12rpx;
  color: #64748b;
  font-size: 26rpx;
}

.tab.active {
  background: #ffffff;
  color: #0b5c56;
  font-weight: 700;
  box-shadow: 0 4rpx 14rpx rgba(15, 23, 42, 0.08);
}

.tab-badge {
  display: inline-block;
  min-width: 30rpx;
  height: 30rpx;
  line-height: 30rpx;
  padding: 0 8rpx;
  margin-left: 6rpx;
  border-radius: 999rpx;
  background: #e5484d;
  color: #ffffff;
  font-size: 18rpx;
  text-align: center;
}

.review-card, .task-card {
  padding: 24rpx;
}

.grow { flex: 1; min-width: 0; }

.patient {
  font-size: 30rpx;
  font-weight: 700;
}

.mrn {
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

.review-foot {
  margin-top: 18rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #eef2f5;
}

.review-foot .muted {
  margin-right: 14rpx;
}

.overdue {
  color: #e5484d;
  font-size: 22rpx;
  font-weight: 600;
}

.link {
  color: #0f8b7f;
  font-size: 24rpx;
  font-weight: 600;
}
</style>
