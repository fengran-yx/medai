import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('@/layout/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '质控驾驶舱', icon: 'DataBoard' } },
      { path: 'records', name: 'records', component: () => import('@/views/RecordsView.vue'), meta: { title: '病历质控', icon: 'DocumentChecked' } },
      { path: 'records/:id', name: 'record-detail', component: () => import('@/views/RecordDetailView.vue'), meta: { title: '病历详情', hidden: true } },
      { path: 'patients', name: 'patients', component: () => import('@/views/PatientsView.vue'), meta: { title: '患者管理', icon: 'User' } },
      { path: 'diagnosis', name: 'diagnosis', component: () => import('@/views/DiagnosisView.vue'), meta: { title: 'AI 辅助诊断', icon: 'FirstAidKit' } },
      { path: 'assistant', name: 'assistant', component: () => import('@/views/AssistantView.vue'), meta: { title: 'AI 医学助手', icon: 'ChatDotRound' } },
      { path: 'rules', name: 'rules', component: () => import('@/views/RulesView.vue'), meta: { title: '质控规则', icon: 'SetUp' } },
      { path: 'logs', name: 'logs', component: () => import('@/views/LogsView.vue'), meta: { title: '操作日志', icon: 'Tickets' } },
      { path: 'users', name: 'users', component: () => import('@/views/UsersView.vue'), meta: { title: '用户管理', icon: 'UserFilled', roles: ['admin'] } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.public) {
    return auth.isLogin && to.name === 'login' ? { name: 'dashboard' } : true;
  }
  if (!auth.isLogin) return { name: 'login', query: { redirect: to.fullPath } };
  const roles = to.meta.roles as string[] | undefined;
  if (roles && auth.user && !roles.includes(auth.user.role)) return { name: 'dashboard' };
  document.title = `${to.meta.title || '智医质控'} · MedAI`;
  return true;
});

export default router;
