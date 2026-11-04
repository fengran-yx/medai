import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, type User } from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('medai_token') || '');
  const user = ref<User | null>(JSON.parse(localStorage.getItem('medai_user') || 'null'));

  const isLogin = computed(() => Boolean(token.value));
  const role = computed(() => user.value?.role ?? '');
  const isAdmin = computed(() => role.value === 'admin');
  const canQC = computed(() => ['admin', 'quality'].includes(role.value));

  async function login(username: string, password: string) {
    const data = await api.login(username, password);
    token.value = data.token;
    user.value = data.user;
    localStorage.setItem('medai_token', data.token);
    localStorage.setItem('medai_user', JSON.stringify(data.user));
    return data.user;
  }

  async function refresh() {
    if (!token.value) return;
    try {
      user.value = await api.me();
      localStorage.setItem('medai_user', JSON.stringify(user.value));
    } catch {
      logout();
    }
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('medai_token');
    localStorage.removeItem('medai_user');
  }

  function setToken(next: string) {
    token.value = next;
    localStorage.setItem('medai_token', next);
  }

  return { token, user, isLogin, role, isAdmin, canQC, login, refresh, logout, setToken };
});
