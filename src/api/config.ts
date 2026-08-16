// src/api/config.ts

const isDev = import.meta.env.DEV;

const envApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

const fallbackApiBaseUrl = isDev
  ? 'http://localhost:3001/api/v1'
  : 'https://roniya-analyzer.ir/api/v1';

const base = envApiBaseUrl || fallbackApiBaseUrl;

if (!/^https?:\/\//i.test(base)) {
  throw new Error('Invalid API base URL. Must start with http:// or https://');
}

export const API_BASE_URL = base.replace(/\/+$/, '');

export const API_BASE = API_BASE_URL;
export const APP_BACKEND_URL = API_BASE_URL;
