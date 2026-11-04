<template>
  <view class="page">
    <view class="card">
      <text class="title">修改密码</text>
      <text class="sub">修改成功后旧会话立即失效，当前设备自动续期</text>
      <view class="field">
        <text class="label">当前密码</text>
        <input v-model="oldPassword" class="input" password placeholder="请输入当前密码" />
      </view>
      <view class="field">
        <text class="label">新密码</text>
        <input v-model="newPassword" class="input" password placeholder="8-64 位，含字母和数字" />
      </view>
      <view class="field">
        <text class="label">确认新密码</text>
        <input v-model="confirmPassword" class="input" password placeholder="再次输入新密码" />
      </view>
    </view>
    <button class="btn-primary save" :loading="saving" @click="save">确认修改</button>
    <text class="tip">密码不能包含登录名，不能使用常见弱口令；管理员重置他人密码请在 Web 端操作。</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { api } from '@/api';
import { setToken } from '@/stores/auth';

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const saving = ref(false);

async function save() {
  if (!oldPassword.value || !newPassword.value) {
    uni.showToast({ title: '请填写当前密码和新密码', icon: 'none' });
    return;
  }
  if (newPassword.value.length < 8 || newPassword.value.length > 64 || !/[A-Za-z]/.test(newPassword.value) || !/\d/.test(newPassword.value)) {
    uni.showToast({ title: '新密码需 8-64 位且含字母和数字', icon: 'none' });
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    uni.showToast({ title: '两次新密码不一致', icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    const data = await api.changePassword(oldPassword.value, newPassword.value);
    setToken(data.token);
    uni.showToast({ title: '密码已修改', icon: 'success' });
    setTimeout(() => uni.navigateBack({ delta: 1 }), 500);
  } catch (e: any) {
    uni.showModal({ title: '修改失败', content: e.message || '未知错误', showCancel: false });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.title { display: block; font-size: 32rpx; font-weight: 800; }
.sub { display: block; margin-top: 6rpx; color: #64748b; font-size: 21rpx; line-height: 1.6; }
.field { margin-top: 20rpx; }
.label { display: block; font-size: 22rpx; color: #64748b; margin-bottom: 6rpx; }
.input { height: 78rpx; background: #f4f7fa; border-radius: 12rpx; padding: 0 18rpx; font-size: 25rpx; }
.save { margin-top: 8rpx; height: 88rpx; line-height: 88rpx; }
.tip { display: block; margin-top: 16rpx; color: #94a3b8; font-size: 20rpx; line-height: 1.6; }
</style>
