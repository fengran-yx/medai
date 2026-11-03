<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">患者管理</h1>
        <p class="page-sub">患者主索引与就诊档案，支持按姓名、病案号、手机号检索</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增患者</el-button>
    </div>

    <div class="card">
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="姓名 / 病案号 / 手机号" clearable style="width: 260px" @keyup.enter="search" />
        <el-button :icon="Search" @click="search">查询</el-button>
        <div class="spacer" />
        <span class="muted">共 {{ total }} 位患者</span>
      </div>

      <el-table v-loading="loading" :data="rows">
        <el-table-column prop="mrn" label="病案号" width="130" />
        <el-table-column label="姓名" width="120">
          <template #default="{ row }">
            <span class="pname">{{ row.name }}</span>
            <span class="muted" style="margin-left: 6px">{{ row.gender }}</span>
          </template>
        </el-table-column>
        <el-table-column label="年龄" width="80">
          <template #default="{ row }">{{ row.age ?? '-' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="联系电话" width="130" />
        <el-table-column prop="blood_type" label="血型" width="80" />
        <el-table-column label="过敏史" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-if="row.allergy && !row.allergy.includes('否认')" type="danger" size="small" effect="light">{{ row.allergy }}</el-tag>
            <span v-else class="muted">{{ row.allergy || '未记录' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="visit_count" label="就诊次数" width="100" align="center" />
        <el-table-column label="最近就诊" width="140">
          <template #default="{ row }">{{ fmt(row.last_visit_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">档案</el-button>
            <el-button link size="small" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination v-model:current-page="page" v-model:page-size="size" :total="total" layout="total, prev, pager, next" @change="load" />
      </div>
    </div>

    <el-dialog v-model="formVisible" :title="editing ? '编辑患者' : '新增患者'" width="560px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="病案号" required>
          <el-input v-model="form.mrn" :disabled="editing" placeholder="如 MRN20260021" />
        </el-form-item>
        <el-form-item label="姓名" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="form.gender">
            <el-radio value="男">男</el-radio>
            <el-radio value="女">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="出生日期">
          <el-date-picker v-model="form.birthDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="身份证号"><el-input v-model="form.idCard" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="血型">
          <el-select v-model="form.bloodType" clearable style="width: 100%">
            <el-option v-for="b in ['A', 'B', 'O', 'AB']" :key="b" :label="b" :value="b" />
          </el-select>
        </el-form-item>
        <el-form-item label="过敏史"><el-input v-model="form.allergy" placeholder="如：青霉素过敏" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="患者档案" size="480px">
      <div v-if="detail" class="detail">
        <div class="detail-head">
          <div class="avatar">{{ detail.name?.slice(-2) }}</div>
          <div>
            <div class="dname">{{ detail.name }} <span class="muted">{{ detail.gender }} · {{ detail.age }} 岁</span></div>
            <div class="muted">{{ detail.mrn }} · {{ detail.phone || '无联系电话' }}</div>
          </div>
        </div>
        <el-descriptions :column="1" border size="small" style="margin: 16px 0">
          <el-descriptions-item label="身份证号">{{ detail.id_card || '-' }}</el-descriptions-item>
          <el-descriptions-item label="出生日期">{{ detail.birth_date || '-' }}</el-descriptions-item>
          <el-descriptions-item label="血型">{{ detail.blood_type || '-' }}</el-descriptions-item>
          <el-descriptions-item label="过敏史">{{ detail.allergy || '-' }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="sub-title">就诊记录（{{ detail.visits?.length || 0 }}）</h4>
        <el-timeline v-if="detail.visits?.length">
          <el-timeline-item v-for="v in detail.visits" :key="v.id" :timestamp="fmt(v.visit_time)" placement="top">
            <div class="visit">
              <div class="visit-top">
                <strong>{{ v.dept_name }}</strong>
                <el-tag size="small" effect="plain">{{ typeText(v.visit_type) }}</el-tag>
                <span class="muted">{{ v.doctor_name }}</span>
              </div>
              <p>{{ v.diagnosis || v.chief_complaint || '暂无诊断信息' }}</p>
            </div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无就诊记录" :image-size="70" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import { api } from '@/api';

const loading = ref(false);
const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const keyword = ref('');

const formVisible = ref(false);
const submitting = ref(false);
const editing = ref(false);
const editingId = ref(0);
const form = ref<any>({});

const detailVisible = ref(false);
const detail = ref<any>(null);

const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const typeText = (t: string) => ({ outpatient: '门诊', emergency: '急诊', inpatient: '住院' }[t] || t);

async function load() {
  loading.value = true;
  try {
    const data = await api.patients({ page: page.value, size: size.value, keyword: keyword.value });
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

function openCreate() {
  editing.value = false;
  editingId.value = 0;
  form.value = { mrn: `MRN${Date.now().toString().slice(-8)}`, name: '', gender: '男', birthDate: '', idCard: '', phone: '', bloodType: '', allergy: '' };
  formVisible.value = true;
}

function openEdit(row: any) {
  editing.value = true;
  editingId.value = row.id;
  form.value = {
    mrn: row.mrn, name: row.name, gender: row.gender, birthDate: row.birth_date,
    idCard: row.id_card, phone: row.phone, bloodType: row.blood_type, allergy: row.allergy,
  };
  formVisible.value = true;
}

async function submit() {
  if (!form.value.mrn || !form.value.name) {
    ElMessage.warning('病案号与姓名为必填项');
    return;
  }
  submitting.value = true;
  try {
    if (editing.value) await api.updatePatient(editingId.value, form.value);
    else await api.createPatient(form.value);
    ElMessage.success(editing.value ? '患者信息已更新' : '患者已创建');
    formVisible.value = false;
    load();
  } finally {
    submitting.value = false;
  }
}

async function openDetail(row: any) {
  detail.value = await api.patient(row.id);
  detailVisible.value = true;
}

onMounted(load);
</script>

<style scoped>
.pname { font-weight: 600; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }
.detail-head { display: flex; gap: 14px; align-items: center; }
.avatar {
  width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center;
  background: linear-gradient(135deg, var(--brand-400), var(--brand-700)); color: #fff; font-size: 16px;
}
.dname { font-size: 17px; font-weight: 700; margin-bottom: 4px; }
.sub-title { font-size: 13.5px; margin: 8px 0 14px; }
.visit-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.visit p { margin: 0; font-size: 12.5px; color: var(--ink-700); }
</style>
