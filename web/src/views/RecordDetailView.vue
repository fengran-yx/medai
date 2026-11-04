<template>
  <div v-loading="loading" class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">病历详情</h1>
        <p class="page-sub" v-if="record">
          {{ record.patient_name }} · {{ record.gender }} · {{ record.mrn }} ·
          {{ record.dept_name }} · {{ record.doctor_name }} · {{ fmt(record.visit_time) }}
        </p>
      </div>
      <div class="head-actions">
        <el-button @click="router.back()">返回</el-button>
        <el-button :icon="Printer" :disabled="!qcReport" @click="openReport">导出报告</el-button>
        <el-button :icon="DocumentChecked" :loading="saving" @click="save">保存病历</el-button>
        <el-button type="primary" :icon="MagicStick" :loading="qcing" @click="runQC">
          {{ qcReport ? '重新质控' : '运行 AI 质控' }}
        </el-button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="left">
        <div class="card patient-bar" v-if="record">
          <div class="pb-item"><span>就诊号</span><strong>{{ record.visit_no }}</strong></div>
          <div class="pb-item"><span>类型</span><strong>{{ visitTypeText }}</strong></div>
          <div class="pb-item"><span>过敏史</span><strong :class="{ danger: record.allergy && !record.allergy.includes('否认') }">{{ record.allergy || '未记录' }}</strong></div>
          <div class="pb-item"><span>状态</span>
            <el-tag :type="statusType(record.status)" size="small">{{ statusText(record.status) }}</el-tag>
          </div>
          <div class="pb-item"><span>质控轮次</span><strong>{{ record.versionCount || 0 }} 轮</strong></div>
        </div>

        <div class="card">
          <h3 class="card-title">病历内容</h3>
          <el-form label-position="top" class="record-form">
            <el-form-item label="主诉">
              <el-input v-model="form.chief_complaint" type="textarea" :rows="2" placeholder="如：反复胸闷、心悸 3 月，加重 1 天" />
            </el-form-item>
            <el-form-item label="现病史">
              <el-input v-model="form.present_illness" type="textarea" :rows="5" placeholder="描述起病时间、诱因、症状演变、诊治经过" />
            </el-form-item>
            <el-form-item label="既往史">
              <el-input v-model="form.past_history" type="textarea" :rows="2" placeholder="慢性病史、手术史、过敏史" />
            </el-form-item>
            <el-form-item label="体格检查">
              <el-input v-model="form.physical_exam" type="textarea" :rows="3" placeholder="生命体征与专科查体" />
            </el-form-item>
            <el-form-item label="辅助检查">
              <el-input v-model="form.auxiliary_exam" type="textarea" :rows="3" placeholder="实验室、影像学检查结果" />
            </el-form-item>
            <el-form-item label="诊断">
              <el-input v-model="form.diagnosis" placeholder="建议使用 ICD-10 标准诊断名称" />
            </el-form-item>
            <el-form-item label="处理意见">
              <el-input v-model="form.treatment" type="textarea" :rows="3" placeholder="治疗方案与随访计划" />
            </el-form-item>
          </el-form>
        </div>
      </div>

      <aside class="right">
        <!-- 整改闭环：有两次及以上质控版本时置顶，先看整改效果 -->
        <div v-if="hasCompare" class="card loop-card">
          <h3 class="card-title">整改闭环</h3>
          <div class="loop-head">
            <div class="loop-delta" :class="Number(compare?.scoreDelta) >= 0 ? 'up' : 'down'">
              {{ Number(compare?.scoreDelta) > 0 ? '+' : '' }}{{ compare?.scoreDelta ?? 0 }}
              <span>分</span>
            </div>
            <div class="loop-meta">
              <div>第 {{ compare?.from.version }} 轮 → 第 {{ compare?.to.version }} 轮</div>
              <div class="muted">修改 {{ compare?.changedFields.length }} 个字段 · {{ fmt(compare?.to.created_at || '') }}</div>
            </div>
          </div>

          <div class="dim-deltas" v-if="dimDeltas.length">
            <div v-for="d in dimDeltas" :key="d.label" class="dim-delta">
              <span>{{ d.label }}</span>
              <strong :class="d.delta >= 0 ? 'up' : 'down'">
                {{ d.from }} → {{ d.to }}
                <em>({{ d.delta > 0 ? '+' : '' }}{{ d.delta }})</em>
              </strong>
            </div>
          </div>

          <el-collapse class="diff-collapse">
            <el-collapse-item title="查看字段修改明细" name="diff">
              <div v-for="c in changedChanges" :key="c.field" class="diff-row">
                <div class="diff-label">{{ c.label }}</div>
                <div class="diff-text before"><span>修改前</span>{{ c.before || '（空）' }}</div>
                <div class="diff-text after"><span>修改后</span>{{ c.after || '（空）' }}</div>
              </div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <div class="card">
          <h3 class="card-title">AI 质控报告</h3>

          <div v-if="qcReport" class="review-strip" :class="reviewStripClass">
            <div class="review-strip-main">
              <el-tag :type="reviewTagType" size="small" effect="dark">{{ reviewStatusText }}</el-tag>
              <strong v-if="qcReport.final_score !== null && qcReport.final_score !== undefined">
                最终 {{ qcReport.final_score }} 分
              </strong>
              <span v-else class="muted">AI 分 {{ qcReport.score }}，等待质控医师复核</span>
              <span v-if="qcReport.reviewer_name" class="muted">
                · {{ qcReport.reviewer_name }} {{ fmt(qcReport.reviewed_at || '') }}
              </span>
            </div>
            <el-button v-if="auth.canQC" size="small" :type="qcReport.review_status === 'pending' ? 'primary' : 'default'" @click="openReview">
              复核 / 改判
            </el-button>
          </div>

          <div v-if="record?.openTask" class="task-strip" :class="{ overdue: taskOverdue }">
            <el-icon><AlarmClock /></el-icon>
            <span>
              整改任务：{{ taskStatusText }} · 截止 {{ fmt(record.openTask.due_at) }}
              <strong v-if="taskOverdue">（已逾期）</strong>
            </span>
          </div>

          <QCPanel v-if="qcReport" :report="qcReport" :changed-fields="compare?.changedFields || []" />
          <div v-else class="empty-hint">
            尚未运行质控<br />
            <el-button type="primary" size="small" :icon="MagicStick" style="margin-top: 12px" @click="runQC">
              立即质控
            </el-button>
          </div>
          <p v-if="qcReport && !hasCompare" class="loop-tip-inline">
            按质控建议修改病历后点击「重新质控」，系统会自动对比前后两个版本并计算分数提升。
          </p>
        </div>

        <div class="card" v-if="history.length">
          <h3 class="card-title">质控历史</h3>
          <el-timeline>
            <el-timeline-item v-for="h in history" :key="h.id" :timestamp="fmt(h.created_at)" placement="top">
              <div class="his-row">
                <span class="score" :class="String(h.level).toLowerCase()">{{ h.score }} 分</span>
                <el-tag size="small" effect="plain">{{ h.level }} 级</el-tag>
                <el-tag v-if="h.record_version" size="small" type="info" effect="plain">第 {{ h.record_version }} 轮</el-tag>
                <span
                  v-if="h.score_delta !== null && h.score_delta !== undefined && Number(h.score_delta) !== 0"
                  class="his-delta"
                  :class="Number(h.score_delta) > 0 ? 'up' : 'down'"
                >
                  {{ Number(h.score_delta) > 0 ? '+' : '' }}{{ h.score_delta }}
                </span>
                <span class="muted">{{ h.model }}</span>
                <el-tag v-if="h.review_status === 'pending'" size="small" type="warning" effect="light">待复核</el-tag>
                <el-tag v-else-if="h.review_status === 'overridden'" size="small" type="warning" effect="plain">
                  改判 {{ h.final_score }}
                </el-tag>
                <el-tag v-else-if="h.review_status === 'confirmed'" size="small" type="success" effect="plain">已复核</el-tag>
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </aside>
    </div>

    <!-- 人工复核 / 终审 -->
    <el-dialog v-model="reviewVisible" title="质控复核 / 终审" width="620px" top="8vh">
      <div v-if="qcReport" class="review-dialog">
        <div class="review-dialog-head">
          <div>
            <div class="review-dialog-title">AI 质控分 {{ qcReport.score }}（{{ qcReport.level }} 级）</div>
            <div class="muted">{{ record?.patient_name }} · {{ record?.dept_name }} · {{ record?.doctor_name }}</div>
          </div>
          <el-tag :type="reviewTagType" effect="dark">{{ reviewStatusText }}</el-tag>
        </div>
        <el-form label-position="top">
          <el-form-item label="最终得分（确认沿用 AI 分，改判填写 0-100）">
            <el-input-number v-model="reviewForm.score" :min="0" :max="100" :step="1" :precision="1" />
            <span class="muted" style="margin-left: 10px">最终等级：{{ finalLevel }}</span>
          </el-form-item>
          <el-form-item label="复核意见（改判必填）">
            <el-input v-model="reviewForm.note" type="textarea" :rows="3" placeholder="说明复核依据、与临床沟通情况或改判原因" />
          </el-form-item>
        </el-form>
        <p class="review-tip">
          确认/改判会写入审计日志，并同步更新病历通过状态与整改任务。
        </p>
      </div>
      <template #footer>
        <el-button @click="reviewVisible = false">取消</el-button>
        <el-button :loading="reviewing === 'confirm'" @click="submitReview('confirm')">确认 AI 结果</el-button>
        <el-button type="warning" :loading="reviewing === 'override'" @click="submitReview('override')">改判并提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { MagicStick, DocumentChecked, Printer, AlarmClock } from '@element-plus/icons-vue';
