<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">病历质控</h1>
        <p class="page-sub">选择病历运行 AI 质控，查看四维度评分与整改建议</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建病历</el-button>
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
        <span class="muted">共 {{ total }} 份病历</span>
      </div>

      <el-table v-loading="loading" :data="rows" @row-click="(row: any) => router.push(`/records/${row.id}`)">
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
        <el-table-column label="质控分" width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.qc_score !== null && row.qc_score !== undefined" class="score" :class="String(row.qc_level).toLowerCase()">
              {{ row.qc_score }}
            </span>
            <span v-else class="muted">未质控</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="light">{{ statusText(row.status) }}</el-tag>
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

    <!-- 质控结果 -->
    <el-dialog v-model="qcVisible" title="AI 质控结果" width="720px" top="6vh">
      <QCPanel v-if="qcResult" :report="qcResult" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus, Search, RefreshLeft } from '@element-plus/icons-vue';
import { api, type QCReport } from '@/api';
import QCPanel from '@/components/QCPanel.vue';

const router = useRouter();
const loading = ref(false);
const rows = ref<any[]>([]);
const total = ref(0);
const depts = ref<any[]>([]);
const query = ref({ page: 1, size: 10, keyword: '', status: '', deptId: '' });

const createVisible = ref(false);
const creating = ref(false);
const form = ref<any>({ visitId: null, chief_complaint: '', present_illness: '', diagnosis: '' });
const visitOptions = ref<any[]>([]);

const qcVisible = ref(false);
const qcResult = ref<QCReport | null>(null);
const qcLoadingId = ref<number | null>(null);

const statusText = (s: string) =>
  ({ draft: '草稿', submitted: '已提交', qc_passed: '质控通过', qc_failed: '质控不通过' }[s] || s);
const statusType = (s: string) =>
  ({ draft: 'info', submitted: 'warning', qc_passed: 'success', qc_failed: 'danger' }[s] || 'info') as any;
const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');

async function load() {
  loading.value = true;
  try {
    const data = await api.records(query.value);
    rows.value = data.list;
    total.value = data.total;
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

async function runQC(row: any) {
  qcLoadingId.value = row.id;
  try {
    const report = await api.runQC(row.id);
    qcResult.value = report;
    qcVisible.value = true;
    ElMessage.success(`质控完成：${report.score} 分（${report.level} 级）`);
    load();
  } finally {
    qcLoadingId.value = null;
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
  depts.value = await api.departments();
  load();
});
</script>

<style scoped>
.patient-cell { display: flex; flex-direction: column; line-height: 1.35; }
.pname { font-weight: 600; font-size: 13px; }
.patient-cell .muted { white-space: nowrap; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>
