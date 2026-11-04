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

function normalizeToken(raw: any): string {
  if (typeof raw !== 'string') return '';
  let token = raw.trim();
  if (token.startsWith('"') && token.endsWith('"')) {
    try { token = JSON.parse(token); } catch { token = token.slice(1, -1); }
  }
  return token;
}

function readUser(): MiniUser | null {
  const raw = uni.getStorageSync('medai_user');
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw as MiniUser;
}

export const authState = reactive<{ token: string; user: MiniUser | null }>({
  token: normalizeToken(uni.getStorageSync('medai_token')),
  user: readUser(),
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

export function setToken(token: string) {
  authState.token = token;
  uni.setStorageSync('medai_token', token);
}

export function logout() {
  authState.token = '';
  authState.user = null;
  uni.removeStorageSync('medai_token');
  uni.removeStorageSync('medai_user');
}
