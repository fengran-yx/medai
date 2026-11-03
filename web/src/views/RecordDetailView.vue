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
        <div class="card">
          <h3 class="card-title">AI 质控报告</h3>
          <QCPanel v-if="qcReport" :report="qcReport" />
          <div v-else class="empty-hint">
            尚未运行质控<br />
            <el-button type="primary" size="small" :icon="MagicStick" style="margin-top: 12px" @click="runQC">
              立即质控
            </el-button>
          </div>
        </div>

        <div class="card" v-if="history.length">
          <h3 class="card-title">质控历史</h3>
          <el-timeline>
            <el-timeline-item v-for="h in history" :key="h.id" :timestamp="fmt(h.created_at)" placement="top">
              <div class="his-row">
                <span class="score" :class="String(h.level).toLowerCase()">{{ h.score }} 分</span>
                <el-tag size="small" effect="plain">{{ h.level }} 级</el-tag>
                <span class="muted">{{ h.model }}</span>
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { MagicStick, DocumentChecked } from '@element-plus/icons-vue';
import { api, type QCReport } from '@/api';
import QCPanel from '@/components/QCPanel.vue';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);

const loading = ref(false);
const saving = ref(false);
const qcing = ref(false);
const record = ref<any>(null);
const form = ref<any>({});
const qcReport = ref<QCReport | null>(null);
const history = ref<any[]>([]);

const VISIT_TYPE: Record<string, string> = { outpatient: '门诊', emergency: '急诊', inpatient: '住院' };
const visitTypeText = computed(() => VISIT_TYPE[record.value?.visit_type as string] || '-');
const statusText = (s: string) => ({ draft: '草稿', submitted: '已提交', qc_passed: '质控通过', qc_failed: '质控不通过' }[s] || s);
const statusType = (s: string) => ({ draft: 'info', submitted: 'warning', qc_passed: 'success', qc_failed: 'danger' }[s] || 'info') as any;
const fmt = (s: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');

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
    if (data.latestQC) {
      qcReport.value = {
        score: Number(data.latestQC.score),
        level: data.latestQC.level,
        dimensions: {
          completeness: Number(data.latestQC.dim_completeness),
          accuracy: Number(data.latestQC.dim_accuracy),
          logic: Number(data.latestQC.dim_logic),
          terminology: Number(data.latestQC.dim_terminology),
        },
        risk: data.latestQC.risk,
        issues: typeof data.latestQC.issues === 'string' ? JSON.parse(data.latestQC.issues) : data.latestQC.issues || [],
        suggestions: typeof data.latestQC.suggestions === 'string' ? JSON.parse(data.latestQC.suggestions) : data.latestQC.suggestions || [],
        summary: data.latestQC.summary,
        model: data.latestQC.model,
        durationMs: data.latestQC.duration_ms,
      };
    }
    history.value = await api.qcHistory(id);
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
    history.value = await api.qcHistory(id);
    ElMessage.success(`质控完成：${report.score} 分（${report.level} 级）`);
  } finally {
    qcing.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.head-actions { display: flex; gap: 8px; }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(380px, 1fr); gap: 16px; align-items: start; }
.right { position: sticky; top: 12px; }

.patient-bar { display: flex; flex-wrap: wrap; gap: 28px; padding: 14px 20px; }
.pb-item { display: flex; flex-direction: column; gap: 3px; }
.pb-item span { font-size: 11.5px; color: var(--ink-500); }
.pb-item strong { font-size: 13px; font-weight: 600; }
.pb-item .danger { color: #e5484d; }

.record-form :deep(.el-form-item) { margin-bottom: 16px; }
.record-form :deep(.el-form-item__label) { font-size: 12.5px; color: var(--ink-700); padding-bottom: 4px; font-weight: 600; }

.his-row { display: flex; align-items: center; gap: 8px; }

@media (max-width: 1200px) {
  .detail-grid { grid-template-columns: 1fr; }
  .right { position: static; }
}
</style>
