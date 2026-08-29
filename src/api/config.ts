// src/api/config.ts
const isDev = import.meta.env.DEV;
const envApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

const fallbackApiBaseUrl = isDev
  ? 'http://localhost:3001/api/v1'
  : 'https://roniya-analyzer.ir/api/v1';

const base = envApiBaseUrl || fallbackApiBaseUrl;

// اعتبارسنجی ساختار URL
let parsed: URL;
try {
  parsed = new URL(base);
} catch {
  throw new Error(`Invalid API base URL: "${base}"`);
}

if (!['http:', 'https:'].includes(parsed.protocol)) {
  throw new Error('Invalid API base URL protocol. Must be http or https');
}

// حذف اسلش پایانی
const normalized = parsed.toString().replace(/\/+$/, '');

// اختیاری: اطمینان از وجود /api/v1
if (!/\/api\/v1$/i.test(normalized)) {
  console.warn(`[API CONFIG] Base URL does not end with /api/v1: ${normalized}`);
}

export const API_BASE_URL = normalized;
export const API_BASE = API_BASE_URL;
export const APP_BACKEND_URL = API_BASE_URL;