import { api, type QCReport, type VersionCompare } from '@/api';
import { useAuthStore } from '@/stores/auth';
import QCPanel from '@/components/QCPanel.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const id = Number(route.params.id);

const loading = ref(false);
const saving = ref(false);
const qcing = ref(false);
const record = ref<any>(null);
const form = ref<any>({});
const qcReport = ref<QCReport | null>(null);
const history = ref<any[]>([]);
const compare = ref<VersionCompare | null>(null);

const reviewVisible = ref(false);
const reviewing = ref<'' | 'confirm' | 'override'>('');
const reviewForm = ref({ score: 0, note: '' });

const VISIT_TYPE: Record<string, string> = { outpatient: '门诊', emergency: '急诊', inpatient: '住院' };
const visitTypeText = computed(() => VISIT_TYPE[record.value?.visit_type as string] || '-');
const statusText = (s: string) => ({ draft: '草稿', submitted: '已提交', qc_passed: '质控通过', qc_failed: '质控不通过' }[s] || s);
const statusType = (s: string) => ({ draft: 'info', submitted: 'warning', qc_passed: 'success', qc_failed: 'danger' }[s] || 'info') as any;
const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');

const changedChanges = computed(() => (compare.value?.changes || []).filter((c) => c.changed));
const hasCompare = computed(() => Boolean(compare.value?.changedFields?.length));

