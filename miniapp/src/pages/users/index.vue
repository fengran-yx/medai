<template>
  <view class="page">
    <view class="row head">
      <view>
        <text class="title">用户管理</text>
        <text class="sub">院内账号、角色、锁定与强制下线</text>
      </view>
      <view class="add-btn" @click="addUser">+ 新增</view>
    </view>

    <view v-for="row in rows" :key="row.id" class="card user-card">
      <view class="row">
        <view class="avatar" :class="row.role">{{ row.name.slice(-2) }}</view>
        <view class="grow">
          <view class="row">
            <text class="name">{{ row.name }}</text>
            <text class="tag" :class="roleTag(row.role)">{{ roleText(row.role) }}</text>
            <text v-if="isLocked(row)" class="tag tag-red">已锁定</text>
            <text v-else-if="row.status !== 1" class="tag tag-gray">已停用</text>
          </view>
          <text class="username">@{{ row.username }}<text v-if="row.dept_name"> · {{ row.dept_name }}</text></text>
          <text class="meta">{{ row.title || '未设置职称' }} · {{ row.phone || '未登记手机号' }}</text>
          <text class="meta">最近登录 {{ fmt(row.last_login_at) }}<text v-if="row.failed_attempts > 0"> · 失败 {{ row.failed_attempts }} 次</text></text>
        </view>
      </view>
      <view class="row actions">
        <text class="action" @click="editUser(row)">编辑</text>
        <text v-if="isLocked(row)" class="action warn" @click="unlock(row)">解锁</text>
        <text class="action" @click="forceLogout(row)">强制下线</text>
        <text class="action" :class="{ danger: row.status === 1 }" @click="toggleStatus(row)">{{ row.status === 1 ? '停用' : '启用' }}</text>
      </view>
    </view>
    <view v-if="!rows.length" class="empty">加载中…</view>
    <text class="tip">密码重置、角色调整建议在 Web 端完成；小程序提供解锁与强制下线应急操作。</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '@/api';
import { authState } from '@/stores/auth';

const rows = ref<any[]>([]);
const fmt = (s?: string) => (s ? String(s).slice(0, 16).replace('T', ' ') : '-');
const roleText = (r: string) => ({ admin: '管理员', quality: '质控', clinician: '临床' } as Record<string, string>)[r] || r;
const roleTag = (r: string) => ({ admin: 'tag-red', quality: 'tag-amber', clinician: 'tag-green' } as Record<string, string>)[r] || 'tag-gray';
const isLocked = (row: any) => Boolean(row.locked_until) && new Date(String(row.locked_until).replace(' ', 'T')).getTime() > Date.now();

async function load() {
  if (authState.user?.role !== 'admin') {
    uni.showToast({ title: '仅管理员可访问', icon: 'none' });
    return;
  }
  try {
    rows.value = await api.users();
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  }
}

function addUser() {
  uni.navigateTo({ url: '/pages/user-edit/index' });
}
function editUser(row: any) {
  uni.navigateTo({ url: `/pages/user-edit/index?id=${row.id}` });
}

async function unlock(row: any) {
  try {
    await api.updateUser(row.id, { unlock: true });
    uni.showToast({ title: '已解锁', icon: 'success' });
    await load();
  } catch (e: any) {
    uni.showModal({ title: '解锁失败', content: e.message || '未知错误', showCancel: false });
  }
}

async function forceLogout(row: any) {
  const res = await uni.showModal({ title: '强制下线', content: `让「${row.name}」所有设备立即退出？`, confirmColor: '#e5484d' });
  if (!res.confirm) return;
  try {
    await api.updateUser(row.id, { forceLogout: true });
    uni.showToast({ title: '已强制下线', icon: 'none' });
  } catch (e: any) {
    uni.showModal({ title: '操作失败', content: e.message || '未知错误', showCancel: false });
  }
}

async function toggleStatus(row: any) {
  const next = row.status === 1 ? 0 : 1;
  const res = await uni.showModal({ title: next ? '启用账号' : '停用账号', content: `确定${next ? '启用' : '停用'}「${row.name}」？`, confirmColor: next ? '#0f8b7f' : '#e5484d' });
  if (!res.confirm) return;
  try {
    await api.updateUser(row.id, { status: next });
    uni.showToast({ title: '已更新', icon: 'success' });
    await load();
  } catch (e: any) {
    uni.showModal({ title: '操作失败', content: e.message || '未知错误', showCancel: false });
  }
}

onShow(load);
</script>

<style scoped>
.head { padding: 8rpx 4rpx 18rpx; align-items: flex-start; }
.title { display: block; font-size: 38rpx; font-weight: 800; }
.sub { display: block; margin-top: 4rpx; color: #64748b; font-size: 21rpx; }
.add-btn { color: #0f8b7f; border: 1rpx solid #b9ded7; border-radius: 999rpx; padding: 8rpx 20rpx; font-size: 24rpx; font-weight: 600; }
.user-card { padding: 22rpx; }
.avatar { width: 78rpx; height: 78rpx; border-radius: 24rpx; color: #fff; font-size: 24rpx; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-right: 16rpx; background: #0f8b7f; flex: none; }
.avatar.admin { background: #c0353a; }
.avatar.quality { background: #b7791f; }
.grow { flex: 1; min-width: 0; }
.name { font-size: 28rpx; font-weight: 700; margin-right: 8rpx; }
.username { display: block; margin-top: 4rpx; color: #64748b; font-size: 21rpx; }
.meta { display: block; margin-top: 4rpx; color: #94a3b8; font-size: 20rpx; }
.actions { margin-top: 14rpx; padding-top: 12rpx; border-top: 1rpx solid #eef2f5; justify-content: flex-end; }
.action { color: #0f8b7f; font-size: 22rpx; margin-left: 20rpx; }
.action.warn { color: #a86400; }
.action.danger { color: #c0353a; }
.tip { display: block; margin-top: 8rpx; color: #94a3b8; font-size: 20rpx; line-height: 1.6; }
</style>
