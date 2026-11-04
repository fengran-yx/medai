<template>
  <view class="page">
    <view v-if="loading" class="empty">加载中…</view>
    <template v-else>
      <view class="card head-card">
        <view class="row">
          <view class="grow">
            <text class="title">{{ isEdit ? '编辑病历' : '新建病历' }}</text>
            <text class="meta">{{ patientName || '患者' }}<text v-if="deptName"> · {{ deptName }}</text><text v-if="doctorName"> · {{ doctorName }}</text></text>
          </view>
          <text v-if="isEdit" class="tag" :class="statusTagClass(recordStatus)">{{ statusText(recordStatus) }}</text>
        </view>
        <text v-if="visitNo" class="muted">就诊号 {{ visitNo }}<text v-if="visitTime"> · {{ fmt(visitTime) }}</text></text>
      </view>

      <view class="card">
        <view v-for="field in fields" :key="field.key" class="field">
          <text class="label">{{ field.label }}<text v-if="field.required" class="req"> *</text></text>
          <textarea
            v-model="form[field.key]"
            class="textarea"
            :placeholder="field.placeholder"
            :maxlength="field.maxlength || 2000"
            auto-height
          />
        </view>
      </view>

      <view class="actions">
        <button class="btn-secondary" :loading="saving === 'draft'" @click="save('draft')">保存草稿</button>
        <button class="btn-primary" :loading="saving === 'qc'" @click="save('qc')">保存并质控</button>
      </view>
      <text class="tip">提交质控后 AI 会按完整性、准确性、逻辑性、规范性四维评分；不通过会自动生成整改任务。</text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { api } from '@/api';

const recordId = ref(0);
const visitId = ref(0);
const loading = ref(false);
const saving = ref<'' | 'draft' | 'qc'>('');
const patientName = ref('');
const deptName = ref('');
const doctorName = ref('');
const visitNo = ref('');
const visitTime = ref('');
const recordStatus = ref('draft');

const isEdit = computed(() => recordId.value > 0);
const fields = [
  { key: 'chief_complaint', label: '主诉', required: true, placeholder: '主要症状 + 持续时间，如腹痛腹泻 6 小时', maxlength: 200 },
  { key: 'present_illness', label: '现病史', required: true, placeholder: '起病、演变、伴随症状、诊疗经过', maxlength: 2000 },
  { key: 'past_history', label: '既往史', required: false, placeholder: '既往疾病、手术、用药、过敏史', maxlength: 1000 },
  { key: 'physical_exam', label: '体格检查', required: true, placeholder: '生命体征、专科查体', maxlength: 2000 },
  { key: 'auxiliary_exam', label: '辅助检查', required: false, placeholder: '检验、影像、心电图等', maxlength: 2000 },
  { key: 'diagnosis', label: '诊断', required: true, placeholder: '主要诊断，尽量使用标准疾病名称', maxlength: 500 },
  { key: 'treatment', label: '处理意见', required: true, placeholder: '治疗方案、用药、随访计划', maxlength: 2000 },
] as const;

const form = reactive<Record<string, string>>({
  chief_complaint: '',
  present_illness: '',
  past_history: '',
  physical_exam: '',
  auxiliary_exam: '',
  diagnosis: '',
  treatment: '',
});

const fmt = (s?: string | null) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const statusText = (s: string) => ({ draft: '草稿', submitted: '已提交', qc_passed: '质控通过', qc_failed: '质控不通过' } as Record<string, string>)[s] || s;
const statusTagClass = (s: string) => ({ draft: 'tag-gray', submitted: 'tag-amber', qc_passed: 'tag-green', qc_failed: 'tag-red' } as Record<string, string>)[s] || 'tag-gray';