const reviewStatusText = computed(() => ({
  pending: '待复核',
  confirmed: '已确认',
  overridden: '已改判',
}[qcReport.value?.review_status || 'pending'] || '待复核'));
const reviewTagType = computed(() => ({
  pending: 'warning',
  confirmed: 'success',
  overridden: 'warning',
}[qcReport.value?.review_status || 'pending'] || 'warning') as any);
const reviewStripClass = computed(() => qcReport.value?.review_status || 'pending');
const finalLevel = computed(() => {
  const n = Number(reviewForm.value.score);
  return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 60 ? 'C' : 'D';
});
const taskOverdue = computed(() => {
  const t = record.value?.openTask;
  if (!t || !['open', 'submitted'].includes(t.status)) return false;
  return new Date(String(t.due_at).replace(' ', 'T')).getTime() < Date.now();
});
const taskStatusText = computed(
  () => (({ open: '待整改', submitted: '已提交', passed: '已通过', closed: '已关闭' } as Record<string, string>)[record.value?.openTask?.status] || '待整改'),
);

const dimDeltas = computed(() => {
  const from = compare.value?.from?.dimensions;
  const to = compare.value?.to?.dimensions;
  if (!from || !to) return [];
  return [
    { label: '完整性', key: 'completeness' },
    { label: '准确性', key: 'accuracy' },
    { label: '逻辑性', key: 'logic' },
    { label: '规范性', key: 'terminology' },
  ].map((d) => {
    const f = Number(from[d.key] ?? 0);
    const t = Number(to[d.key] ?? 0);
    return { label: d.label, from: f, to: t, delta: Math.round((t - f) * 10) / 10 };
  });
});

