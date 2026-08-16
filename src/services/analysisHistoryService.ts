import type { AnalysisResult } from '../types/analysis';
import { appApiFetch } from './apiConfigService';

export interface AnalysisHistoryItem {
  id?: string;
  userId?: string;
  symbol: string;
  timestamp: number;
  recommendation?: string;
  riskLevel?: string;
  summary?: string;
  result?: AnalysisResult | null;
  createdAt?: string;
  created_at?: string;
  resultJson?: string | AnalysisResult | null;
}

interface AddHistoryPayload {
  symbol: string;
  recommendation?: string;
  riskLevel?: string;
  summary?: string;
  result?: AnalysisResult;
}

interface ApiWrapped<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

function safeParseJSON<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function unwrapApiData<T>(res: unknown): T {
  const wrapped = res as ApiWrapped<T>;

  if (wrapped && typeof wrapped === 'object' && 'success' in wrapped) {
    if (wrapped.success === false) {
      throw new Error(wrapped.message || 'خطا در دریافت داده.');
    }
    return (wrapped.data as T) ?? (null as T);
  }

  return res as T;
}

function normalizeHistoryItem(item: AnalysisHistoryItem): AnalysisHistoryItem {
  let parsedResult: AnalysisResult | null = null;

  if (typeof item.resultJson === 'string') {
    parsedResult = safeParseJSON<AnalysisResult | null>(item.resultJson, null);
  } else if (item.resultJson && typeof item.resultJson === 'object') {
    parsedResult = item.resultJson as AnalysisResult;
  } else if (item.result && typeof item.result === 'object') {
    parsedResult = item.result;
  }

  const ts =
    typeof item.timestamp === 'number' && Number.isFinite(item.timestamp)
      ? item.timestamp
      : new Date(item.createdAt || item.created_at || Date.now()).getTime();

  return { ...item, timestamp: ts, result: parsedResult };
}

function assertSymbol(symbol: string): void {
  if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
    throw new Error('نماد معتبر نیست.');
  }
}

function normalizePagination(limit: number, offset: number) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  return { safeLimit, safeOffset };
}

export async function addAnalysisToHistory(
  _userId: string,
  payload: AddHistoryPayload
): Promise<AnalysisHistoryItem> {
  assertSymbol(payload.symbol);

  const raw = await appApiFetch<AnalysisHistoryItem | ApiWrapped<AnalysisHistoryItem>>(
    '/analysis-history',
    {
      method: 'POST',
      body: JSON.stringify({
        symbol: payload.symbol.trim(),
        recommendation: payload.recommendation || payload.result?.recommendation || 'نامشخص',
        riskLevel: payload.riskLevel || payload.result?.riskLevel || 'نامشخص',
        summary: payload.summary || payload.result?.summary || '',
        resultJson: payload.result ? JSON.stringify(payload.result) : null,
      }),
    }
  );

  const saved = unwrapApiData<AnalysisHistoryItem>(raw);
  return normalizeHistoryItem(saved);
}

export async function getAnalysisHistory(
  _userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<AnalysisHistoryItem[]> {
  const { safeLimit, safeOffset } = normalizePagination(limit, offset);

  const raw = await appApiFetch<AnalysisHistoryItem[] | ApiWrapped<AnalysisHistoryItem[]>>(
    `/analysis-history?limit=${safeLimit}&offset=${safeOffset}`
  );

  const items = unwrapApiData<AnalysisHistoryItem[]>(raw);
  if (!Array.isArray(items)) return [];

  return items.map(normalizeHistoryItem).sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteAnalysisFromHistory(
  _userId: string,
  itemId: string
): Promise<boolean> {
  if (!itemId?.trim()) throw new Error('شناسه رکورد معتبر نیست.');

  const raw = await appApiFetch<ApiWrapped<unknown> | unknown>(
    `/analysis-history/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' }
  );

  const wrapped = raw as ApiWrapped<unknown>;
  if (wrapped && typeof wrapped === 'object' && 'success' in wrapped) {
    if (wrapped.success === false) throw new Error(wrapped.message || 'خطا در حذف رکورد.');
    return true;
  }

  return true;
}

export async function clearAnalysisHistory(_userId: string): Promise<boolean> {
  const raw = await appApiFetch<ApiWrapped<unknown> | unknown>('/analysis-history/clear', {
    method: 'DELETE',
  });

  const wrapped = raw as ApiWrapped<unknown>;
  if (wrapped && typeof wrapped === 'object' && 'success' in wrapped) {
    if (wrapped.success === false) throw new Error(wrapped.message || 'خطا در پاکسازی تاریخچه.');
    return true;
  }

  return true;
}
