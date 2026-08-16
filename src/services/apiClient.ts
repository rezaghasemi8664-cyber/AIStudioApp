// src/services/apiClient.ts
// ---------------------------------------------------------------
// HTTP Client (Cookie-based Auth / Bearer Token Support)
// ---------------------------------------------------------------

import type { ApiResponse } from '../types';
import { API_BASE_URL } from '../api/config';

// ==============================
// Config & Constants
// ==============================
const API_TOKEN_KEY = 'accessToken';

const getBaseUrl = (): string => {
  return API_BASE_URL.replace(/\/+$/, '');
};

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(API_TOKEN_KEY);
};

const normalizeEndpoint = (endpoint: string): string => {
  let normalized = endpoint.trim();

  if (!normalized) {
    return '/';
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  normalized = normalized.startsWith('/') ? normalized : `/${normalized}`;

  // API_BASE_URL already contains /api/v1 in the current env.
  // Strip duplicated prefixes from service endpoints.
  normalized = normalized.replace(/^\/api\/v1(?=\/|$)/i, '');
  normalized = normalized.replace(/^\/v1(?=\/|$)/i, '');
  normalized = normalized.replace(/^\/api(?=\/|$)/i, '');

  return normalized || '/';
};

const buildUrl = (endpoint: string): string => {
  const normalized = normalizeEndpoint(endpoint);

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  return `${getBaseUrl()}${normalized}`;
};

// ==============================
// Core Request Function
// ==============================
export async function request<T>(
  method: string,
  endpoint: string,
  data?: unknown,
  customHeaders?: Record<string, string>
): Promise<ApiResponse<T>> {
  const url = buildUrl(endpoint);

  const headers: Record<string, string> = {
    ...customHeaders,
  };

  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (
    data !== undefined &&
    method !== 'GET' &&
    method !== 'HEAD' &&
    !(data instanceof FormData)
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (data !== undefined && method !== 'GET' && method !== 'HEAD') {
    options.body = data instanceof FormData ? data : JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);

    if (response.status === 401) {
      console.warn(`[apiClient] 401 Unauthorized detected at ${endpoint}`);
      dispatchLogoutEvent();
    }

    const contentType = response.headers.get('content-type') || '';
    let payload: any = null;

    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      payload = text ? { message: text } : {};
    }

    if (payload && typeof payload === 'object' && 'success' in payload) {
      return {
        ...(payload as ApiResponse<T>),
        statusCode: response.status,
      };
    }

    return {
      success: response.ok,
      data: payload as T,
      message: response.ok
        ? undefined
        : payload?.message || `HTTP Error ${response.status}`,
      statusCode: response.status,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'An unexpected network error occurred';

    console.error(`[apiClient] ${method} ${endpoint} failed:`, error);

    return {
      success: false,
      message: errorMessage,
      error: errorMessage,
      statusCode: 0,
    };
  }
}

// ==============================
// Logout Event
// ==============================
function dispatchLogoutEvent(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(API_TOKEN_KEY);
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }
}

// ==============================
// Public API Methods
// ==============================
export function get<T>(
  endpoint: string,
  headers?: Record<string, string>
): Promise<ApiResponse<T>> {
  return request<T>('GET', endpoint, undefined, headers);
}

export function post<T>(
  endpoint: string,
  data?: unknown,
  headers?: Record<string, string>
): Promise<ApiResponse<T>> {
  return request<T>('POST', endpoint, data, headers);
}

export function put<T>(
  endpoint: string,
  data?: unknown,
  headers?: Record<string, string>
): Promise<ApiResponse<T>> {
  return request<T>('PUT', endpoint, data, headers);
}

export function patch<T>(
  endpoint: string,
  data?: unknown,
  headers?: Record<string, string>
): Promise<ApiResponse<T>> {
  return request<T>('PATCH', endpoint, data, headers);
}

export function del<T = unknown>(
  endpoint: string,
  headers?: Record<string, string>
): Promise<ApiResponse<T>> {
  return request<T>('DELETE', endpoint, undefined, headers);
}

export async function upload<T>(
  endpoint: string,
  formData: FormData,
  customHeaders?: Record<string, string>
): Promise<ApiResponse<T>> {
  return request<T>('POST', endpoint, formData, customHeaders);
}

const apiClient = {
  get,
  post,
  put,
  patch,
  del,
  upload,
};

export default apiClient;
