import { computed, reactive } from 'vue';

export interface MiniUser {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'quality' | 'clinician';
  title?: string;
  deptId?: number;
  deptName?: string;
}

export const authState = reactive<{ token: string; user: MiniUser | null }>({
  token: uni.getStorageSync('medai_token') || '',
  user: uni.getStorageSync('medai_user') || null,
});

export const isLogin = computed(() => Boolean(authState.token));
export const canQC = computed(() => ['admin', 'quality'].includes(authState.user?.role || ''));
export const roleText = computed(() => (
  ({ admin: '系统管理员', quality: '质控医师', clinician: '临床医师' } as Record<string, string>)[authState.user?.role || ''] || '用户'
));

export function setLogin(token: string, user: MiniUser) {
  authState.token = token;
  authState.user = user;
  uni.setStorageSync('medai_token', token);
  uni.setStorageSync('medai_user', user);
}

export function logout() {
  authState.token = '';
  authState.user = null;
  uni.removeStorageSync('medai_token');
  uni.removeStorageSync('medai_user');
}
