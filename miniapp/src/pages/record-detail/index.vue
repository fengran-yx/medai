<template>
  <view class="page">
    <view v-if="loading" class="empty">加载中…</view>
    <template v-else-if="record">
      <view class="card patient-card">
        <view class="row">
          <view class="grow">
            <view class="row">
              <text class="patient-name">{{ record.patient_name }}</text>
              <text class="patient-meta">{{ record.gender }} · {{ record.mrn }}</text>
            </view>
            <text class="muted">{{ record.dept_name || '-' }} · {{ record.doctor_name || '-' }} · {{ fmt(record.visit_time) }}</text>
          </view>
          <text class="tag" :class="statusTagClass(record.status)">{{ statusText(record.status) }}</text>
        </view>
        <view class="row patient-foot">
          <text class="muted">就诊号 {{ record.visit_no }}</text>
          <text class="muted">质控 {{ record.versionCount || 0 }} 轮</text>
          <text v-if="record.allergy" class="allergy">过敏：{{ record.allergy }}</text>
        </view>
      </view>

      <view v-if="record.openTask" class="card task-banner" :class="{ overdue: taskOverdue }">
        <view class="row">
          <text class="task-icon">!</text>
          <view class="grow">
            <text class="task-title">整改任务 · {{ taskText(record.openTask.status) }}</text>
            <text class="task-due">截止 {{ fmt(record.openTask.due_at) }}<text v-if="taskOverdue"> · 已逾期</text></text>
          </view>
          <text v-if="canQC" class="task-close" @click="closeTask">关闭</text>
        </view>
      </view>

      <view class="card report-card">
        <view class="row report-head">
          <text class="section-title">AI 质控报告</text>
          <view class="spacer" />
          <text v-if="latestQC" class="tag" :class="reviewTagClass">{{ reviewText }}</text>
        </view>

        <template v-if="latestQC">
          <view class="row report-main">
            <view class="score-ring" :class="`level-${displayLevel.toLowerCase()}`">
              <text class="score-num">{{ displayScore }}</text>
              <text class="score-level">{{ displayLevel }} 级</text>
            </view>
            <view class="grow report-summary">
              <text class="summary-text">{{ latestQC.summary }}</text>
              <text class="muted">模型 {{ latestQC.model }} · {{ latestQC.duration_ms || '-' }} ms</text>
            </view>
          </view>

          <view class="dims">
            <view v-for="d in dims" :key="d.label" class="dim">
              <view class="row dim-top">
                <text class="muted">{{ d.label }}</text>
                <text class="dim-value">{{ d.value }}</text>
              </view>
              <view class="bar"><view class="bar-inner" :style="{ width: d.value + '%', background: d.color }"></view></view>
            </view>
          </view>

          <view v-if="latestQC.review_status === 'overridden'" class="final-note">
            最终结论：{{ displayScore }} 分（{{ displayLevel }} 级）
            <text v-if="latestQC.reviewer_name"> · 复核人 {{ latestQC.reviewer_name }}</text>
            <text v-if="latestQC.review_note"> · {{ latestQC.review_note }}</text>
          </view>

          <view class="issues">
            <text class="issue-title">问题清单（{{ issues.length }} 项）</text>
            <view v-for="(it, i) in issues" :key="i" class="issue" :class="it.severity">
              <view class="row">
                <text class="tag" :class="sevTagClass(it.severity)">{{ sevText(it.severity) }}</text>
                <text class="issue-rule">{{ it.rule }}</text>
                <text class="issue-code">{{ it.ruleCode }}</text>
              </view>
              <text class="issue-msg">{{ it.message }}</text>
              <text class="issue-sug">建议：{{ it.suggestion }}</text>
            </view>
            <view v-if="!issues.length" class="empty small">未发现质控问题</view>
          </view>
        </template>
        <view v-else class="empty">
          尚未运行质控
          <button class="btn-primary qc-btn" @click="runQC">立即质控</button>
        </view>
      </view>

      <view v-if="canQC && latestQC" class="card review-card">
        <text class="section-title">人工复核 / 终审</text>
        <text class="muted review-tip">AI 只作初筛；确认或改判后形成最终分，并同步病历状态与整改任务。</text>
        <view class="row score-input-row">
          <text class="input-label">最终得分</text>
          <input v-model="reviewForm.score" class="score-input" type="digit" placeholder="0-100" />
          <text class="muted">当前 AI {{ latestQC.score }} 分</text>
        </view>
        <textarea v-model="reviewForm.note" class="note-input" placeholder="复核意见（改判时必填）" maxlength="500" />
        <view class="row review-actions">
          <button class="btn-secondary" :loading="reviewing === 'confirm'" @click="submitReview('confirm')">确认 AI 结果</button>
          <button class="btn-primary" :loading="reviewing === 'override'" @click="submitReview('override')">改判并提交</button>
        </view>
      </view>

      <view class="card">
        <text class="section-title">病历内容</text>
        <view v-for="field in fields" :key="field.key" class="field">
          <text class="field-label">{{ field.label }}</text>
          <text class="field-value" :class="{ emptyText: !field.value }">{{ field.value || '未填写' }}</text>
        </view>
      </view>

      <view class="bottom-actions">
        <button class="btn-secondary" @click="goBack">返回</button>
        <button class="btn-primary" :loading="qcing" @click="runQC">重新质控</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { api, type LatestQC, type QCIssue, type RecordDetail } from '@/api';
