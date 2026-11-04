<template>
  <div class="layout">
    <div v-if="mobileOpen" class="mask" @click="mobileOpen = false" />
    <aside class="sidebar" :class="{ open: mobileOpen }">
      <button class="close-btn" @click="mobileOpen = false">✕</button>
      <div class="logo">
        <div class="logo-mark">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
        <div class="logo-text">
          <strong>智医质控</strong>
          <span>MedAI Platform</span>
        </div>
      </div>

      <nav class="menu">
        <router-link
          v-for="item in menus"
          :key="item.name"
          :to="{ name: item.name }"
          class="menu-item"
          :class="{ active: isActive(item.name) }"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </router-link>
      </nav>

      <div class="ai-badge">
        <div class="dot" :class="{ remote: aiRemote }" />
        <div>
          <div class="ai-title">{{ aiRemote ? 'DeepSeek 已接入' : '规则引擎模式' }}</div>
          <div class="ai-sub">AI 质控 · 辅助诊断</div>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="crumb">
          <button class="menu-btn" @click="mobileOpen = true" aria-label="菜单">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span class="crumb-root">工作台</span>
          <el-icon><ArrowRight /></el-icon>
          <span class="crumb-cur">{{ route.meta.title }}</span>
        </div>
        <div class="topbar-right">
          <el-tag size="small" effect="plain" type="success">{{ roleText }}</el-tag>
          <el-dropdown trigger="click" @command="onCommand">
            <div class="user">
              <el-avatar :size="30" class="avatar">{{ auth.user?.name?.slice(-2) }}</el-avatar>
              <div class="user-meta">
                <div class="user-name">{{ auth.user?.name }}</div>
                <div class="user-sub">{{ auth.user?.deptName || '信息科' }}</div>
              </div>
              <el-icon><CaretBottom /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>

    <el-dialog v-model="pwdVisible" title="修改密码" width="420px">
      <el-form :model="pwdForm" label-width="80px">
        <el-form-item label="原密码">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="至少 8 位，含字母和数字" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="changePwd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const aiRemote = ref(false);
const mobileOpen = ref(false);
watch(() => route.fullPath, () => { mobileOpen.value = false; });
const pwdVisible = ref(false);
const pwdLoading = ref(false);
const pwdForm = ref({ oldPassword: '', newPassword: '' });

const menus = computed(() => [
  { name: 'dashboard', title: '质控驾驶舱', icon: 'DataBoard' },
  { name: 'workbench', title: '质控工作台', icon: 'Files' },
  { name: 'records', title: '病历质控', icon: 'DocumentChecked' },
  { name: 'patients', title: '患者管理', icon: 'User' },
  { name: 'diagnosis', title: 'AI 辅助诊断', icon: 'FirstAidKit' },
  { name: 'assistant', title: 'AI 医学助手', icon: 'ChatDotRound' },
  { name: 'kb', title: '知识库问答', icon: 'Collection' },
  { name: 'agent', title: 'AI 质控助手', icon: 'MagicStick' },
  { name: 'rules', title: '质控规则', icon: 'SetUp' },
  ...(auth.canQC ? [{ name: 'logs', title: '操作日志', icon: 'Tickets' }] : []),
  ...(auth.isAdmin ? [{ name: 'users', title: '用户管理', icon: 'UserFilled' }] : []),
]);

const roleText = computed(
  () => ({ admin: '系统管理员', quality: '质控医师', clinician: '临床医师' }[auth.user?.role as string] || '用户'),
);

const isActive = (name: string) => route.name === name || (name === 'records' && route.name === 'record-detail');

async function onCommand(cmd: string) {
  if (cmd === 'password') {
    pwdForm.value = { oldPassword: '', newPassword: '' };
    pwdVisible.value = true;
    return;
  }
  if (cmd === 'logout') {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' });
    auth.logout();
    router.push('/login');
  }
}

async function changePwd() {
  if (!pwdForm.value.newPassword || pwdForm.value.newPassword.length < 8) {
    ElMessage.warning('新密码至少 8 位，且需同时包含字母和数字');
    return;
  }
  pwdLoading.value = true;
  try {
    const res = await api.changePassword(pwdForm.value.oldPassword, pwdForm.value.newPassword);
    if (res?.token) auth.setToken(res.token);
    ElMessage.success('密码已更新，其他设备登录已失效');
    pwdVisible.value = false;
  } finally {
    pwdLoading.value = false;
  }
}

