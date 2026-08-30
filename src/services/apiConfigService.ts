const env = (import.meta as any)?.env || {};

const envBaseUrl = env.VITE_API_BASE_URL || env.VITE_API_URL;

const defaultBaseUrl = env.DEV
  ? 'http://localhost:3001/api/v1'
  : '/api/v1';

const API_BASE_URL = String(envBaseUrl || defaultBaseUrl).replace(/\/+$/, '');

type ApiFetchOptions = RequestInit & {
  requireAuth?: boolean;
};

export interface MarketIndexSchedule {
  isEnabled: boolean;
  days: number[];
  startTime: string;
  endTime: string;
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;

  const keys = ['token', 'accessToken', 'authToken', 'jwt', 'userToken'];

  for (const key of keys) {
    const localValue = localStorage.getItem(key);
    const sessionValue = sessionStorage.getItem(key);

    const value = localValue || sessionValue;
    if (value && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function getMarketIndexSchedule(): MarketIndexSchedule {
  return {
    isEnabled: true,
    days: [6, 0, 1, 2, 3],
    startTime: '09:00',
    endTime: '12:30',
  };
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { requireAuth = true, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (requireAuth) {
    const token = getStoredToken();
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const normalizedEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;

  const isAbsoluteUrl = /^https?:\/\//i.test(endpoint);

  const url = isAbsoluteUrl
  ? endpoint
  : `${API_BASE_URL}${normalizedEndpoint}`;

  const response = await fetch(url, {
    credentials: 'include',
    ...rest,
    headers,
  });

  let data: any = null;
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => '');
    data = text || null;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `API Error: ${response.status} ${response.statusText}`;

    throw new Error(message);
  }

  return data as T;
}

export const appApiFetch = apiFetch;

export { API_BASE_URL };

export default {
  apiFetch,
  appApiFetch,
  API_BASE_URL,
  getMarketIndexSchedule,
};