function mapReport(q: any): QCReport {
  return {
    score: Number(q.score),
    level: q.level,
    dimensions: {
      completeness: Number(q.dim_completeness),
      accuracy: Number(q.dim_accuracy),
      logic: Number(q.dim_logic),
      terminology: Number(q.dim_terminology),
    },
    risk: q.risk,
    issues: typeof q.issues === 'string' ? JSON.parse(q.issues) : q.issues || [],
    suggestions: typeof q.suggestions === 'string' ? JSON.parse(q.suggestions) : q.suggestions || [],
    summary: q.summary,
    model: q.model,
    durationMs: q.duration_ms,
    prevScore: q.prev_score === null || q.prev_score === undefined ? null : Number(q.prev_score),
    scoreDelta: q.score_delta === null || q.score_delta === undefined ? null : Number(q.score_delta),
    version: q.record_version ?? null,
    reportId: q.id,
    review_status: q.review_status || 'pending',
    final_score: q.final_score === null || q.final_score === undefined ? null : Number(q.final_score),
    reviewer_name: q.reviewer_name || null,
    review_note: q.review_note || null,
    reviewed_at: q.reviewed_at || null,
  };
}

async function load() {
  loading.value = true;
  try {
    const data = await api.record(id);
    record.value = data;
    form.value = {
      chief_complaint: data.chief_complaint || '',
      present_illness: data.present_illness || '',
      past_history: data.past_history || '',
      physical_exam: data.physical_exam || '',
      auxiliary_exam: data.auxiliary_exam || '',
      diagnosis: data.diagnosis || '',
      treatment: data.treatment || '',
    };
    if (data.latestQC) qcReport.value = mapReport(data.latestQC);
    const [hist, cmp] = await Promise.all([
      api.qcHistory(id),
      api.compareVersions(id).catch(() => null),
    ]);
    history.value = hist;
    compare.value = cmp;
  } finally {
    loading.value = false;
  }
}

async function save(silent = false) {
  saving.value = true;
  try {
    await api.updateRecord(id, form.value);
    if (!silent) ElMessage.success('病历已保存');
    record.value = { ...record.value, ...form.value };
  } finally {
    saving.value = false;
  }
}

async function runQC() {
  qcing.value = true;
  try {
    await save(true);
    const report = await api.runQC(id);
    qcReport.value = report;
    await refreshAfterQC();
    const delta = report.scoreDelta ? `，较上次 ${report.scoreDelta > 0 ? '+' : ''}${report.scoreDelta} 分` : '';
    ElMessage.success(`质控完成：${report.score} 分（${report.level} 级）${delta}`);
  } finally {
    qcing.value = false;
  }
}

async function refreshAfterQC() {
  const [hist, cmp, data] = await Promise.all([
    api.qcHistory(id),
    api.compareVersions(id).catch(() => null),
    api.record(id),
  ]);
  history.value = hist;
  compare.value = cmp;
  record.value = data;
  if (data.latestQC) qcReport.value = mapReport(data.latestQC);
  form.value = {
    chief_complaint: data.chief_complaint || '',
    present_illness: data.present_illness || '',
    past_history: data.past_history || '',
    physical_exam: data.physical_exam || '',
    auxiliary_exam: data.auxiliary_exam || '',
    diagnosis: data.diagnosis || '',
    treatment: data.treatment || '',
  };
}

function openReview() {
  if (!qcReport.value?.reportId) {
    ElMessage.warning('未找到本次质控报告');
    return;
  }
  reviewForm.value = {
    score: Number(qcReport.value.final_score ?? qcReport.value.score),
    note: qcReport.value.review_note || '',
  };
  reviewVisible.value = true;
}

async function submitReview(action: 'confirm' | 'override') {
  if (!qcReport.value?.reportId) return;
  if (action === 'override' && !reviewForm.value.note.trim()) {
    ElMessage.warning('改判需要填写复核意见');
    return;
  }
  reviewing.value = action;
  try {
    await api.reviewReport(qcReport.value.reportId, {
      action,
      score: action === 'override' ? reviewForm.value.score : undefined,
      note: reviewForm.value.note,
    });
    ElMessage.success(action === 'override' ? '已改判，病历状态与整改任务已同步' : '已确认 AI 质控结果');
    reviewVisible.value = false;
    await refreshAfterQC();
  } finally {
    reviewing.value = '';
  }
}

