<template>
  <div class="login">
    <section class="brand">
      <div class="brand-inner">
        <div class="brand-logo">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8fd3ca" stroke-width="2.2" stroke-linecap="round" style="vertical-align: -3px; margin-right: 6px">
            <path d="M12 5v14M5 12h14" />
          </svg>
          智医质控 · MedAI
        </div>
        <h1>让每一份病历<br />都经得起质控审查</h1>
        <p class="brand-desc">
          面向医院病案质量的 AI 平台：自动识别缺项、逻辑矛盾与术语不规范，
          并给出可执行的整改建议。
        </p>
        <ul class="bullets">
          <li><span>·</span> 四维度评分：完整性 / 准确性 / 逻辑性 / 规范性</li>
          <li><span>·</span> 接入 DeepSeek 大模型，未配置 Key 时自动降级规则引擎</li>
          <li><span>·</span> 质控看板、辅助诊断、医学问答一体化</li>
        </ul>
        <div class="stats">
          <div><strong>36</strong><em>演示病历</em></div>
          <div><strong>12</strong><em>质控规则</em></div>
          <div><strong>3</strong><em>角色权限</em></div>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="form-wrap">
        <h2>登录系统</h2>
        <p class="sub">请使用院内工号账号登录</p>

        <el-form :model="form" size="large" @keyup.enter="submit">
          <el-form-item>
            <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" />
          </el-form-item>
          <el-form-item>
            <el-input v-model="form.password" type="password" placeholder="密码" show-password :prefix-icon="Lock" />
          </el-form-item>
          <el-button type="primary" class="submit" :loading="loading" @click="submit">登 录</el-button>
        </el-form>

        <div class="demo">
          <div class="demo-title">演示账号（点击填充）</div>
          <div class="demo-list">
            <button v-for="a in accounts" :key="a.username" class="demo-item" @click="fill(a)">
              <span class="role">{{ a.role }}</span>
              <code>{{ a.username }} / {{ a.password }}</code>
            </button>
          </div>
        </div>
        <p class="foot">MedAI · 医疗数据仅用于演示，请勿录入真实患者信息</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const form = ref({ username: 'quality', password: 'qc123456' });
const loading = ref(false);

const accounts = [
  { role: '质控医师', username: 'quality', password: 'qc123456' },
  { role: '临床医师', username: 'doctor', password: 'doc123456' },
  { role: '管理员', username: 'admin', password: 'admin123' },
];

function fill(a: { username: string; password: string }) {
  form.value.username = a.username;
  form.value.password = a.password;
}

async function submit() {
  if (!form.value.username || !form.value.password) {
    ElMessage.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    const user = await auth.login(form.value.username, form.value.password);
    ElMessage.success(`欢迎回来，${user.name}`);
    router.push((route.query.redirect as string) || '/dashboard');
  } catch { /* 拦截器已提示 */ } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login { display: flex; height: 100%; background: #fff; }

.brand {
  flex: 1.15;
  background:
    radial-gradient(900px 500px at 10% 10%, rgba(34, 179, 163, 0.28), transparent 60%),
    radial-gradient(700px 500px at 90% 90%, rgba(15, 139, 127, 0.25), transparent 55%),
    linear-gradient(150deg, #05282a 0%, #073a38 55%, #062b2b 100%);
  color: #e8f4f2;
  display: flex;
  align-items: center;
  padding: 64px;
}

.brand-inner { max-width: 520px; }
.brand-logo { font-size: 15px; letter-spacing: 1px; color: #8fd3ca; margin-bottom: 40px; }
h1 { font-size: 40px; line-height: 1.25; margin: 0 0 18px; letter-spacing: -0.5px; }
.brand-desc { color: #a9c9c5; line-height: 1.9; font-size: 14.5px; margin-bottom: 28px; }

.bullets { list-style: none; padding: 0; margin: 0 0 44px; }
.bullets li { display: flex; gap: 10px; color: #cfe6e3; font-size: 13.5px; margin-bottom: 12px; }
.bullets span { color: var(--brand-400); }

.stats { display: flex; gap: 48px; }
.stats strong { display: block; font-size: 28px; color: #fff; letter-spacing: -0.5px; }
.stats em { font-style: normal; font-size: 12px; color: #6ea39d; }

.panel { flex: 1; display: grid; place-items: center; padding: 40px; }
.form-wrap { width: 360px; }
h2 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.4px; }
.sub { color: var(--ink-500); font-size: 13px; margin: 0 0 28px; }

.submit { width: 100%; height: 44px; font-size: 15px; letter-spacing: 4px; margin-top: 4px; }

.demo { margin-top: 26px; padding-top: 20px; border-top: 1px dashed var(--line); }
.demo-title { font-size: 12px; color: var(--ink-500); margin-bottom: 10px; }
.demo-list { display: flex; flex-direction: column; gap: 8px; }
.demo-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px;
  background: #fbfdfe; cursor: pointer; transition: all 0.16s ease; text-align: left;
}
.demo-item:hover { border-color: var(--brand-400); background: var(--brand-50); }
.demo-item .role {
  font-size: 11px; color: var(--brand-700); background: #e0f4f1;
  padding: 2px 8px; border-radius: 999px; flex: none;
}
.demo-item code { font-size: 12px; color: var(--ink-700); }

.foot { margin-top: 26px; font-size: 11.5px; color: #94a3b8; text-align: center; }

@media (max-width: 900px) {
  .brand { display: none; }
  .panel { padding: 24px 18px; }
  .form-wrap { width: 100%; max-width: 380px; }
  .stats { gap: 28px; }
}
</style>
