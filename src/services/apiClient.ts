// src/services/apiClient.ts
// ---------------------------------------------------------------
// HTTP Client (Cookie-based Auth / Bearer Token Support)
// ---------------------------------------------------------------

import type { ApiResponse } from '../types';
import { API_BASE_URL } from '../api/config';

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

  if (!normalized) return '/';
  if (/^https?:\/\//i.test(normalized)) return normalized;

  normalized = normalized.startsWith('/') ? normalized : `/${normalized}`;
  normalized = normalized.replace(/^\/api\/v1(?=\/|$)/i, '');
  normalized = normalized.replace(/^\/v1(?=\/|$)/i, '');
  normalized = normalized.replace(/^\/api(?=\/|$)/i, '');

  return normalized || '/';
};

const buildUrl = (endpoint: string): string => {
  const normalized = normalizeEndpoint(endpoint);
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `${getBaseUrl()}${normalized}`;
};

function toFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveMarketSentiment(data: any): 'positive' | 'negative' | 'neutral' {
  const marketData = data?.marketData ?? {};
  const metrics = data?.marketMetrics ?? marketData?.marketMetrics ?? {};
  const priceChange = toFinite(
    marketData.priceChangePercent ??
      marketData.lastPriceChangePercent ??
      metrics.priceChangePercent ??
      data?.lastChangePercent
  );
  const realFlow = toFinite(marketData.realMoneyFlow ?? metrics.realMoneyFlow ?? data?.realMoneyFlow);
  const legalFlow = toFinite(marketData.legalMoneyFlow ?? metrics.legalMoneyFlow ?? data?.legalMoneyFlow);
  const totalFlow = (realFlow ?? 0) + (legalFlow ?? 0);
  const hasFlow = realFlow !== null || legalFlow !== null;

  if (priceChange !== null && hasFlow) {
    if (priceChange >= 1 && totalFlow > 0) return 'positive';
    if (priceChange <= -1 && totalFlow < 0) return 'negative';
  }
  if (priceChange !== null) {
    if (priceChange >= 2) return 'positive';
    if (priceChange <= -2) return 'negative';
  }
  if (hasFlow) {
    if (totalFlow > 0) return 'positive';
    if (totalFlow < 0) return 'negative';
  }
  return 'neutral';
}

async function enrichStockAnalysis(payload: any, symbol: string, headers: Record<string, string>): Promise<any> {
  if (!payload || payload.success !== true || !symbol) return payload;

  try {
    const supplementalResponse = await fetch(buildUrl(`/analysis-data/symbol/${encodeURIComponent(symbol)}?historyCount=30`), {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!supplementalResponse.ok) return payload;

    const supplemental = await supplementalResponse.json();
    const supplementalData = supplemental?.success ? supplemental.data : null;
    if (!supplementalData) return payload;

    const currentData = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const fundamentalAnalysis = supplementalData.fundamentalAnalysis ?? null;
    const fundamentalScore = toFinite(fundamentalAnalysis?.score);
    const fundamentalUnavailable = fundamentalAnalysis?.scoreStatus === 'insufficient-data' || fundamentalAnalysis?.available === false;

    const mergedData: any = {
      ...currentData,
      fundamental: supplementalData.fundamental ?? currentData.fundamental,
      fundamentalAnalysis: fundamentalAnalysis ?? currentData.fundamentalAnalysis,
      dataQuality: supplementalData.dataQuality ?? currentData.dataQuality,
      marketData: {
        ...(currentData.marketData ?? {}),
        ...(supplementalData.market ?? {}),
        realMoneyFlow: supplementalData.market?.realMoneyFlow ?? currentData.marketData?.realMoneyFlow,
        legalMoneyFlow: supplementalData.market?.legalMoneyFlow ?? currentData.marketData?.legalMoneyFlow,
        moneyFlow: supplementalData.market?.moneyFlow ?? currentData.marketData?.moneyFlow,
      },
    };

    if (fundamentalScore !== null) {
      mergedData.fundamentalScore = fundamentalScore;
      mergedData.scores = { ...(currentData.scores ?? {}), fundamentalScore };
    } else if (fundamentalUnavailable) {
      mergedData.fundamentalScore = null;
      mergedData.scores = { ...(currentData.scores ?? {}), fundamentalScore: null };
    }

    const currentSentiment = String(currentData.sentiment ?? '').trim().toLowerCase();
    if (!currentSentiment || currentSentiment === 'neutral' || currentSentiment === 'خنثی') {
      mergedData.sentiment = deriveMarketSentiment(mergedData);
    }

    return {
      ...payload,
      data: mergedData,
      marketMetrics: supplementalData.market ?? payload.marketMetrics,
      marketData: supplementalData.market ?? payload.marketData,
      fundamentalAnalysis: fundamentalAnalysis ?? payload.fundamentalAnalysis,
      dataQuality: supplementalData.dataQuality ?? payload.dataQuality,
    };
  } catch (error) {
    console.warn('[apiClient] stock analysis enrichment failed:', error);
    return payload;
  }
}

export async function request<T>(
  method: string,
  endpoint: string,
  data?: unknown,
  customHeaders?: Record<string, string>
): Promise<ApiResponse<T>> {
  const url = buildUrl(endpoint);
  const headers: Record<string, string> = { ...customHeaders };

  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;

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

    if (endpoint.replace(/^\/+/, '').toLowerCase() === 'analyze/stock' && payload?.success === true) {
      const symbol = typeof data === 'object' && data !== null && 'symbol' in data
        ? String((data as Record<string, unknown>).symbol ?? '').trim()
        : '';
      payload = await enrichStockAnalysis(payload, symbol, headers);
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

function dispatchLogoutEvent(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(API_TOKEN_KEY);
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }
}

export function get<T>(endpoint: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
  return request<T>('GET', endpoint, undefined, headers);
}

export function post<T>(endpoint: string, data?: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
  return request<T>('POST', endpoint, data, headers);
}

export function put<T>(endpoint: string, data?: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
  return request<T>('PUT', endpoint, data, headers);
}

export function patch<T>(endpoint: string, data?: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
  return request<T>('PATCH', endpoint, data, headers);
}

export function del<T = unknown>(endpoint: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
  return request<T>('DELETE', endpoint, undefined, headers);
}

export async function upload<T>(endpoint: string, formData: FormData, customHeaders?: Record<string, string>): Promise<ApiResponse<T>> {
  return request<T>('POST', endpoint, formData, customHeaders);
}

const apiClient = { get, post, put, patch, del, upload };

export default apiClient;
