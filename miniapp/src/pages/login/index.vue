<template>
  <view class="login-page">
    <view class="hero">
      <view class="logo">+</view>
      <text class="brand">智医质控 MedAI</text>
      <text class="slogan">AI 病历质控 · 人工复核 · 整改闭环</text>
      <view class="hero-tags">
        <text class="hero-tag">四维评分</text>
        <text class="hero-tag">质控工作台</text>
        <text class="hero-tag">审计留痕</text>
      </view>
    </view>

    <view class="login-card">
      <text class="login-title">院内账号登录</text>
      <text class="login-sub">质控医师 / 临床医师 / 管理员</text>

      <button class="wechat-btn" :loading="wechatLoading" @click="wechatLogin">
        微信一键登录
      </button>
      <text v-if="!wechatConfigured" class="wechat-tip">当前未配置小程序 AppID，微信登录暂不可用，请使用下方账号密码。</text>

      <view v-if="bindVisible" class="bind-box">
        <text class="bind-title">首次使用，请绑定院内账号</text>
        <text class="bind-sub">微信身份已获取，绑定后下次可一键登录</text>
        <input v-model="bindUsername" class="field-input bind-input" placeholder="院内账号" />
        <input v-model="bindPassword" class="field-input bind-input" password placeholder="院内密码" />
        <button class="btn-primary bind-btn" :loading="bindLoading" @click="doBind">绑定并登录</button>
      </view>

      <view class="divider"><text class="divider-text">或使用院内账号密码</text></view>

      <view class="field">
        <text class="field-label">账号</text>
        <input v-model="username" class="field-input" placeholder="请输入登录名" />
      </view>
      <view class="field">
        <text class="field-label">密码</text>
        <input v-model="password" class="field-input" password placeholder="请输入密码" />
      </view>

      <button class="btn-primary login-btn" :loading="loading" @click="doLogin">登 录</button>

      <view class="quick-title">演示账号（点击填充）</view>
      <view class="quick-list">
        <view v-for="item in demoAccounts" :key="item.username" class="quick-item" @click="quickFill(item.username, item.password)">
          <text class="quick-role">{{ item.role }}</text>
          <text class="quick-name">{{ item.username }}</text>
        </view>
      </view>

      <text class="login-tip">当前使用院内账号登录；微信一键登录需配置小程序 AppID 与服务端换码接口后启用。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { api } from '@/api';
import { setLogin } from '@/stores/auth';

const username = ref('quality');
const password = ref('qc123456');
const loading = ref(false);

const wechatLoading = ref(false);
const wechatConfigured = ref(false);
const bindVisible = ref(false);
const bindToken = ref('');
const bindUsername = ref('');
const bindPassword = ref('');
const bindLoading = ref(false);

const demoAccounts = [
  { role: '质控医师', username: 'quality', password: 'qc123456' },
  { role: '临床医师', username: 'doctor', password: 'doc123456' },
  { role: '管理员', username: 'admin', password: 'admin123' },
];

onLoad(() => {
  if (uni.getStorageSync('medai_token')) {
    uni.reLaunch({ url: '/pages/workbench/index' });
    return;
  }
  api.mpStatus()
    .then((data) => { wechatConfigured.value = Boolean(data.configured); })
    .catch(() => { wechatConfigured.value = false; });
});

function completeLogin(data: { token?: string; user?: any }) {
  if (!data.token || !data.user) throw new Error('登录返回数据不完整');
  setLogin(data.token, data.user);
  uni.showToast({ title: '登录成功', icon: 'success' });
  setTimeout(() => uni.reLaunch({ url: '/pages/workbench/index' }), 300);
}

async function wechatLogin() {
  if (!wechatConfigured.value) {
    uni.showToast({ title: '微信登录未配置，请使用账号密码', icon: 'none' });
    return;
  }
  wechatLoading.value = true;
  try {
    const login: any = await new Promise((resolve, reject) => {
      uni.login({
        provider: 'weixin',
        success: (res: any) => resolve(res),
        fail: (err: any) => reject(new Error(err?.errMsg || '微信登录失败')),
      });
    });
    if (!login.code) throw new Error('未获取到微信登录 code');
    const data = await api.mpLogin({ code: login.code });
    if (data.needBind) {
      bindToken.value = data.bindToken || '';
      bindVisible.value = true;
      return;
    }
    completeLogin(data);
  } catch (e: any) {
    uni.showToast({ title: e.message || '微信登录失败，请使用账号密码', icon: 'none' });
  } finally {
    wechatLoading.value = false;
  }
}

