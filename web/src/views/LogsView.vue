<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">操作日志</h1>
        <p class="page-sub">关键操作全量留痕，并由 SHA-256 哈希链保证不可静默篡改</p>
      </div>
      <div class="head-actions">
        <el-button :icon="CircleCheck" :loading="verifying" @click="verify">校验完整性</el-button>
        <el-button type="primary" :icon="Download" :loading="exporting" @click="exportCsv">导出 CSV</el-button>
      </div>
    </div>

    <el-alert
      v-if="verifyResult"
      class="verify-alert"
      :type="verifyResult.ok ? 'success' : 'error'"
      :title="verifyResult.ok
        ? `审计链完整：已校验 ${verifyResult.checked} 条，链头 ${String(verifyResult.head?.lastHash || '').slice(0, 16)}…`
        : `审计链异常：第 ${verifyResult.brokenId} 条（${verifyResult.reason}），请立即排查`"
      :closable="false"
      show-icon
    />

    <div class="card">
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="操作人 / 操作内容" clearable style="width: 240px" @keyup.enter="search" />
        <el-select v-model="action" placeholder="操作类型" clearable style="width: 180px">
          <el-option label="登录" value="login" />
          <el-option label="登录失败/锁定" value="login." />
          <el-option label="AI 质控" value="record.qc" />
          <el-option label="质控复核" value="qc.review" />
          <el-option label="整改关闭" value="rectify.close" />
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
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <code class="act">{{ row.action }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="详情" min-width="240" show-overflow-tooltip />
        <el-table-column label="对象" width="130">
          <template #default="{ row }">
            <span class="muted">{{ row.target_type }}{{ row.target_id ? ` #${row.target_id}` : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="120" />
        <el-table-column label="链哈希" width="150">
          <template #default="{ row }">
            <el-tooltip :content="row.hash || '无哈希'" placement="top">
              <code class="hash">{{ row.hash ? `${String(row.hash).slice(0, 12)}…` : '—' }}</code>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination v-model:current-page="page" v-model:page-size="size" :total="total" layout="total, prev, pager, next" @change="load" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, CircleCheck, Download } from '@element-plus/icons-vue';
import { api } from '@/api';

const loading = ref(false);
const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const keyword = ref('');
const action = ref('');
const verifying = ref(false);
const exporting = ref(false);
const verifyResult = ref<any>(null);

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

async function verify() {
  verifying.value = true;
  try {
    verifyResult.value = await api.verifyLogs();
    if (!verifyResult.value.ok) ElMessage.error('审计链校验未通过，请立即排查');
  } finally {
    verifying.value = false;
  }
}

async function exportCsv() {
  exporting.value = true;
  try {
    const params = new URLSearchParams();
    if (keyword.value) params.set('keyword', keyword.value);
    if (action.value) params.set('action', action.value);
    const token = localStorage.getItem('medai_token') || '';
    const res = await fetch(`/api/logs/export.csv?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `智医质控-审计日志-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success(`已导出 ${total.value} 条审计日志`);
  } catch (err: any) {
    ElMessage.error(err.message || '导出失败');
  } finally {
    exporting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.head-actions { display: flex; gap: 8px; }
.verify-alert { margin-bottom: 14px; }
.act { font-size: 11.5px; background: #eef4f8; padding: 2px 7px; border-radius: 5px; color: #33596b; }
.hash { font-size: 11px; color: #64748b; letter-spacing: .3px; }
.pager { display: flex; justify-content: flex-end; margin-top: 14px; }
</style>
