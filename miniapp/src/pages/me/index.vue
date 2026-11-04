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
        <text class="item-value">微信小程序 · 完整版</text>
      </view>
    </view>

    <view class="card menu">
      <view class="menu-item" @click="go('/pages/password/index')">
        <text class="menu-icon">密</text>
        <text class="menu-label">修改密码</text>
        <text class="menu-arrow">›</text>
      </view>
      <view v-if="canQC" class="menu-item" @click="go('/pages/rules/index')">
        <text class="menu-icon">规</text>
        <text class="menu-label">质控规则</text>
        <text class="menu-arrow">›</text>
      </view>
      <view v-if="canQC" class="menu-item" @click="go('/pages/logs/index')">
        <text class="menu-icon">审</text>
        <text class="menu-label">操作日志 / 审计校验</text>
        <text class="menu-arrow">›</text>
      </view>
      <view v-if="isAdmin" class="menu-item" @click="go('/pages/users/index')">
        <text class="menu-icon">用</text>
        <text class="menu-label">用户管理</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <view class="card menu">
      <view class="menu-item" @click="go('/pages/diagnosis/index')">
        <text class="menu-icon">诊</text>
        <text class="menu-label">AI 辅助诊断</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" @click="go('/pages/assistant/index')">
        <text class="menu-icon">助</text>
        <text class="menu-label">AI 医学助手</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" @click="go('/pages/kb/index')">
        <text class="menu-icon">知</text>
        <text class="menu-label">知识库问答（RAG）</text>
        <text class="menu-arrow">›</text>
      </view>
      <view class="menu-item" @click="go('/pages/agent/index')">
        <text class="menu-icon">智</text>
        <text class="menu-label">AI 质控助手（Agent）</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <view class="card tip-card">
      <text class="tip-title">小程序说明</text>
      <text class="tip-text">微信一键登录已接入，首次使用需绑定院内账号；管理配置（批量导入、数据导出、系统设置）仍建议在 Web 端完成。</text>
    </view>

    <button class="btn-secondary logout" @click="doLogout">退出登录</button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { API_BASE } from '@/config';
import { authState, canQC, logout, roleText } from '@/stores/auth';

const initial = computed(() => (authState.user?.name || '医').slice(-2));
const isAdmin = computed(() => authState.user?.role === 'admin');

function go(url: string) {
  uni.navigateTo({ url });
}

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

.menu { padding: 0 24rpx; }
.menu-item { display: flex; align-items: center; padding: 24rpx 0; border-bottom: 1rpx solid #eef2f5; }
.menu-item:last-child { border-bottom: none; }
.menu-icon { width: 52rpx; height: 52rpx; line-height: 52rpx; text-align: center; border-radius: 14rpx; background: #e9f7f5; color: #0b5c56; font-size: 24rpx; font-weight: 700; margin-right: 16rpx; }
.menu-label { flex: 1; font-size: 26rpx; color: #1e293b; }
.menu-arrow { color: #cbd5e1; font-size: 30rpx; }

.logout { margin-top: 10rpx; }
</style>
