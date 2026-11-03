<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">质控规则</h1>
        <p class="page-sub">规则引擎与 AI 提示词共用的评分依据，可按科室管理要求调整权重</p>
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <el-radio-group v-model="category" size="small">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button v-for="c in categories" :key="c.key" :value="c.key">{{ c.label }}</el-radio-button>
        </el-radio-group>
        <div class="spacer" />
        <span class="muted">共 {{ filtered.length }} 条规则</span>
      </div>

      <el-table :data="filtered" v-loading="loading">
        <el-table-column prop="code" label="编码" width="100">
          <template #default="{ row }"><code class="code">{{ row.code }}</code></template>
        </el-table-column>
        <el-table-column prop="name" label="规则名称" min-width="180" />
        <el-table-column label="维度" width="110">
          <template #default="{ row }">
            <el-tag size="small" effect="light">{{ catLabel(row.category) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="严重程度" width="100">
          <template #default="{ row }">
            <el-tag :type="sevType(row.severity)" size="small" effect="dark">{{ sevLabel(row.severity) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="weight" label="扣分权重" width="100" align="center" />
        <el-table-column prop="description" label="规则说明" min-width="240" show-overflow-tooltip />
        <el-table-column label="启用" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.enabled === 1"
              :disabled="!canEdit"
              @change="(v: any) => toggle(row, Boolean(v))"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" :disabled="!canEdit" @click="openEdit(row)">调整</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="editVisible" title="调整规则" width="440px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="规则名称"><el-input v-model="form.name" disabled /></el-form-item>
        <el-form-item label="严重程度">
          <el-radio-group v-model="form.severity">
            <el-radio value="critical">严重</el-radio>
            <el-radio value="major">主要</el-radio>
            <el-radio value="minor">一般</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="扣分权重">
          <el-input-number v-model="form.weight" :min="0" :max="50" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canEdit = computed(() => auth.canQC);

const loading = ref(false);
const rules = ref<any[]>([]);
const category = ref('');

const categories = [
  { key: 'completeness', label: '完整性' },
  { key: 'accuracy', label: '准确性' },
  { key: 'logic', label: '逻辑性' },
  { key: 'terminology', label: '规范性' },
];

const filtered = computed(() => (category.value ? rules.value.filter((r) => r.category === category.value) : rules.value));

const catLabel = (k: string) => categories.find((c) => c.key === k)?.label || k;
const sevLabel = (s: string) => ({ critical: '严重', major: '主要', minor: '一般' }[s] || s);
const sevType = (s: string) => ({ critical: 'danger', major: 'warning', minor: 'info' }[s] || 'info') as any;

const editVisible = ref(false);
const saving = ref(false);
const form = ref<any>({});

async function load() {
  loading.value = true;
  try {
    rules.value = await api.rules();
  } finally {
    loading.value = false;
  }
}

async function toggle(row: any, enabled: boolean) {
  await api.updateRule(row.id, { enabled });
  row.enabled = enabled ? 1 : 0;
  ElMessage.success(`规则「${row.name}」已${enabled ? '启用' : '停用'}`);
}

function openEdit(row: any) {
  form.value = { ...row };
  editVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    await api.updateRule(form.value.id, { weight: form.value.weight, severity: form.value.severity });
    ElMessage.success('规则已更新');
    editVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.code { font-size: 11.5px; background: #f1f5f9; padding: 2px 7px; border-radius: 5px; color: var(--ink-700); }
</style>
