<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">病历质控</h1>
        <p class="page-sub">选择病历运行 AI 质控，查看四维度评分与整改建议；支持批量质控与整改复评</p>
      </div>
      <div class="head-actions">
        <el-button :icon="Download" :loading="exporting" @click="exportCsv">导出 CSV</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建病历</el-button>
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <el-input v-model="query.keyword" placeholder="患者姓名 / 病案号 / 诊断" clearable style="width: 240px" @keyup.enter="search" />
        <el-select v-model="query.status" placeholder="病历状态" clearable style="width: 150px">
          <el-option label="草稿" value="draft" />
          <el-option label="已提交" value="submitted" />
          <el-option label="质控通过" value="qc_passed" />
          <el-option label="质控不通过" value="qc_failed" />
        </el-select>
        <el-select v-model="query.deptId" placeholder="科室" clearable style="width: 150px">
          <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
        <el-button :icon="Search" @click="search">查询</el-button>
        <el-button :icon="RefreshLeft" @click="reset">重置</el-button>
        <div class="spacer" />
        <el-button
          v-if="selectedIds.length"
          type="primary"
          plain
          :icon="MagicStick"
          :loading="batchSubmitting"
          @click="startBatch"
        >
          批量质控（{{ selectedIds.length }}）
        </el-button>
        <span class="muted">共 {{ total }} 份病历</span>
      </div>

      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="rows"
        @selection-change="onSelectionChange"
        @row-click="onRowClick"
      >
        <el-table-column type="selection" width="42" />
        <el-table-column prop="patient_name" label="患者" width="150">
          <template #default="{ row }">
            <div class="patient-cell">
              <span class="pname">{{ row.patient_name }}</span>
              <span class="muted">{{ row.gender }} · {{ row.mrn }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="dept_name" label="科室" width="110" />
        <el-table-column prop="diagnosis" label="诊断" min-width="200" show-overflow-tooltip />
        <el-table-column prop="doctor_name" label="经治医师" width="100" />
        <el-table-column label="质控分" width="110" align="center">
          <template #default="{ row }">
            <div v-if="row.qc_score !== null && row.qc_score !== undefined" class="score-cell">
              <span class="score" :class="displayLevel(row).toLowerCase()">{{ displayScore(row) }}</span>
              <span v-if="row.qc_final_score !== null && row.qc_final_score !== undefined" class="muted final-tag">最终</span>
              <span
                v-else-if="row.qc_review_status === 'pending'"
                class="pending-tag"
              >待复核</span>
              <span
                v-if="row.score_delta !== null && row.score_delta !== undefined && Number(row.score_delta) !== 0"
                class="delta-mini"
                :class="Number(row.score_delta) > 0 ? 'up' : 'down'"
              >
                {{ Number(row.score_delta) > 0 ? '+' : '' }}{{ row.score_delta }}
              </span>
            </div>
            <span v-else class="muted">未质控</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="light">{{ statusText(row.status) }}</el-tag>
            <el-tag v-if="row.open_task_id" size="small" type="warning" effect="plain" class="task-tag">整改中</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="155">
          <template #default="{ row }">{{ fmt(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click.stop="router.push(`/records/${row.id}`)">详情</el-button>
            <el-button link type="success" size="small" :loading="qcLoadingId === row.id" @click.stop="runQC(row)">AI 质控</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 20, 50]"
          @change="load"
        />
      </div>
    </div>

    <!-- 新建病历 -->
    <el-dialog v-model="createVisible" title="新建病历" width="560px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="就诊患者" required>
          <el-select v-model="form.visitId" filterable remote :remote-method="searchVisits" placeholder="输入患者姓名搜索就诊记录" style="width: 100%">
            <el-option v-for="v in visitOptions" :key="v.id" :label="`${v.patient_name} · ${v.dept_name} · ${fmt(v.visit_time)}`" :value="v.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="主诉"><el-input v-model="form.chief_complaint" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="现病史"><el-input v-model="form.present_illness" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="诊断"><el-input v-model="form.diagnosis" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="create">创建并编辑</el-button>
      </template>
    </el-dialog>

    <!-- 单条质控结果 -->
    <el-dialog v-model="qcVisible" title="AI 质控结果" width="720px" top="6vh">
      <QCPanel v-if="qcResult" :report="qcResult" />
    </el-dialog>

    <!-- 批量质控进度 -->
    <el-dialog
      v-model="batchVisible"
      title="批量质控"
      width="780px"
      top="6vh"
      :close-on-click-modal="false"
      @closed="stopPoll"
    >
      <div v-if="batch" class="batch-panel">
        <div class="batch-progress">
          <el-progress
            :percentage="batch.percent"
            :status="batch.status === 'failed' ? 'exception' : batch.status === 'done' ? 'success' : undefined"
            :stroke-width="10"
          />
          <div class="batch-meta">
            <span>
              <strong>{{ batch.done + batch.failed }}</strong> / {{ batch.total }} 已处理
              <span v-if="batch.failed" class="batch-fail">· 失败 {{ batch.failed }}</span>
            </span>
            <span v-if="batch.status === 'done' && batch.improved" class="batch-gain">
              平均提升 {{ gainText(batch.avg_delta) }} 分 · {{ batch.improved }} 份提升
            </span>
            <span v-else class="muted">{{ batch.status === 'running' ? 'AI 质控进行中，可关闭窗口后台执行' : batch.status === 'done' ? '任务完成' : '等待执行' }}</span>
          </div>
        </div>

        <el-table :data="batch.items" size="small" max-height="400">
          <el-table-column prop="patient_name" label="患者" width="100" />
          <el-table-column prop="mrn" label="病案号" width="130" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="batchItemType(row.status)" size="small" effect="light">{{ batchItemText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="质控分" width="90" align="center">
            <template #default="{ row }">
              <span v-if="row.score !== null && row.score !== undefined" class="score" :class="String(row.level).toLowerCase()">
                {{ row.score }}
              </span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="80" align="center">
            <template #default="{ row }">{{ row.ms ? `${(row.ms / 1000).toFixed(1)}s` : '—' }}</template>
          </el-table-column>
          <el-table-column prop="error" label="失败原因" min-width="160" show-overflow-tooltip />
          <el-table-column label="操作" width="80">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="router.push(`/records/${row.record_id}`)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <el-empty v-else description="正在创建任务..." :image-size="70" />
      <template #footer>
        <el-button @click="batchVisible = false">{{ batch?.status === 'done' ? '关闭' : '后台运行' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus, Search, RefreshLeft, Download, MagicStick } from '@element-plus/icons-vue';
import { api, type QCReport, type BatchStatus } from '@/api';
import QCPanel from '@/components/QCPanel.vue';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const rows = ref<any[]>([]);
const total = ref(0);
const depts = ref<any[]>([]);
const tableRef = ref<any>(null);
const query = ref({ page: 1, size: 10, keyword: '', status: '', deptId: '' });

const createVisible = ref(false);
const creating = ref(false);
const form = ref<any>({ visitId: null, chief_complaint: '', present_illness: '', diagnosis: '' });
const visitOptions = ref<any[]>([]);

const qcVisible = ref(false);
const qcResult = ref<QCReport | null>(null);
const qcLoadingId = ref<number | null>(null);

const selectedIds = ref<number[]>([]);
const batchVisible = ref(false);
const batchSubmitting = ref(false);
const batch = ref<BatchStatus | null>(null);
let batchTimer: ReturnType<typeof setTimeout> | null = null;

const exporting = ref(false);

const statusText = (s: string) =>
  ({ draft: '草稿', submitted: '已提交', qc_passed: '质控通过', qc_failed: '质控不通过' }[s] || s);
const statusType = (s: string) =>
  ({ draft: 'info', submitted: 'warning', qc_passed: 'success', qc_failed: 'danger' }[s] || 'info') as any;
const displayScore = (row: any) => row.qc_final_score ?? row.qc_score;
const displayLevel = (row: any) => {
  const n = Number(displayScore(row));
  return n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 60 ? 'C' : 'D';
};
const batchItemText = (s: string) =>
  ({ pending: '等待中', running: '质控中', ok: '完成', failed: '失败' }[s] || s);
const batchItemType = (s: string) =>
  ({ pending: 'info', running: 'warning', ok: 'success', failed: 'danger' }[s] || 'info') as any;
const gainText = (v: number | null | undefined) => (v === null || v === undefined ? '0' : `${v > 0 ? '+' : ''}${v}`);
const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');

async function load() {
  loading.value = true;
  try {
    const data = await api.records(query.value);
    rows.value = data.list;
    total.value = data.total;
    selectedIds.value = [];
    tableRef.value?.clearSelection?.();
  } finally {
    loading.value = false;
  }
}

function search() {
  query.value.page = 1;
  load();
}

function reset() {
  query.value = { page: 1, size: 10, keyword: '', status: '', deptId: '' };
  load();
}

function onSelectionChange(selection: any[]) {
  selectedIds.value = selection.map((r) => Number(r.id));
}

function onRowClick(row: any, column: any) {
  if (column?.type === 'selection') return;
  router.push(`/records/${row.id}`);
}

async function runQC(row: any) {
  qcLoadingId.value = row.id;
  try {
    const report = await api.runQC(row.id);
    qcResult.value = report;
    qcVisible.value = true;
    const delta = report.scoreDelta ? `，较上次 ${report.scoreDelta > 0 ? '+' : ''}${report.scoreDelta} 分` : '';
    ElMessage.success(`质控完成：${report.score} 分（${report.level} 级）${delta}`);
    load();
  } finally {
    qcLoadingId.value = null;
  }
}

async function startBatch() {
  if (!selectedIds.value.length) return;
  if (selectedIds.value.length > 20) {
    ElMessage.warning('单次最多 20 份，请分批提交');
    return;
  }
  batchSubmitting.value = true;
  try {
    const res = await api.createBatch(selectedIds.value);
    batch.value = null;
    batchVisible.value = true;
    ElMessage.success(res.skipped?.length ? `已提交 ${res.total} 份，${res.skipped.length} 份在队列中跳过` : `已提交 ${res.total} 份病历`);
    pollBatch(res.batchId);
  } finally {
    batchSubmitting.value = false;
  }
}

async function pollBatch(id: number) {
  stopPoll();
  try {
    const data = await api.batchStatus(id);
    batch.value = data;
    if (data.status === 'done' || data.status === 'failed') {
      if (data.status === 'done') {
        ElMessage.success(`批量质控完成：${data.done} 份成功${data.failed ? `，${data.failed} 份失败` : ''}`);
      } else {
        ElMessage.error('批量质控任务异常结束，请查看明细');
      }
      load();
      return;
    }
  } catch {
    // 网络抖动时继续轮询，避免一次失败就让进度卡死
  }
  batchTimer = setTimeout(() => pollBatch(id), 1500);
}

function stopPoll() {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
}

async function exportCsv() {
  exporting.value = true;
  try {
    const params = new URLSearchParams();
    if (query.value.keyword) params.set('keyword', query.value.keyword);
    if (query.value.status) params.set('status', query.value.status);
    if (query.value.deptId) params.set('deptId', String(query.value.deptId));
    const token = localStorage.getItem('medai_token') || '';
    const res = await fetch(`/api/records/export.csv?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `智医质控-病历清单-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success(`已导出 ${total.value} 份病历清单`);
  } catch (err: any) {
    ElMessage.error(err.message || '导出失败');
  } finally {
    exporting.value = false;
  }
}

async function openCreate() {
  createVisible.value = true;
  form.value = { visitId: null, chief_complaint: '', present_illness: '', diagnosis: '' };
  await searchVisits('');
}

async function searchVisits(keyword: string) {
  const data = await api.visits({ page: 1, size: 20, keyword });
  visitOptions.value = data.list;
}

async function create() {
  if (!form.value.visitId) {
    ElMessage.warning('请选择就诊记录');
    return;
  }
  creating.value = true;
  try {
    const res: any = await api.createRecord(form.value);
    ElMessage.success('病历已创建');
    createVisible.value = false;
    router.push(`/records/${res.id}`);
  } finally {
    creating.value = false;
  }
}

onMounted(async () => {
  if (route.query.status) query.value.status = String(route.query.status);
  depts.value = await api.departments();
  load();
});

onBeforeUnmount(stopPoll);
</script>

<style scoped>
.head-actions { display: flex; gap: 8px; }
.patient-cell { display: flex; flex-direction: column; line-height: 1.35; }
.pname { font-weight: 600; font-size: 13px; }
.patient-cell .muted { white-space: nowrap; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }

.score-cell { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.2; }
.delta-mini { font-size: 10.5px; font-weight: 600; }
.delta-mini.up { color: #0b7a52; }
.delta-mini.down { color: #c0353a; }
.final-tag { font-size: 9.5px; color: #0b7a52; }
.pending-tag { font-size: 9.5px; color: #a86400; }
.task-tag { margin-left: 4px; }

.batch-panel { display: flex; flex-direction: column; gap: 14px; }
.batch-meta { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; font-size: 12.5px; color: var(--ink-700); }
.batch-fail { color: var(--danger); }
.batch-gain { color: #0b7a52; font-weight: 600; }

@media (max-width: 900px) {
  .head-actions { width: 100%; }
}
</style>