onMounted(async () => {
  await auth.refresh();
  try {
    const status = await api.aiStatus();
    aiRemote.value = status.remote;
  } catch { /* ignore */ }
});
</script>

<style scoped>
.mask { display: none; }
.menu-btn { display: none; }
.close-btn { display: none; }

.layout { display: flex; height: 100%; }

.sidebar {
  width: 232px;
  flex: none;
  background: linear-gradient(180deg, #072b2b 0%, #062222 100%);
  color: #cfe6e3;
  display: flex;
  flex-direction: column;
  padding: 18px 14px;
}

.logo { display: flex; align-items: center; gap: 10px; padding: 4px 8px 20px; }
.logo-mark {
  width: 38px; height: 38px; border-radius: 11px;
  display: grid; place-items: center; font-size: 20px;
  background: linear-gradient(135deg, var(--brand-400), var(--brand-600));
  box-shadow: 0 6px 16px rgba(34, 179, 163, 0.28);
}
.logo-text { display: flex; flex-direction: column; line-height: 1.25; }
.logo-text strong { color: #fff; font-size: 16px; letter-spacing: 0.5px; }
.logo-text span { font-size: 10.5px; color: #6ea39d; letter-spacing: 1px; text-transform: uppercase; }

.menu { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.menu-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 9px;
  color: #a9c9c5; font-size: 13.5px; text-decoration: none;
  transition: all 0.18s ease;
}
.menu-item:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
.menu-item.active {
  background: linear-gradient(90deg, rgba(34, 179, 163, 0.22), rgba(34, 179, 163, 0.06));
  color: #fff;
  box-shadow: inset 2px 0 0 var(--brand-400);
}

.ai-badge {
  display: flex; align-items: center; gap: 10px;
  padding: 12px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.07);
}
.ai-badge .dot { width: 8px; height: 8px; border-radius: 50%; background: #f5a524; box-shadow: 0 0 8px #f5a524; }
.ai-badge .dot.remote { background: #22b3a3; box-shadow: 0 0 8px #22b3a3; }
.ai-title { font-size: 12.5px; color: #e8f4f2; }
.ai-sub { font-size: 10.5px; color: #6ea39d; margin-top: 2px; }

.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.topbar {
  height: 60px; flex: none;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}

.crumb { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-500); }
.crumb-cur { color: var(--ink-900); font-weight: 600; }

.topbar-right { display: flex; align-items: center; gap: 14px; }
.user { display: flex; align-items: center; gap: 9px; cursor: pointer; padding: 4px 8px; border-radius: 8px; }
.user:hover { background: #f1f5f9; }
.avatar { background: linear-gradient(135deg, var(--brand-500), var(--brand-700)); font-size: 12px; }
.user-meta { line-height: 1.25; }
.user-name { font-size: 13px; font-weight: 600; }
.user-sub { font-size: 11px; color: var(--ink-500); }

.content { flex: 1; overflow: auto; }

@media (max-width: 900px) {
  .sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; width: 232px; z-index: 1001;
    transform: translateX(-100%); transition: transform .25s ease;
  }
  .sidebar.open { transform: translateX(0); }
  .mask { display: block; position: fixed; inset: 0; background: rgba(15, 23, 42, .45); z-index: 1000; }
  .close-btn {
    display: block; position: absolute; right: 10px; top: 10px;
    width: 26px; height: 26px; border: none; border-radius: 6px;
    background: rgba(255,255,255,.1); color: #cfe6e3; cursor: pointer; font-size: 12px;
  }
  .menu-btn {
    display: grid; place-items: center; width: 30px; height: 30px; margin-right: 6px;
    border: none; background: transparent; color: var(--ink-700); cursor: pointer; font-size: 16px;
  }
  .topbar { height: 54px; padding: 0 12px; }
  .crumb-root { display: none; }
  .crumb .el-icon { display: none; }
  .user-meta { display: none; }
  .content { -webkit-overflow-scrolling: touch; }
}
</style>