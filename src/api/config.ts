// src/api/config.ts
const isDev = import.meta.env.DEV;
const envApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

const fallbackApiBaseUrl = isDev
  ? 'http://localhost:3001/api/v1'
  : '/api/v1';

// In production, use the current site origin so browser API calls do not
// depend on cross-origin CORS or on the apex/www hostname being reachable
// through the same network path. Keep the configurable absolute URL for dev.
const base = isDev
  ? envApiBaseUrl || fallbackApiBaseUrl
  : fallbackApiBaseUrl;

let normalized: string;
if (base.startsWith('/')) {
  normalized = base.replace(/\/+$/, '');
} else {
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(`Invalid API base URL: "${base}"`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Invalid API base URL protocol. Must be http or https');
  }

  normalized = parsed.toString().replace(/\/+$/, '');
}

// Optional: ensure /api/v1 is present.
if (!/\/api\/v1$/i.test(normalized)) {
  console.warn(`[API CONFIG] Base URL does not end with /api/v1: ${normalized}`);
}

export const API_BASE_URL = normalized;
export const API_BASE = API_BASE_URL;
export const APP_BACKEND_URL = API_BASE_URL;