import { canQC } from '@/stores/auth';

const id = ref(0);
const record = ref<RecordDetail | null>(null);
const loading = ref(false);
const qcing = ref(false);
const reviewing = ref<'' | 'confirm' | 'override'>('');
const reviewForm = ref({ score: '', note: '' });

const latestQC = computed<LatestQC | null>(() => record.value?.latestQC || null);
const issues = computed<QCIssue[]>(() => {
  const raw = latestQC.value?.issues;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
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
const reviewTagClass = computed(() => ({
  pending: 'tag-amber',
  confirmed: 'tag-green',
  overridden: 'tag-amber',
} as Record<string, string>)[latestQC.value?.review_status || 'pending'] || 'tag-amber');
const taskOverdue = computed(() => {
  const t = record.value?.openTask;
  if (!t || !['open', 'submitted'].includes(t.status)) return false;
  return new Date(String(t.due_at).replace(' ', 'T')).getTime() < Date.now();
});
const fields = computed(() => {
  const r = record.value;
  if (!r) return [];
  return [
    { key: 'chief_complaint', label: '主诉', value: r.chief_complaint },
    { key: 'present_illness', label: '现病史', value: r.present_illness },
    { key: 'past_history', label: '既往史', value: r.past_history },
    { key: 'physical_exam', label: '体格检查', value: r.physical_exam },
    { key: 'auxiliary_exam', label: '辅助检查', value: r.auxiliary_exam },
    { key: 'diagnosis', label: '诊断', value: r.diagnosis },
    { key: 'treatment', label: '处理意见', value: r.treatment },
  ];
});

const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const statusText = (s: string) => ({ draft: '草稿', submitted: '已提交', qc_passed: '质控通过', qc_failed: '质控不通过' } as Record<string, string>)[s] || s;
const statusTagClass = (s: string) => ({ draft: 'tag-gray', submitted: 'tag-amber', qc_passed: 'tag-green', qc_failed: 'tag-red' } as Record<string, string>)[s] || 'tag-gray';
const sevText = (s: string) => ({ critical: '严重', major: '主要', minor: '一般' } as Record<string, string>)[s] || s;
const sevTagClass = (s: string) => ({ critical: 'tag-red', major: 'tag-amber', minor: 'tag-gray' } as Record<string, string>)[s] || 'tag-gray';
const taskText = (s: string) => ({ open: '待整改', submitted: '已提交', passed: '已通过', closed: '已关闭' } as Record<string, string>)[s] || s;

async function load() {
  loading.value = true;
  try {
    record.value = await api.record(id.value);
    if (latestQC.value) {
      reviewForm.value.score = String(latestQC.value.final_score ?? latestQC.value.score);
      reviewForm.value.note = latestQC.value.review_note || '';
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function runQC() {
  if (qcing.value) return;
  qcing.value = true;
  uni.showLoading({ title: 'AI 质控中…' });
  try {
    const report = await api.runQC(id.value);
    uni.hideLoading();
    uni.showToast({ title: `质控完成：${report.score} 分`, icon: 'none' });
    await load();
  } catch (e: any) {
    uni.hideLoading();
    uni.showToast({ title: e.message || '质控失败', icon: 'none' });
  } finally {
    qcing.value = false;
  }
}

async function submitReview(action: 'confirm' | 'override') {
  if (!latestQC.value) return;
  const score = Number(reviewForm.value.score);
  if (action === 'override' && (!Number.isFinite(score) || score < 0 || score > 100)) {
    uni.showToast({ title: '请输入 0-100 的最终分', icon: 'none' });
    return;
  }
  if (action === 'override' && !reviewForm.value.note.trim()) {
    uni.showToast({ title: '改判需要填写复核意见', icon: 'none' });
    return;
  }
  reviewing.value = action;
  try {
    await api.review(latestQC.value.id, {
      action,
      score: action === 'override' ? score : undefined,
      note: reviewForm.value.note,
    });
    uni.showToast({ title: action === 'override' ? '已改判' : '已确认', icon: 'success' });
    await load();
  } catch (e: any) {
    uni.showToast({ title: e.message || '复核失败', icon: 'none' });
  } finally {
    reviewing.value = '';
  }
}

async function closeTask() {
  if (!record.value?.openTask) return;
  const taskId = record.value.openTask.id;
  uni.showModal({
    title: '关闭整改任务',
    content: '',
    editable: true,
    placeholderText: '填写关闭说明，如：已补齐病历并经质控科确认',
    success: async (res: any) => {
      if (!res.confirm) return;
      try {
        await api.closeTask(taskId, res.content || '人工确认完成');
        uni.showToast({ title: '已关闭', icon: 'success' });
        await load();
      } catch (e: any) {
        uni.showToast({ title: e.message || '关闭失败', icon: 'none' });
      }
    },
  } as any);
}

function goBack() {
  uni.navigateBack({ delta: 1 });
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
.patient-card { padding: 24rpx; }
.patient-name { font-size: 36rpx; font-weight: 800; }
.patient-meta { margin-left: 12rpx; color: #94a3b8; font-size: 22rpx; }
.patient-foot { margin-top: 14rpx; flex-wrap: wrap; }
.patient-foot .muted { margin-right: 20rpx; }
.allergy { color: #c0353a; font-size: 22rpx; }

.task-banner { background: #fff8e8; border: 1rpx solid #f0d59a; padding: 20rpx 24rpx; }
.task-banner.overdue { background: #fdeeec; border-color: #f3c2c2; }
.task-icon {
  width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center;
  border-radius: 50%; background: #f5a524; color: #fff; font-weight: 800; margin-right: 16rpx;
}
.task-title { display: block; font-size: 26rpx; font-weight: 700; color: #8a5a00; }
.task-banner.overdue .task-title { color: #b02a2f; }
.task-due { display: block; margin-top: 4rpx; font-size: 22rpx; color: #8a5a00; }
.task-close { color: #b02a2f; font-size: 24rpx; padding: 8rpx 0 8rpx 16rpx; }

.report-card { padding: 24rpx; }
.report-head { margin-bottom: 16rpx; }
.section-title { font-size: 30rpx; font-weight: 700; }
.report-main { align-items: flex-start; }
.score-ring {
  width: 130rpx; height: 130rpx; border-radius: 50%; border: 6rpx solid currentColor;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  margin-right: 22rpx; flex: none;
}
.score-ring .score-num { font-size: 44rpx; font-weight: 800; line-height: 1; }
.score-ring .score-level { font-size: 20rpx; margin-top: 4rpx; opacity: 0.8; }
.level-a { color: #12a150; }
.level-b { color: #0f8b7f; }
.level-c { color: #f5a524; }
.level-d { color: #e5484d; }
.report-summary { flex: 1; }
.summary-text { display: block; font-size: 24rpx; line-height: 1.7; color: #334155; margin-bottom: 8rpx; }

.dims { margin-top: 20rpx; }
.dim { margin-bottom: 14rpx; }
.dim-top { justify-content: space-between; margin-bottom: 6rpx; }
.dim-value { font-size: 24rpx; font-weight: 700; color: #334155; }
.bar { height: 10rpx; border-radius: 6rpx; background: #eef2f5; overflow: hidden; }
.bar-inner { height: 100%; border-radius: 6rpx; }

.final-note {
  margin-top: 14rpx; padding: 14rpx 18rpx; border-radius: 12rpx;
  background: #fff6ec; color: #8a5a00; font-size: 22rpx; line-height: 1.7;
}

.issues { margin-top: 20rpx; }
.issue-title { display: block; font-size: 26rpx; font-weight: 700; margin-bottom: 12rpx; }
.issue { border-left: 6rpx solid #cbd5e1; background: #fbfdfe; border-radius: 10rpx; padding: 14rpx 16rpx; margin-bottom: 12rpx; }
.issue.critical { border-left-color: #e5484d; background: #fffafa; }
.issue.major { border-left-color: #f5a524; background: #fffdf8; }
.issue-rule { margin-left: 8rpx; font-size: 24rpx; font-weight: 700; }
.issue-code { margin-left: 8rpx; color: #94a3b8; font-size: 20rpx; }
.issue-msg { display: block; margin-top: 8rpx; font-size: 23rpx; color: #334155; line-height: 1.65; }
.issue-sug { display: block; margin-top: 4rpx; font-size: 23rpx; color: #0b5c56; line-height: 1.65; }

.review-card { padding: 24rpx; }
.review-tip { display: block; margin: 8rpx 0 18rpx; line-height: 1.6; }
.score-input-row { margin-bottom: 16rpx; }
.input-label { font-size: 24rpx; color: #475569; margin-right: 14rpx; }
.score-input { width: 140rpx; height: 64rpx; background: #f4f7fa; border-radius: 10rpx; padding: 0 14rpx; font-size: 26rpx; margin-right: 14rpx; }
.note-input { width: 100%; min-height: 120rpx; background: #f4f7fa; border-radius: 12rpx; padding: 16rpx; font-size: 24rpx; }
.review-actions { margin-top: 18rpx; }
.review-actions button { flex: 1; margin-right: 14rpx; }
.review-actions button:last-child { margin-right: 0; }

.btn-secondary {
  background: #ffffff; color: #0b5c56; border: 1rpx solid #b9ded7;
  border-radius: 16rpx; font-size: 28rpx; height: 80rpx; line-height: 80rpx;
}
.btn-secondary::after { border: none; }
.qc-btn { margin-top: 18rpx; width: 260rpx; height: 76rpx; line-height: 76rpx; font-size: 26rpx; }

.field { padding: 18rpx 0; border-top: 1rpx solid #eef2f5; }
.field:first-of-type { border-top: none; }
.field-label { display: block; font-size: 23rpx; color: #64748b; margin-bottom: 8rpx; }
.field-value { display: block; font-size: 25rpx; line-height: 1.75; color: #1e293b; white-space: pre-wrap; word-break: break-all; }
.emptyText { color: #cbd5e1; }

.bottom-actions { display: flex; margin-top: 8rpx; }
.bottom-actions button { flex: 1; margin-right: 16rpx; }
.bottom-actions button:last-child { margin-right: 0; }
.small { padding: 24rpx 0; font-size: 22rpx; }
</style>
