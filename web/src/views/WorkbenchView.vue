<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">质控工作台</h1>
        <p class="page-sub">AI 初筛 → 质控医师复核 → 临床整改 → 复评归档，每一步都有责任人与留痕</p>
      </div>
      <el-button :icon="Refresh" @click="reload">刷新</el-button>
    </div>

    <div class="stat-grid">
      <div v-if="auth.canQC" class="stat">
        <div class="label">待复核报告</div>
        <div class="value" :class="{ danger: reviewTotal > 0 }">{{ reviewTotal }}<span class="unit">份</span></div>
        <div class="icon"><el-icon><Stamp /></el-icon></div>
      </div>
      <div class="stat">
        <div class="label">待整改任务</div>
        <div class="value" :class="{ danger: taskSummary.pending > 0 }">{{ taskSummary.pending }}<span class="unit">项</span></div>
        <div class="icon"><el-icon><List /></el-icon></div>
      </div>
      <div class="stat">
        <div class="label">逾期未整改</div>
        <div class="value" :style="{ color: taskSummary.overdue > 0 ? '#e5484d' : undefined }">
          {{ taskSummary.overdue }}<span class="unit">项</span>
        </div>
        <div class="icon"><el-icon><Warning /></el-icon></div>
      </div>
      <div class="stat">
        <div class="label">整改通过</div>
        <div class="value" style="color: #0b7a52">{{ taskSummary.passed }}<span class="unit">项</span></div>
        <div class="icon"><el-icon><CircleCheck /></el-icon></div>
      </div>
    </div>

    <div class="card">
      <el-tabs v-model="tab">
        <el-tab-pane v-if="auth.canQC" name="review">
          <template #label>
            待复核 <el-badge v-if="reviewTotal" :value="reviewTotal" class="tab-badge" />
          </template>
          <div class="toolbar">
            <el-input v-model="reviewQuery.keyword" placeholder="患者 / 病案号 / 诊断" clearable style="width: 240px" @keyup.enter="loadReviews(1)" />
            <el-button :icon="Search" @click="loadReviews(1)">查询</el-button>
            <div class="spacer" />
            <span class="muted">按 AI 分数从低到高排序，优先复核高风险病历</span>
          </div>
          <el-table v-loading="reviewLoading" :data="reviews" @row-click="(row: any) => goRecord(row.record_id)">
            <el-table-column prop="patient_name" label="患者" width="110">
              <template #default="{ row }">
                <div class="patient-cell">
                  <span class="pname">{{ row.patient_name }}</span>
                  <span class="muted">{{ row.mrn }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="dept_name" label="科室" width="110" />
            <el-table-column prop="doctor_name" label="经治医师" width="100" />
            <el-table-column label="AI 评分" width="110" align="center">
              <template #default="{ row }">
                <span class="score" :class="String(row.level).toLowerCase()">{{ row.score }}</span>
                <span class="muted"> / {{ row.level }} 级</span>
              </template>
            </el-table-column>
            <el-table-column label="问题" width="90" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.issueCount > 3 ? 'danger' : 'warning'" effect="light">{{ row.issueCount }} 项</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="质控时间" min-width="150">
              <template #default="{ row }">{{ fmt(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click.stop="goRecord(row.record_id)">查看</el-button>
                <el-button link type="warning" size="small" @click.stop="openReview(row)">复核</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="reviewQuery.page"
              v-model:page-size="reviewQuery.size"
              :total="reviewTotal"
              layout="total, prev, pager, next"
              @change="() => loadReviews()"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane name="tasks">
          <template #label>
            整改任务 <el-badge v-if="taskSummary.overdue" :value="taskSummary.overdue" type="danger" class="tab-badge" />
          </template>
          <div class="toolbar">
            <el-input v-model="taskQuery.keyword" placeholder="患者 / 病案号 / 诊断" clearable style="width: 220px" @keyup.enter="loadTasks(1)" />
            <el-select v-model="taskQuery.status" placeholder="任务状态" clearable style="width: 140px">
              <el-option label="待整改" value="open" />
              <el-option label="已提交" value="submitted" />
              <el-option label="已通过" value="passed" />
              <el-option label="已关闭" value="closed" />
              <el-option label="已逾期" value="overdue" />
            </el-select>
            <el-select v-model="taskQuery.deptId" placeholder="科室" clearable style="width: 140px">
              <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
            <el-button :icon="Search" @click="loadTasks(1)">查询</el-button>
            <div class="spacer" />
            <span class="muted">共 {{ taskTotal }} 项</span>
          </div>
          <el-table v-loading="taskLoading" :data="tasks" @row-click="(row: any) => goRecord(row.record_id)">
            <el-table-column prop="patient_name" label="患者" width="110">
              <template #default="{ row }">
                <div class="patient-cell">
                  <span class="pname">{{ row.patient_name }}</span>
                  <span class="muted">{{ row.mrn }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="dept_name" label="科室" width="100" />
            <el-table-column prop="doctor_name" label="承办医师" width="100" />
            <el-table-column prop="diagnosis" label="诊断" min-width="180" show-overflow-tooltip />
            <el-table-column label="任务状态" width="110">
              <template #default="{ row }">
                <el-tag :type="taskType(row)" size="small" effect="light">{{ taskText(row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="截止时间" width="160">
              <template #default="{ row }">
                <span :class="{ overdue: row.overdue === 1 }">{{ fmt(row.due_at) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click.stop="goRecord(row.record_id)">查看病历</el-button>
                <el-button
                  v-if="auth.canQC && ['open', 'submitted'].includes(row.status)"
                  link
                  type="warning"
                  size="small"
                  @click.stop="closeTask(row)"
                >关闭</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="taskQuery.page"
              v-model:page-size="taskQuery.size"
              :total="taskTotal"
              layout="total, prev, pager, next"
              @change="() => loadTasks()"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 复核弹窗 -->
    <el-dialog v-model="reviewVisible" title="质控复核 / 终审" width="720px" top="5vh">
      <div v-if="reviewRow" class="review-panel">
        <div class="review-head">
          <div>
            <div class="review-name">{{ reviewRow.patient_name }} <span class="muted">{{ reviewRow.mrn }} · {{ reviewRow.dept_name }} · {{ reviewRow.doctor_name }}</span></div>
            <div class="muted">质控时间：{{ fmt(reviewRow.created_at) }} · 模型：{{ reviewRow.model }}</div>
          </div>
          <div class="review-score" :class="String(reviewRow.level).toLowerCase()">
            {{ reviewRow.score }}<span>{{ reviewRow.level }} 级</span>
          </div>
        </div>

        <div class="review-issues">
          <div class="review-label">AI 问题清单（{{ reviewRow.issueCount }} 项）</div>
          <div v-if="reviewIssues.length" class="issue-list">
            <div v-for="(it, i) in reviewIssues" :key="i" class="review-issue">
              <el-tag :type="sevType(it.severity)" size="small" effect="dark">{{ sevText(it.severity) }}</el-tag>
              <strong>{{ it.rule }}</strong>
              <span class="muted">{{ it.message }}</span>
            </div>
          </div>
          <p v-else class="muted">未解析到问题清单，请打开病历查看完整报告。</p>
        </div>

        <el-form label-position="top" class="review-form">
          <el-form-item label="最终得分（确认时沿用 AI 分；改判时填写 0-100）">
            <el-input-number v-model="reviewForm.score" :min="0" :max="100" :step="1" :precision="1" />
            <span class="muted" style="margin-left: 10px">最终等级：{{ finalLevel }}</span>
          </el-form-item>
          <el-form-item label="复核意见（改判时必填）">
            <el-input v-model="reviewForm.note" type="textarea" :rows="3" placeholder="如：已补充现病史，经质控科复核同意通过；或说明改判依据" />
          </el-form-item>
        </el-form>
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
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Search, Stamp, List, Warning, CircleCheck } from '@element-plus/icons-vue';
import { api, type ReviewItem, type TaskItem } from '@/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const tab = ref(auth.canQC ? 'review' : 'tasks');
const depts = ref<any[]>([]);

const reviews = ref<ReviewItem[]>([]);
const reviewTotal = ref(0);
const reviewLoading = ref(false);
const reviewQuery = ref({ page: 1, size: 10, keyword: '' });

const tasks = ref<TaskItem[]>([]);
const taskTotal = ref(0);
const taskLoading = ref(false);
const taskSummary = ref({ pending: 0, overdue: 0, passed: 0 });
const taskQuery = ref({ page: 1, size: 10, status: '', deptId: '', keyword: '' });

const reviewVisible = ref(false);
const reviewRow = ref<ReviewItem | null>(null);
const reviewForm = ref({ score: 0, note: '' });
const reviewing = ref<'' | 'confirm' | 'override'>('');

const reviewIssues = computed(() => {
  const raw = reviewRow.value?.issues;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
});
const finalLevel = computed(() => {
  const n = Number(reviewForm.value.score);
  return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 60 ? 'C' : 'D';
});

const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const sevText = (s: string) => ({ critical: '严重', major: '主要', minor: '一般' }[s] || s);
const sevType = (s: string) => ({ critical: 'danger', major: 'warning', minor: 'info' }[s] || 'info') as any;

const taskText = (row: TaskItem) => {
  if (row.overdue === 1 && ['open', 'submitted'].includes(row.status)) return '已逾期';
  return ({ open: '待整改', submitted: '已提交', passed: '已通过', closed: '已关闭' }[row.status] || row.status);
};
const taskType = (row: TaskItem) => {
  if (row.overdue === 1 && ['open', 'submitted'].includes(row.status)) return 'danger';
  return ({ open: 'warning', submitted: 'info', passed: 'success', closed: 'info' }[row.status] || 'info') as any;
};

async function loadReviews(page?: number) {
  if (!auth.canQC) return;
  if (page) reviewQuery.value.page = page;
  reviewLoading.value = true;
  try {
    const data = await api.reviewsPending(reviewQuery.value);
    reviews.value = data.list;
    reviewTotal.value = data.total;
  } finally {
    reviewLoading.value = false;
  }
}

async function loadTasks(page?: number) {
  if (page) taskQuery.value.page = page;
  taskLoading.value = true;
  try {
    const data = await api.tasks(taskQuery.value);
    tasks.value = data.list;
    taskTotal.value = data.total;
    taskSummary.value = data.summary;
  } finally {
    taskLoading.value = false;
  }
}

function reload() {
  loadReviews();
  loadTasks();
}

function goRecord(id: number) {
  router.push(`/records/${id}`);
}

function openReview(row: ReviewItem) {
  reviewRow.value = row;
  reviewForm.value = { score: Number(row.score), note: '' };
  reviewVisible.value = true;
}

async function submitReview(action: 'confirm' | 'override') {
  if (!reviewRow.value) return;
  if (action === 'override' && !reviewForm.value.note.trim()) {
    ElMessage.warning('改判需要填写复核意见');
    return;
  }
  reviewing.value = action;
  try {
    await api.reviewReport(reviewRow.value.id, {
      action,
      score: action === 'override' ? reviewForm.value.score : undefined,
      note: reviewForm.value.note,
    });
    ElMessage.success(action === 'override' ? '已改判，病历状态与整改任务已同步' : '已确认 AI 质控结果');
    reviewVisible.value = false;
    reload();
  } finally {
    reviewing.value = '';
  }
}

async function closeTask(row: TaskItem) {
  let value = '';
  try {
    const res = await ElMessageBox.prompt('关闭后任务将标记为人工确认完成，请填写说明', '关闭整改任务', {
      inputPlaceholder: '如：已补齐病历并经质控科确认，免于整改',
      inputValue: '',
      confirmButtonText: '确认关闭',
      cancelButtonText: '取消',
    });
    value = res.value;
  } catch {
    return;
  }
  await api.closeTask(row.id, value || '人工确认完成');
  ElMessage.success('整改任务已关闭');
  loadTasks();
}

onMounted(async () => {
  depts.value = await api.departments();
  if (auth.canQC) loadReviews();
  loadTasks();
});
</script>

<style scoped>
.wb-stats { grid-template-columns: repeat(4, 1fr); }
.stat .value.danger { color: var(--danger); }
.tab-badge { margin-left: 4px; }
.patient-cell { display: flex; flex-direction: column; line-height: 1.35; }
.pname { font-weight: 600; font-size: 13px; }
.patient-cell .muted { white-space: nowrap; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }
.overdue { color: var(--danger); font-weight: 700; }

.review-panel { display: flex; flex-direction: column; gap: 14px; }
.review-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.review-name { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
.review-name .muted { font-size: 12px; font-weight: 400; }
.review-score { font-size: 34px; font-weight: 800; line-height: 1; }
.review-score span { display: block; font-size: 11px; font-weight: 500; margin-top: 4px; text-align: right; }
.review-score.a { color: var(--ok); }
.review-score.b { color: var(--brand-500); }
.review-score.c { color: var(--warn); }
.review-score.d { color: var(--danger); }
.review-issues { background: #f8fbfd; border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px; }
.review-label { font-size: 12px; font-weight: 700; color: var(--ink-700); margin-bottom: 8px; }
.issue-list { max-height: 220px; overflow: auto; display: flex; flex-direction: column; gap: 7px; }
.review-issue { display: flex; align-items: baseline; gap: 8px; font-size: 12px; line-height: 1.6; flex-wrap: wrap; }
.review-issue .muted { flex-basis: 100%; padding-left: 2px; }
.review-form { margin-top: 2px; }

@media (max-width: 900px) {
  .wb-stats { grid-template-columns: repeat(2, 1fr); }
  .review-head { flex-direction: column; align-items: flex-start; }
  .review-score span { text-align: left; }
}
</style>
