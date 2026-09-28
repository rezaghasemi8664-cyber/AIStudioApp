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

function normalizeFundamentalAnalysisPayload(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload;

  const root = payload?.data && typeof payload.data === 'object'
    ? payload.data
    : payload?.result && typeof payload.result === 'object'
      ? payload.result
      : payload;

  if (!root || typeof root !== 'object') return payload;

  const scores = root.scores && typeof root.scores === 'object' ? { ...root.scores } : {};
  const fundamental = root.fundamentalAnalysis;
  const meta = root.fundamentalMeta;

  const candidates = [
    root.fundamentalScore,
    root.fundamental_score,
    scores.fundamentalScore,
    scores.fundamental_score,
    meta?.score,
    meta?.fundamentalScore,
    fundamental && typeof fundamental === 'object' ? fundamental.score : undefined,
    fundamental && typeof fundamental === 'object' ? fundamental.fundamentalScore : undefined,
  ];

  const numericScore = candidates
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value >= 0 && value <= 100);

  if (numericScore !== undefined) {
    root.fundamentalScore = numericScore;
    root.fundamental_score = numericScore;
    root.scores = { ...scores, fundamentalScore: numericScore };
  }

  const reasonCandidates = [
    root.fundamentalReason,
    root.fundamental_reason,
    meta?.reason,
    fundamental && typeof fundamental === 'object' ? fundamental.reason : undefined,
    fundamental && typeof fundamental === 'object' ? fundamental.explanation : undefined,
  ];

  const reason = reasonCandidates.find(
    (value) => typeof value === 'string' && value.trim().length > 0
  );

  if (reason) {
    root.fundamentalReason = reason.trim();
    root.fundamental_reason = reason.trim();
  }

  return payload;
}

function normalizeMoneyFlowPayload(payload: any): any {
  const data = payload?.data;
  const market = data?.market ?? data?.marketData ?? payload?.marketData ?? data;
  if (!market || typeof market !== 'object') return payload;

  const realNet = Number(market.realMoneyFlow?.net ?? market.realMoneyFlow);
  const legalNet = Number(market.legalMoneyFlow?.net ?? market.legalMoneyFlow);

  if (!Number.isFinite(realNet) && !Number.isFinite(legalNet)) return payload;

  // Keep the three concepts separate:
  // total net = real net + legal net
  // real net = real flow only
  // legal net = legal flow only
  if (market.moneyFlow && typeof market.moneyFlow === 'object') {
    const current = { ...market.moneyFlow };
    if (Number.isFinite(realNet) && Number.isFinite(legalNet)) {
      current.net = realNet + legalNet;
    }
    market.moneyFlow = current;
  }

  if (Number.isFinite(realNet)) {
    market.netRealMoneyFlow = realNet;
    market.realMoneyFlowNet = realNet;
  }

  if (Number.isFinite(legalNet)) {
    market.netLegalMoneyFlow = legalNet;
    market.legalMoneyFlowNet = legalNet;
  }

  if (Number.isFinite(realNet) && Number.isFinite(legalNet)) {
    market.netMoneyFlow = realNet + legalNet;
    market.moneyFlowNet = realNet + legalNet;
  }

  return payload;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 90000,
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


function configIsStockAnalysis(url: string | undefined): boolean {
  if (!url) return false;
  return /\/analyze\/stock(?:\?|$)/i.test(url);
}

api.interceptors.response.use(
  (response) => {
    response.data = normalizeMoneyFlowPayload(response.data);
    if (configIsStockAnalysis(response.config?.url)) {
      response.data = normalizeFundamentalAnalysisPayload(response.data);
    }
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
