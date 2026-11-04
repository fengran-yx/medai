<template>
  <view class="page">
    <view class="card">
      <view class="section-title">{{ isEdit ? '编辑患者' : '新增患者' }}</view>
      <view class="field">
        <text class="label">病案号 <text class="req">*</text></text>
        <input v-model="form.mrn" class="input" :disabled="isEdit" placeholder="如 MRN20260001" />
      </view>
      <view class="field">
        <text class="label">姓名 <text class="req">*</text></text>
        <input v-model="form.name" class="input" placeholder="患者姓名" />
      </view>
      <view class="field">
        <text class="label">性别</text>
        <picker mode="selector" :range="genders" :value="genderIndex" @change="onGender">
          <view class="picker">{{ form.gender || '请选择' }}<text class="arrow">›</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">出生日期</text>
        <picker mode="date" :value="form.birthDate || today" :end="today" @change="onBirth">
          <view class="picker">{{ form.birthDate || '请选择' }}<text class="arrow">›</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">身份证号</text>
        <input v-model="form.idCard" class="input" placeholder="选填" maxlength="18" />
      </view>
      <view class="field">
        <text class="label">手机号</text>
        <input v-model="form.phone" class="input" type="number" placeholder="选填" maxlength="11" />
      </view>
      <view class="field">
        <text class="label">血型</text>
        <picker mode="selector" :range="bloodTypes" :value="bloodIndex" @change="onBlood">
          <view class="picker">{{ form.bloodType || '请选择' }}<text class="arrow">›</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">过敏史</text>
        <textarea v-model="form.allergy" class="textarea" placeholder="如青霉素过敏；无则留空" maxlength="200" />
      </view>
    </view>

    <button class="btn-primary save-btn" :loading="saving" @click="save">保存</button>
    <text class="tip">患者主索引通常由登记处/HIS 维护；重复病案号会被拒绝。</text>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { api } from '@/api';

const id = ref(0);
const isEdit = computed(() => id.value > 0);
const saving = ref(false);
const today = new Date().toISOString().slice(0, 10);

const genders = ['男', '女', '未知'];
const bloodTypes = ['A', 'B', 'AB', 'O', 'Rh阴性', '不详'];
const form = reactive({
  mrn: '',
  name: '',
  gender: '男',
  birthDate: '',
  idCard: '',
  phone: '',
  bloodType: '',
  allergy: '',
});

const genderIndex = computed(() => Math.max(0, genders.indexOf(form.gender)));
const bloodIndex = computed(() => Math.max(0, bloodTypes.indexOf(form.bloodType)));

onLoad(async (options: any) => {
  id.value = Number(options?.id || 0);
  if (!id.value) return;
  try {
    const data = await api.patient(id.value);
    form.mrn = data.mrn || '';
    form.name = data.name || '';
    form.gender = data.gender || '男';
    form.birthDate = data.birth_date ? String(data.birth_date).slice(0, 10) : '';
    form.idCard = data.id_card || '';
    form.phone = data.phone || '';
    form.bloodType = data.blood_type || '';
    form.allergy = data.allergy || '';
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  }
});

function onGender(e: any) {
  form.gender = genders[Number(e.detail.value)] || '男';
}
function onBirth(e: any) {
  form.birthDate = e.detail.value;
}
function onBlood(e: any) {
  form.bloodType = bloodTypes[Number(e.detail.value)] || '';
}

async function save() {
  if (!form.mrn.trim() || !form.name.trim()) {
    uni.showToast({ title: '病案号和姓名必填', icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    const payload = {
      mrn: form.mrn.trim(),
      name: form.name.trim(),
      gender: form.gender,
      birthDate: form.birthDate || null,
      idCard: form.idCard || null,
      phone: form.phone || null,
      bloodType: form.bloodType || null,
      allergy: form.allergy || null,
    };
    if (isEdit.value) {
      await api.updatePatient(id.value, payload);
    } else {
      await api.createPatient(payload as any);
    }
    uni.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => uni.navigateBack({ delta: 1 }), 400);
  } catch (e: any) {
    uni.showModal({ title: '保存失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.section-title { font-size: 32rpx; font-weight: 800; margin-bottom: 20rpx; }
.field { padding: 16rpx 0; border-top: 1rpx solid #eef2f5; }
.field:first-of-type { border-top: none; }
.label { display: block; font-size: 23rpx; color: #64748b; margin-bottom: 8rpx; }
.req { color: #e5484d; }
.input { width: 100%; height: 76rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 18rpx; font-size: 26rpx; }
.picker { height: 76rpx; line-height: 76rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 18rpx; font-size: 26rpx; color: #1e293b; }
.arrow { float: right; color: #94a3b8; }
.textarea { width: 100%; min-height: 120rpx; background: #f4f7fa; border-radius: 12rpx; padding: 16rpx 18rpx; font-size: 25rpx; }
.save-btn { margin-top: 8rpx; height: 88rpx; line-height: 88rpx; }
.tip { display: block; margin-top: 18rpx; color: #94a3b8; font-size: 21rpx; line-height: 1.6; }
</style>
