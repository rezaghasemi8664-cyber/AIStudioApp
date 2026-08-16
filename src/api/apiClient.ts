import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from './config';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // برای ارسال HttpOnly Cookie
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/* ---------------------------------- */
/* Request Interceptor                */
/* ---------------------------------- */
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Backend-Only / Cookie-Auth:
    // هیچ توکنی از localStorage/sessionStorage خوانده نمی‌شود.
    // مرورگر کوکی HttpOnly را خودکار (با withCredentials) ارسال می‌کند.
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
      // Unauthorized:
      // در صورت نیاز می‌توانید event سراسری dispatch کنید
      // تا اپ کاربر را به login هدایت کند.
      // نمونه:
      // window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    if (status === 403) {
      // Forbidden: دسترسی غیرمجاز
      // نمونه:
      // window.dispatchEvent(new CustomEvent('auth:forbidden'));
    }

    return Promise.reject(error);
  }
);

export default api;
