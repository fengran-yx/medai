import axios from 'axios';
import { ElMessage } from 'element-plus';

export const http = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('medai_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body === 'object' && 'code' in body && body.code !== 0) {
      ElMessage.error(body.message || '请求失败');
      return Promise.reject(new Error(body.message || '请求失败'));
    }
    return body?.data ?? body;
  },
  (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message || '网络异常';
    if (status === 401) {
      localStorage.removeItem('medai_token');
      localStorage.removeItem('medai_user');
      if (!location.pathname.includes('/login')) location.href = '/login';
    } else {
      ElMessage.error(msg);
    }
    return Promise.reject(new Error(msg));
  },
);
