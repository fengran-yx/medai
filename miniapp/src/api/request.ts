import { API_BASE } from '@/config';

export interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

function currentRoute() {
  const pages = getCurrentPages();
  return pages.length ? pages[pages.length - 1].route : '';
}

function clearLogin() {
  uni.removeStorageSync('medai_token');
  uni.removeStorageSync('medai_user');
}

export function request<T>(options: {
  url: string;
  method?: Method;
  data?: any;
  header?: Record<string, string>;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    let token: any = uni.getStorageSync('medai_token') || '';
    if (typeof token === 'string' && token.startsWith('"') && token.endsWith('"')) {
      try { token = JSON.parse(token); } catch { token = token.slice(1, -1); }
    }
    uni.request({
      url: `${API_BASE}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        // ngrok 免费域名的浏览器警告绕过；正式域名可以去掉
        'ngrok-skip-browser-warning': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.header || {}),
      },
      success: (res: any) => {
        const body = res.data as ApiResponse<T>;
        if (res.statusCode === 401) {
          clearLogin();
          if (currentRoute() !== 'pages/login/index') {
            uni.reLaunch({ url: '/pages/login/index' });
          }
          reject(new Error(body?.message || '登录已失效'));
          return;
        }
        if (res.statusCode >= 400 || (body && typeof body === 'object' && 'code' in body && body.code !== 0)) {
          reject(new Error(body?.message || `请求失败（${res.statusCode}）`));
          return;
        }
        resolve((body?.data ?? body) as T);
      },
      fail: (err) => reject(new Error(err.errMsg || '网络异常')),
    });
  });
}
