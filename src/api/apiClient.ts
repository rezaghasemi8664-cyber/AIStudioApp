import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from './config';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // ارسال خودکار HttpOnly Cookie
  timeout: 30000,
  headers: {
    Accept: 'application/json',
    // Content-Type را global نگذارید تا برای FormData هم درست کار کند
  },
});

/* ---------------------------------- */
/* Request Interceptor                */
/* ---------------------------------- */
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Cookie-Auth:
    // هیچ توکنی از storage خوانده نمی‌شود.
    // مرورگر خودش Cookie را با withCredentials ارسال می‌کند.
    return config;
  },
  (error) => Promise.reject(error)
);

/* ---------------------------------- */
/* Response Interceptor               */
/* ---------------------------------- */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401) {
      // نشست نامعتبر/منقضی
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    } else if (status === 403) {
      // عدم دسترسی
      window.dispatchEvent(new CustomEvent('auth:forbidden'));
    } else if (!error.response) {
      // Network / Timeout / CORS fail
      window.dispatchEvent(
        new CustomEvent('network:error', {
          detail: { message: error.message || 'Network error' },
        })
      );
    }

    return Promise.reject(error);
  }
);

export default api;
