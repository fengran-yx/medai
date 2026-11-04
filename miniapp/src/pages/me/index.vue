<template>
  <view class="page">
    <view class="card profile">
      <view class="avatar">{{ initial }}</view>
      <view class="grow">
        <text class="name">{{ authState.user?.name || '未登录' }}</text>
        <text class="muted">{{ roleText }} · {{ authState.user?.deptName || '未绑定科室' }}</text>
      </view>
      <text class="tag tag-green">{{ roleText }}</text>
    </view>

    <view class="card">
      <view class="item">
        <text class="item-label">登录账号</text>
        <text class="item-value">{{ authState.user?.username || '-' }}</text>
      </view>
      <view class="item">
        <text class="item-label">接口地址</text>
        <text class="item-value small">{{ API_BASE }}</text>
      </view>
      <view class="item">
        <text class="item-label">客户端</text>
        <text class="item-value">微信小程序 · MVP</text>
      </view>
    </view>

    <view class="card tip-card">
      <text class="tip-title">微信登录说明</text>
      <text class="tip-text">当前版本使用院内账号登录。正式上线时需要：小程序 AppID、后端 jscode2session 换码、users.wechat_openid 绑定、订阅消息模板。</text>
    </view>

    <button class="btn-secondary logout" @click="doLogout">退出登录</button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { API_BASE } from '@/config';
import { authState, logout, roleText } from '@/stores/auth';

const initial = computed(() => (authState.user?.name || '医').slice(-2));

function doLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出当前账号吗？',
    success: (res) => {
      if (!res.confirm) return;
      logout();
      uni.reLaunch({ url: '/pages/login/index' });
    },
  });
}
</script>

<style scoped>
.profile { display: flex; align-items: center; padding: 30rpx 26rpx; }
.avatar {
  width: 96rpx; height: 96rpx; border-radius: 28rpx; margin-right: 20rpx;
  background: linear-gradient(135deg, #2ec4b0, #0b5c56);
  color: #ffffff; font-size: 30rpx; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.grow { flex: 1; min-width: 0; }
.name { display: block; font-size: 36rpx; font-weight: 800; }
.muted { display: block; margin-top: 6rpx; color: #64748b; font-size: 23rpx; }

.item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 22rpx 0; border-bottom: 1rpx solid #eef2f5;
}
.item:last-child { border-bottom: none; }
.item-label { font-size: 24rpx; color: #64748b; }
.item-value { font-size: 24rpx; color: #1e293b; max-width: 62%; text-align: right; word-break: break-all; }
.item-value.small { font-size: 20rpx; color: #94a3b8; }

.tip-card { background: #f1f8f6; }
.tip-title { display: block; font-size: 26rpx; font-weight: 700; color: #0b5c56; }
.tip-text { display: block; margin-top: 10rpx; font-size: 22rpx; color: #475569; line-height: 1.7; }

.logout { margin-top: 10rpx; }
</style>
