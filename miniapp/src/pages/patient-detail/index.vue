<template>
  <view class="page">
    <view v-if="loading" class="empty">加载中…</view>
    <template v-else-if="patient">
      <view class="card patient-head">
        <view class="row">
          <view class="avatar">{{ patient.name.slice(-2) }}</view>
          <view class="grow">
            <view class="row">
              <text class="name">{{ patient.name }}</text>
              <text class="meta-inline">{{ patient.gender }}<text v-if="patient.age !== null && patient.age !== undefined"> · {{ patient.age }}岁</text></text>
            </view>
            <text class="mrn">{{ patient.mrn }}</text>
            <text class="meta">{{ patient.phone || '未登记手机号' }} · 共 {{ patient.visits.length }} 次就诊</text>
          </view>
          <text v-if="canManage" class="edit" @click="editPatient">编辑</text>
        </view>
        <view v-if="patient.allergy" class="allergy">过敏：{{ patient.allergy }}</view>
      </view>

      <view class="row section-head">
        <text class="section-title">就诊记录</text>
        <view class="spacer" />
        <view v-if="canManage" class="add-btn" @click="toggleVisitForm">+ 新建就诊</view>
      </view>

      <view v-if="visitFormVisible" class="card visit-form">
        <text class="form-title">新建就诊</text>
        <view class="field">
          <text class="label">科室</text>
          <picker mode="selector" :range="deptNames" :value="deptIndex" @change="onDept">
            <view class="picker">{{ selectedDeptName || '请选择科室' }}<text class="arrow">›</text></view>
          </picker>
        </view>
        <view class="field">
          <text class="label">就诊类型</text>
          <picker mode="selector" :range="visitTypeLabels" :value="visitTypeIndex" @change="onVisitType">
            <view class="picker">{{ visitTypeLabels[visitTypeIndex] }}<text class="arrow">›</text></view>
          </picker>
        </view>
        <view class="field">
          <text class="label">主诉</text>
          <input v-model="visitForm.chiefComplaint" class="input" placeholder="如腹痛腹泻 6 小时" />
        </view>
        <view class="field">
          <text class="label">初步诊断</text>
          <input v-model="visitForm.diagnosis" class="input" placeholder="如急性胃肠炎" />
        </view>
        <view class="row form-actions">
          <button class="btn-secondary" @click="visitFormVisible = false">取消</button>
          <button class="btn-primary" :loading="visitSaving" @click="saveVisit">创建就诊</button>
        </view>
      </view>

      <view v-for="v in patient.visits" :key="v.id" class="card visit-card">
        <view class="row">
          <view class="grow">
            <view class="row">
              <text class="visit-no">{{ v.visit_no }}</text>
              <text class="tag tag-gray">{{ visitTypeText(v.visit_type) }}</text>
            </view>
            <text class="meta">{{ v.dept_name || '-' }} · {{ v.doctor_name || '-' }} · {{ fmt(v.visit_time) }}</text>
            <text class="diagnosis">{{ v.diagnosis || v.chief_complaint || '未填写诊断' }}</text>
          </view>
          <text v-if="v.record_id" class="link" @click="viewRecord(v.record_id)">病历 ›</text>
          <text v-else-if="canWriteVisit(v)" class="link" @click="createRecord(v)">建病历 ›</text>
        </view>
      </view>
      <view v-if="!patient.visits.length" class="empty">暂无就诊记录</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { api, type Department, type PatientDetail, type VisitRow } from '@/api';
import { authState, canQC } from '@/stores/auth';

const canManage = canQC;
const id = ref(0);
const patient = ref<PatientDetail | null>(null);
const loading = ref(false);
const departments = ref<Department[]>([]);
const visitFormVisible = ref(false);
const visitSaving = ref(false);

const visitTypes = [
  { value: 'outpatient', label: '门诊' },
  { value: 'inpatient', label: '住院' },
  { value: 'emergency', label: '急诊' },
];
const visitTypeLabels = visitTypes.map((t) => t.label);
const visitTypeIndex = ref(0);
const visitForm = reactive({ chiefComplaint: '', diagnosis: '' });

const deptNames = computed(() => departments.value.map((d) => d.name));
const deptIndex = computed(() => {
  const i = departments.value.findIndex((d) => d.id === visitFormDeptId.value);
  return i >= 0 ? i : 0;
});
const visitFormDeptId = ref(0);
const selectedDeptName = computed(() => departments.value.find((d) => d.id === visitFormDeptId.value)?.name || '');

const fmt = (s?: string | null) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const visitTypeText = (s: string) => visitTypes.find((t) => t.value === s)?.label || s;
const canWriteVisit = (v: VisitRow) => canManage.value || Number(v.doctor_id) === Number(authState.user?.id);