async function doBind() {
  if (!bindUsername.value || !bindPassword.value) {
    uni.showToast({ title: '请输入院内账号和密码', icon: 'none' });
    return;
  }
  bindLoading.value = true;
  try {
    const data = await api.mpLogin({
      bindToken: bindToken.value,
      username: bindUsername.value,
      password: bindPassword.value,
    });
    completeLogin(data);
  } catch (e: any) {
    uni.showToast({ title: e.message || '绑定失败', icon: 'none' });
  } finally {
    bindLoading.value = false;
  }
}

function quickFill(u: string, p: string) {
  username.value = u;
  password.value = p;
}

async function doLogin() {
  if (!username.value || !password.value) {
    uni.showToast({ title: '请输入账号和密码', icon: 'none' });
    return;
  }
  loading.value = true;
  try {
    const data = await api.login(username.value, password.value);
    setLogin(data.token, data.user);
    uni.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => uni.reLaunch({ url: '/pages/workbench/index' }), 300);
  } catch (e: any) {
    uni.showToast({ title: e.message || '登录失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #072b2b 0%, #0b5c56 46%, #f4f7fa 46%, #f4f7fa 100%);
  padding: 140rpx 40rpx 60rpx;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0 8rpx 52rpx;
}

.logo {
  width: 88rpx;
  height: 88rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #2ec4b0, #0f8b7f);
  color: #ffffff;
  font-size: 54rpx;
  line-height: 88rpx;
  text-align: center;
  font-weight: 300;
  box-shadow: 0 12rpx 32rpx rgba(34, 179, 163, 0.35);
}

.brand {
  margin-top: 22rpx;
  color: #ffffff;
  font-size: 46rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
}

.slogan {
  margin-top: 10rpx;
  color: #a9c9c5;
  font-size: 24rpx;
}

.hero-tags {
  display: flex;
  margin-top: 22rpx;
}

.hero-tag {
  color: #cfe6e3;
  background: rgba(255, 255, 255, 0.1);
  border: 1rpx solid rgba(255, 255, 255, 0.16);
  border-radius: 999rpx;
  padding: 6rpx 18rpx;
  font-size: 20rpx;
  margin-right: 12rpx;
}

.login-card {
  width: 100%;
  background: #ffffff;
  border-radius: 28rpx;
  padding: 40rpx 34rpx 34rpx;
  box-shadow: 0 20rpx 60rpx rgba(15, 23, 42, 0.14);
}

.login-title {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
}

.login-sub {
  display: block;
  margin-top: 6rpx;
  color: #64748b;
  font-size: 24rpx;
}

.wechat-btn {
  margin-top: 28rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 14rpx;
  background: #07c160;
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
}

.wechat-btn::after {
  border: none;
}

.wechat-tip {
  display: block;
  margin-top: 10rpx;
  color: #94a3b8;
  font-size: 20rpx;
  line-height: 1.6;
}

.divider {
  display: flex;
  align-items: center;
  margin: 28rpx 0 4rpx;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1rpx;
  background: #e6edf3;
}

.divider-text {
  margin: 0 16rpx;
  color: #94a3b8;
  font-size: 20rpx;
}

.bind-box {
  margin-top: 20rpx;
  padding: 22rpx;
  border-radius: 16rpx;
  background: #f1f8f6;
  border: 1rpx solid #cdeae4;
}

.bind-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #0b5c56;
}

.bind-sub {
  display: block;
  margin-top: 4rpx;
  margin-bottom: 14rpx;
  font-size: 21rpx;
  color: #64748b;
}

.bind-input {
  margin-bottom: 12rpx;
  background: #ffffff;
}

.bind-btn {
  margin-top: 6rpx;
  height: 78rpx;
  line-height: 78rpx;
  font-size: 27rpx;
}

.field {
  margin-top: 26rpx;
}

.field-label {
  display: block;
  font-size: 24rpx;
  color: #475569;
  margin-bottom: 10rpx;
}

.field-input {
  width: 100%;
  height: 86rpx;
  background: #f4f7fa;
  border-radius: 14rpx;
  padding: 0 22rpx;
  font-size: 28rpx;
}

.login-btn {
  margin-top: 34rpx;
  height: 90rpx;
  line-height: 90rpx;
}

.quick-title {
  margin-top: 34rpx;
  color: #94a3b8;
  font-size: 22rpx;
}

.quick-list {
  display: flex;
  margin-top: 14rpx;
}

.quick-item {
  flex: 1;
  background: #f8fbfd;
  border: 1rpx solid #e6edf3;
  border-radius: 14rpx;
  padding: 14rpx 0;
  margin-right: 12rpx;
  text-align: center;
}

.quick-item:last-child {
  margin-right: 0;
}

.quick-role {
  display: block;
  font-size: 22rpx;
  color: #0b5c56;
  font-weight: 600;
}

.quick-name {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #94a3b8;
}

.login-tip {
  display: block;
  margin-top: 26rpx;
  color: #94a3b8;
  font-size: 20rpx;
  line-height: 1.7;
}
</style>
