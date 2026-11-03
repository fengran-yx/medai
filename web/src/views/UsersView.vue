<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">用户管理</h1>
        <p class="page-sub">维护院内账号与角色权限</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增用户</el-button>
    </div>

    <div class="card">
      <el-table v-loading="loading" :data="rows">
        <el-table-column prop="username" label="登录名" width="140" />
        <el-table-column prop="name" label="姓名" width="110" />
        <el-table-column label="角色" width="140">
          <template #default="{ row }">
            <el-tag :type="roleType(row.role)" size="small" effect="light">{{ roleText(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="职称" width="150" />
        <el-table-column prop="dept_name" label="科室" width="140" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column label="最近登录" width="160">
          <template #default="{ row }">{{ fmt(row.last_login_at) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link :type="row.status === 1 ? 'warning' : 'success'" size="small" @click="toggleStatus(row)">
              {{ row.status === 1 ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="visible" :title="editing ? '编辑用户' : '新增用户'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="登录名" required>
          <el-input v-model="form.username" :disabled="editing" />
        </el-form-item>
        <el-form-item :label="editing ? '重置密码' : '初始密码'" :required="!editing">
          <el-input v-model="form.password" type="password" show-password :placeholder="editing ? '留空则不修改' : '至少 6 位'" />
        </el-form-item>
        <el-form-item label="姓名" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option label="系统管理员" value="admin" />
            <el-option label="质控医师" value="quality" />
            <el-option label="临床医师" value="clinician" />
          </el-select>
        </el-form-item>
        <el-form-item label="职称"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="科室">
          <el-select v-model="form.deptId" clearable style="width: 100%">
            <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号"><el-input v-model="form.phone" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { api } from '@/api';

const loading = ref(false);
const rows = ref<any[]>([]);
const depts = ref<any[]>([]);

const visible = ref(false);
const saving = ref(false);
const editing = ref(false);
const editingId = ref(0);
const form = ref<any>({});

const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const roleText = (r: string) => ({ admin: '系统管理员', quality: '质控医师', clinician: '临床医师' }[r] || r);
const roleType = (r: string) => ({ admin: 'danger', quality: 'warning', clinician: '' }[r] || 'info') as any;

async function load() {
  loading.value = true;
  try {
    rows.value = await api.users();
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = false;
  editingId.value = 0;
  form.value = { username: '', password: '', name: '', role: 'clinician', title: '', deptId: null, phone: '' };
  visible.value = true;
}

function openEdit(row: any) {
  editing.value = true;
  editingId.value = row.id;
  form.value = { username: row.username, password: '', name: row.name, role: row.role, title: row.title, deptId: row.dept_id, phone: row.phone };
  visible.value = true;
}

async function save() {
  if (!form.value.username || !form.value.name || (!editing.value && !form.value.password)) {
    ElMessage.warning('请填写登录名、姓名与密码');
    return;
  }
  saving.value = true;
  try {
    if (editing.value) {
      await api.updateUser(editingId.value, { ...form.value, password: form.value.password || undefined });
    } else {
      await api.createUser(form.value);
    }
    ElMessage.success('保存成功');
    visible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: any) {
  const next = row.status === 1 ? 0 : 1;
  await ElMessageBox.confirm(`确定要${next ? '启用' : '停用'}用户「${row.name}」吗？`, '提示', { type: 'warning' });
  await api.updateUser(row.id, { status: next });
  ElMessage.success('状态已更新');
  load();
}

onMounted(async () => {
  depts.value = await api.departments();
  load();
});
</script>