async function load() {
  loading.value = true;
  try {
    patient.value = await api.patient(id.value);
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function loadDepartments() {
  if (departments.value.length) return;
  try {
    departments.value = await api.departments();
  } catch {
    // 科室加载失败时仍可查看患者
  }
}

function toggleVisitForm() {
  visitFormVisible.value = !visitFormVisible.value;
  if (visitFormVisible.value) loadDepartments();
}

function onDept(e: any) {
  const d = departments.value[Number(e.detail.value)];
  visitFormDeptId.value = d?.id || 0;
}
function onVisitType(e: any) {
  visitTypeIndex.value = Number(e.detail.value);
}

async function saveVisit() {
  if (!visitFormDeptId.value) {
    uni.showToast({ title: '请选择科室', icon: 'none' });
    return;
  }
  visitSaving.value = true;
  try {
    await api.createVisit({
      patientId: id.value,
      deptId: visitFormDeptId.value,
      visitType: visitTypes[visitTypeIndex.value].value,
      chiefComplaint: visitForm.chiefComplaint,
      diagnosis: visitForm.diagnosis,
    });
    uni.showToast({ title: '就诊已创建', icon: 'success' });
    visitFormVisible.value = false;
    visitForm.chiefComplaint = '';
    visitForm.diagnosis = '';
    await load();
  } catch (e: any) {
    uni.showModal({ title: '创建失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    visitSaving.value = false;
  }
}

function editPatient() {
  uni.navigateTo({ url: `/pages/patient-edit/index?id=${id.value}` });
}
function viewRecord(recordId: number) {
  uni.navigateTo({ url: `/pages/record-detail/index?id=${recordId}` });
}
function createRecord(v: VisitRow) {
  uni.navigateTo({ url: `/pages/record-edit/index?visitId=${v.id}` });
}

onLoad((options: any) => {
  id.value = Number(options?.id || 0);
  if (!id.value) {
    uni.showToast({ title: '缺少患者ID', icon: 'none' });
    return;
  }
  load();
});

onShow(() => {
  if (id.value) load();
});
</script>

<style scoped>
.patient-head { padding: 26rpx; }
.avatar { width: 90rpx; height: 90rpx; border-radius: 28rpx; background: linear-gradient(135deg,#2ec4b0,#0b5c56); color: #fff; font-size: 28rpx; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-right: 18rpx; }
.grow { flex: 1; min-width: 0; }
.name { font-size: 36rpx; font-weight: 800; }
.meta-inline { margin-left: 12rpx; color: #64748b; font-size: 22rpx; }
.mrn { display: block; margin-top: 4rpx; color: #94a3b8; font-size: 22rpx; }
.meta { display: block; margin-top: 6rpx; color: #64748b; font-size: 22rpx; }
.edit { color: #0f8b7f; font-size: 24rpx; font-weight: 600; padding: 8rpx 0 8rpx 16rpx; }
.allergy { margin-top: 16rpx; padding: 12rpx 16rpx; background: #fdeeec; color: #b02a2f; border-radius: 10rpx; font-size: 22rpx; }
.section-head { margin: 10rpx 4rpx 16rpx; }
.section-title { font-size: 32rpx; font-weight: 800; }
.add-btn { color: #0f8b7f; font-size: 24rpx; font-weight: 600; border: 1rpx solid #b9ded7; border-radius: 999rpx; padding: 8rpx 18rpx; }
.visit-form { padding: 24rpx; }
.form-title { font-size: 28rpx; font-weight: 700; }
.field { padding: 12rpx 0; }
.label { display: block; font-size: 23rpx; color: #64748b; margin-bottom: 8rpx; }
.picker { height: 72rpx; line-height: 72rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 18rpx; font-size: 25rpx; }
.arrow { float: right; color: #94a3b8; }
.input { width: 100%; height: 72rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 18rpx; font-size: 25rpx; }
.form-actions { margin-top: 12rpx; }
.form-actions button { flex: 1; margin-right: 14rpx; height: 76rpx; line-height: 76rpx; font-size: 26rpx; }
.form-actions button:last-child { margin-right: 0; }
.visit-card { padding: 22rpx 24rpx; }
.visit-no { font-size: 26rpx; font-weight: 700; margin-right: 10rpx; }
.diagnosis { display: block; margin-top: 8rpx; color: #334155; font-size: 24rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.link { color: #0f8b7f; font-size: 24rpx; font-weight: 600; padding: 8rpx 0 8rpx 16rpx; }
.btn-secondary { background: #fff; color: #0b5c56; border: 1rpx solid #b9ded7; border-radius: 14rpx; }
.btn-secondary::after { border: none; }
</style>
