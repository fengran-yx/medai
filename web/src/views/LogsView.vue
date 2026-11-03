<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">操作日志</h1>
        <p class="page-sub">系统关键操作留痕，满足医疗信息系统审计要求</p>
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="操作人 / 操作内容" clearable style="width: 240px" @keyup.enter="search" />
        <el-select v-model="action" placeholder="操作类型" clearable style="width: 180px">
          <el-option label="登录" value="login" />
          <el-option label="AI 质控" value="record.qc" />
          <el-option label="新建患者" value="patient.create" />
          <el-option label="辅助诊断" value="ai.diagnosis" />
          <el-option label="规则调整" value="rule.update" />
        </el-select>
        <el-button :icon="Search" @click="search">查询</el-button>
        <div class="spacer" />
        <span class="muted">共 {{ total }} 条</span>
      </div>

      <el-table v-loading="loading" :data="rows">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="user_name" label="操作人" width="100" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <code class="act">{{ row.action }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="详情" min-width="260" show-overflow-tooltip />
        <el-table-column label="对象" width="140">
          <template #default="{ row }">
            <span class="muted">{{ row.target_type }}{{ row.target_id ? ` #${row.target_id}` : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="130" />
      </el-table>

      <div class="pager">
        <el-pagination v-model:current-page="page" v-model:page-size="size" :total="total" layout="total, prev, pager, next" @change="load" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { api } from '@/api';

const loading = ref(false);
const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const keyword = ref('');
const action = ref('');

const fmt = (s: string) => (s ? String(s).slice(0, 19).replace('T', ' ') : '-');

async function load() {
  loading.value = true;
  try {
    const data = await api.logs({ page: page.value, size: size.value, keyword: keyword.value, action: action.value });
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

onMounted(load);
</script>

<style scoped>
.act { font-size: 11.5px; background: #eef4f8; padding: 2px 7px; border-radius: 5px; color: #33596b; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>
