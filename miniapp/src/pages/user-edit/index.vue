<template>
  <view class="page">
    <view class="card">
      <text class="title">{{ isEdit ? '编辑用户' : '新增用户' }}</text>
      <view class="field">
        <text class="label">登录名 <text class="req">*</text></text>
        <input v-model="form.username" class="input" :disabled="isEdit" placeholder="如 doctor02" />
      </view>
      <view class="field">
        <text class="label">{{ isEdit ? '重置密码（留空不改）' : '初始密码' }} <text v-if="!isEdit" class="req">*</text></text>
        <input v-model="form.password" class="input" password placeholder="8-64 位，含字母和数字" />
      </view>
      <view class="field">
        <text class="label">姓名 <text class="req">*</text></text>
        <input v-model="form.name" class="input" placeholder="真实姓名" />
      </view>
      <view class="field">
        <text class="label">角色</text>
        <picker mode="selector" :range="roleLabels" :value="roleIndex" @change="onRole">
          <view class="picker">{{ roleLabels[roleIndex] }}<text class="arrow">›</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">职称</text>
        <input v-model="form.title" class="input" placeholder="如主治医师" />
      </view>
      <view class="field">
        <text class="label">科室</text>
        <picker mode="selector" :range="deptLabels" :value="deptIndex" @change="onDept">
          <view class="picker">{{ deptLabels[deptIndex] }}<text class="arrow">›</text></view>
        </picker>
      </view>
      <view class="field">
        <text class="label">手机号</text>
        <input v-model="form.phone" class="input" type="number" maxlength="11" placeholder="选填" />
      </view>
    </view>

    <button class="btn-primary save" :loading="saving" @click="save">保存</button>
    <text class="tip">重置密码或修改角色后，该用户旧 token 会失效，需要重新登录。</text>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { api } from '@/api';
import { authState } from '@/stores/auth';

const id = ref(0);
const isEdit = computed(() => id.value > 0);
const saving = ref(false);
const departments = ref<any[]>([]);
const form = reactive({
  username: '',
  password: '',
  name: '',
  role: 'clinician',
  title: '',
  deptId: 0,
  phone: '',
});

const roles = [
  { value: 'admin', label: '系统管理员' },
  { value: 'quality', label: '质控医师' },
  { value: 'clinician', label: '临床医师' },
];
const roleLabels = roles.map((r) => r.label);
const roleIndex = computed(() => Math.max(0, roles.findIndex((r) => r.value === form.role)));

const deptLabels = computed(() => ['无科室', ...departments.value.map((d) => d.name)]);
const deptIndex = computed(() => {
  const i = departments.value.findIndex((d) => Number(d.id) === Number(form.deptId));
  return i >= 0 ? i + 1 : 0;
});

onLoad(async (options: any) => {
  if (authState.user?.role !== 'admin') {
    uni.showToast({ title: '仅管理员可访问', icon: 'none' });
    setTimeout(() => uni.navigateBack({ delta: 1 }), 500);
    return;
  }
  id.value = Number(options?.id || 0);
  try {
    departments.value = await api.departments();
    if (id.value) {
      const users = await api.users();
      const u = users.find((x: any) => Number(x.id) === id.value);
      if (!u) throw new Error('用户不存在');
      form.username = u.username;
      form.name = u.name;
      form.role = u.role;
      form.title = u.title || '';
      form.deptId = Number(u.dept_id || 0);
      form.phone = u.phone || '';
    }
  } catch (e: any) {
    uni.showModal({ title: '加载失败', content: e.message || '未知错误', showCancel: false });
  }
});

function onRole(e: any) {
  form.role = roles[Number(e.detail.value)]?.value || 'clinician';
}
function onDept(e: any) {
  const i = Number(e.detail.value);
  form.deptId = i > 0 ? Number(departments.value[i - 1]?.id || 0) : 0;
}

async function save() {
  if (!form.username.trim() || !form.name.trim()) {
    uni.showToast({ title: '登录名和姓名必填', icon: 'none' });
    return;
  }
  if (!isEdit.value && !form.password) {
    uni.showToast({ title: '请填写初始密码', icon: 'none' });
    return;
  }
  if (form.password && (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))) {
    uni.showToast({ title: '密码需 8-64 位且含字母和数字', icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    const payload = {
      username: form.username.trim(),
      name: form.name.trim(),
      role: form.role,
      title: form.title || null,
      deptId: form.deptId || null,
      phone: form.phone || null,
      ...(form.password ? { password: form.password } : {}),
    };
    if (isEdit.value) await api.updateUser(id.value, payload);
    else await api.createUser(payload);
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
.title { display: block; font-size: 32rpx; font-weight: 800; margin-bottom: 10rpx; }
.field { padding: 14rpx 0; border-top: 1rpx solid #eef2f5; }
.field:first-of-type { border-top: none; }
.label { display: block; font-size: 22rpx; color: #64748b; margin-bottom: 6rpx; }
.req { color: #e5484d; }
.input { width: 100%; height: 74rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 18rpx; font-size: 25rpx; }
.picker { height: 74rpx; line-height: 74rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 18rpx; font-size: 25rpx; }
.arrow { float: right; color: #94a3b8; }
.save { margin-top: 6rpx; height: 88rpx; line-height: 88rpx; }
.tip { display: block; margin-top: 16rpx; color: #94a3b8; font-size: 20rpx; line-height: 1.6; }
</style>