function openReport() {
  const url = router.resolve({ name: 'record-report', params: { id } }).href;
  window.open(url, '_blank');
}

onMounted(load);
</script>

<style scoped>
.head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(380px, 1fr); gap: 16px; align-items: start; }
.right { position: sticky; top: 12px; max-height: calc(100vh - 84px); overflow: auto; padding-right: 2px; }

.patient-bar { display: flex; flex-wrap: wrap; gap: 28px; padding: 14px 20px; }
.pb-item { display: flex; flex-direction: column; gap: 3px; }
.pb-item span { font-size: 11.5px; color: var(--ink-500); }
.pb-item strong { font-size: 13px; font-weight: 600; }
.pb-item .danger { color: #e5484d; }

.record-form :deep(.el-form-item) { margin-bottom: 16px; }
.record-form :deep(.el-form-item__label) { font-size: 12.5px; color: var(--ink-700); padding-bottom: 4px; font-weight: 600; }

.his-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.his-delta { font-size: 12px; font-weight: 700; }
.his-delta.up { color: #0b7a52; }
.his-delta.down { color: #c0353a; }

.loop-card { border-color: #d9ece7; background: linear-gradient(180deg, #fbfefd, #fff); }
.loop-head { display: flex; align-items: center; gap: 16px; }
.loop-delta { font-size: 34px; font-weight: 800; line-height: 1; letter-spacing: -1px; }
.loop-delta span { font-size: 13px; font-weight: 500; margin-left: 2px; }
.loop-delta.up { color: #0b7a52; }
.loop-delta.down { color: #c0353a; }
.loop-meta { font-size: 12.5px; color: var(--ink-700); line-height: 1.6; }

.dim-deltas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 14px; margin: 14px 0 4px; }
.dim-delta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--ink-500); }
.dim-delta strong { font-size: 12px; color: var(--ink-700); font-weight: 600; }
.dim-delta em { font-style: normal; margin-left: 2px; }
.dim-delta .up { color: #0b7a52; }
.dim-delta .down { color: #c0353a; }

.diff-collapse { margin-top: 10px; }
.diff-row { padding: 8px 0; border-top: 1px dashed var(--line); }
.diff-label { font-size: 12.5px; font-weight: 700; margin-bottom: 5px; }
.diff-text { font-size: 12px; line-height: 1.65; color: var(--ink-700); padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; word-break: break-word; }
.diff-text span { display: inline-block; font-size: 10.5px; font-weight: 600; margin-right: 6px; opacity: .75; }
.diff-text.before { background: #fdf2f2; }
.diff-text.after { background: #eefaf5; }
.loop-hint { padding: 22px 0; line-height: 1.8; }
.loop-tip-inline { margin: 12px 0 0; padding: 8px 10px; border-radius: 8px; background: #f1f8f6; color: var(--ink-500); font-size: 11.5px; line-height: 1.7; }

.review-strip { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 10px; margin-bottom: 12px; border: 1px dashed #dbe4ea; border-radius: 8px; background: #f8fbfd; }
.review-strip.pending { border-color: #f0cf8a; background: #fffaf0; }
.review-strip.confirmed { border-color: #bfe6d7; background: #f1fbf6; }
.review-strip.overridden { border-color: #f0c08a; background: #fff6ec; }
.review-strip-main { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; }
.task-strip { display: flex; align-items: center; gap: 6px; padding: 7px 10px; margin-bottom: 12px; border-radius: 8px; background: #fff8e8; color: #8a5a00; font-size: 12px; }
.task-strip.overdue { background: #fdeeec; color: #b02a2f; font-weight: 600; }
.review-dialog { display: flex; flex-direction: column; gap: 8px; }
.review-dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.review-dialog-title { font-size: 15px; font-weight: 700; margin-bottom: 3px; }
.review-tip { margin: 0; font-size: 11.5px; color: var(--ink-500); }

@media (max-width: 1200px) {
  .detail-grid { grid-template-columns: 1fr; }
  .right { position: static; max-height: none; overflow: visible; }
}
</style>
