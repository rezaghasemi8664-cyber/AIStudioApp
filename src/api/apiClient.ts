import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from './config';

const TOKEN_KEYS = ['accessToken', 'token'];

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;

  for (const key of TOKEN_KEYS) {
    const token = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (token && token.trim()) return token.trim();
  }

  return null;
};

function normalizeMoneyFlowPayload(payload: any): any {
  const data = payload?.data;
  const market = data?.market ?? data?.marketData ?? payload?.marketData ?? data;
  if (!market || typeof market !== 'object') return payload;

  const realNet = Number(market.realMoneyFlow ?? market.realMoneyFlow?.net);
  if (!Number.isFinite(realNet)) return payload;

  if (market.moneyFlow && typeof market.moneyFlow === 'object') {
    market.moneyFlow = { ...market.moneyFlow, net: realNet };
  }
  market.netMoneyFlow = realNet;
  market.moneyFlowNet = realNet;

  return payload;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
  headers: {
    Accept: 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getStoredToken();

    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    response.data = normalizeMoneyFlowPayload(response.data);
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    } else if (status === 403) {
      window.dispatchEvent(new CustomEvent('auth:forbidden'));
    } else if (!error.response) {
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