async function load() {
  loading.value = true;
  try {
    if (recordId.value) {
      const data = await api.record(recordId.value);
      visitId.value = Number((data as any).visit_id || visitId.value);
      patientName.value = data.patient_name;
      deptName.value = data.dept_name || '';
      doctorName.value = data.doctor_name || '';
      visitNo.value = data.visit_no;
      visitTime.value = data.visit_time;
      recordStatus.value = data.status;
      form.chief_complaint = data.chief_complaint || '';
      form.present_illness = data.present_illness || '';
      form.past_history = data.past_history || '';
      form.physical_exam = data.physical_exam || '';
      form.auxiliary_exam = data.auxiliary_exam || '';
      form.diagnosis = data.diagnosis || '';
      form.treatment = data.treatment || '';
    } else if (visitId.value) {
      const v = await api.visit(visitId.value);
      patientName.value = v.patient_name || '';
      deptName.value = v.dept_name || '';
      doctorName.value = v.doctor_name || '';
      visitNo.value = v.visit_no;
      visitTime.value = v.visit_time;
      form.chief_complaint = v.chief_complaint || '';
      form.diagnosis = v.diagnosis || '';
    }
  } catch (e: any) {
    uni.showModal({ title: '加载失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    loading.value = false;
  }
}

async function save(mode: 'draft' | 'qc') {
  if (!visitId.value) {
    uni.showToast({ title: '缺少就诊信息', icon: 'none' });
    return;
  }
  if (mode === 'qc') {
    if (!form.chief_complaint.trim() || !form.present_illness.trim() || !form.physical_exam.trim() || !form.diagnosis.trim() || !form.treatment.trim()) {
      uni.showToast({ title: '主诉/现病史/查体/诊断/处理意见不能为空', icon: 'none' });
      return;
    }
  }
  saving.value = mode;
  uni.showLoading({ title: mode === 'qc' ? '保存并质控…' : '保存中…', mask: true });
  try {
    const payload = {
      visitId: visitId.value,
      chief_complaint: form.chief_complaint,
      present_illness: form.present_illness,
      past_history: form.past_history,
      physical_exam: form.physical_exam,
      auxiliary_exam: form.auxiliary_exam,
      diagnosis: form.diagnosis,
      treatment: form.treatment,
    };
    if (!recordId.value) {
      const created = await api.createRecord(payload);
      recordId.value = created.id;
    } else {
      await api.updateRecord(recordId.value, payload);
    }
    if (mode === 'qc') {
      await api.updateRecord(recordId.value, { status: 'submitted' });
      const report = await api.runQC(recordId.value);
      uni.hideLoading();
      uni.showToast({ title: `质控完成：${report.score} 分`, icon: 'none' });
      setTimeout(() => uni.redirectTo({ url: `/pages/record-detail/index?id=${recordId.value}` }), 600);
    } else {
      uni.hideLoading();
      uni.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => uni.redirectTo({ url: `/pages/record-detail/index?id=${recordId.value}` }), 400);
    }
  } catch (e: any) {
    uni.hideLoading();
    uni.showModal({ title: '保存失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    saving.value = '';
  }
}

onLoad((options: any) => {
  recordId.value = Number(options?.id || 0);
  visitId.value = Number(options?.visitId || 0);
  if (!recordId.value && !visitId.value) {
    uni.showToast({ title: '缺少病历或就诊参数', icon: 'none' });
    return;
  }
  load();
});
</script>

<style scoped>
.head-card { padding: 24rpx; }
.title { display: block; font-size: 34rpx; font-weight: 800; }
.meta { display: block; margin-top: 6rpx; color: #64748b; font-size: 23rpx; }
.muted { display: block; margin-top: 10rpx; color: #94a3b8; font-size: 22rpx; }
.field { padding: 16rpx 0; border-top: 1rpx solid #eef2f5; }
.field:first-child { border-top: none; }
.label { display: block; font-size: 24rpx; color: #475569; font-weight: 600; margin-bottom: 8rpx; }
.req { color: #e5484d; }
.textarea { width: 100%; min-height: 88rpx; background: #f4f7fa; border-radius: 12rpx; padding: 16rpx 18rpx; font-size: 25rpx; line-height: 1.7; }
.actions { display: flex; margin-top: 8rpx; }
.actions button { flex: 1; height: 88rpx; line-height: 88rpx; margin-right: 16rpx; }
.actions button:last-child { margin-right: 0; }
.btn-secondary { background: #fff; color: #0b5c56; border: 1rpx solid #b9ded7; border-radius: 16rpx; font-size: 28rpx; }
.btn-secondary::after { border: none; }
.tip { display: block; margin-top: 18rpx; color: #94a3b8; font-size: 21rpx; line-height: 1.6; }
</style>
