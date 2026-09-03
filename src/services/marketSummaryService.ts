import api from '../api/apiClient';

// This file keeps the existing market-summary API contract. The UI's "latest"
// summary is intentionally read from persisted history, not from the live
// snapshot endpoint, so opening/refreshing the page cannot create a fake
// timestamped sixth summary.

export interface MarketSummaryData {
  id?: number;
  date?: string;
  summaryDate?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  content?: string | null;
  summary?: string | null;
  [key: string]: any;
}

export interface MarketSummaryHistoryResponse {
  success?: boolean;
  data: MarketSummaryData[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  cached?: boolean;
  message?: string;
}

export interface MarketSummaryDatesResponse {
  success?: boolean;
  data: string[];
  cached?: boolean;
  message?: string;
}

const getMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
};

const nowTs = () => Date.now();

const withNoCacheQuery = (endpoint: string) =>
  `${endpoint}${endpoint.includes('?') ? '&' : '?'}t=${nowTs()}`;

const unwrap = (payload: any): any => {
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }
  return payload;
};

const normalizeSummary = (item: any): MarketSummaryData | null => {
  const candidate = unwrap(item);
  if (!candidate || typeof candidate !== 'object') return null;

  const content =
    typeof candidate.content === 'string' && candidate.content.trim()
      ? candidate.content.trim()
      : typeof candidate.summary === 'string' && candidate.summary.trim()
        ? candidate.summary.trim()
        : null;

  if (!content) return null;

  return {
    ...candidate,
    id: typeof candidate.id === 'number' ? candidate.id : undefined,
    date: typeof candidate.date === 'string' ? candidate.date : undefined,
    summaryDate: typeof candidate.summaryDate === 'string' ? candidate.summaryDate : undefined,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : null,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
    content,
    summary: typeof candidate.summary === 'string' ? candidate.summary : content,
  };
};

const extractHistoryArray = (payload: any): any[] | null => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return null;
};

const HISTORY_ENDPOINTS = ['/market-summary/history', '/market/summary/history'];
const DATES_ENDPOINTS = ['/market-summary/dates', '/market/summary/dates'];
const BY_DATE_ENDPOINTS = ['/market-summary/by-date', '/market/summary/by-date'];
const GENERATE_ENDPOINTS = ['/market-summary/generate', '/market/summary/generate'];

const appApiFetch = async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
  return api.fetch<T>(endpoint, options);
};

/**
 * IMPORTANT: "latest" for the UI means the newest persisted daily record.
 * It must never call /market-summary/latest because that endpoint is a live
 * snapshot and returns id=0/createdAt=now.
 */
export const getLatestSummary = async (): Promise<MarketSummaryData | null> => {
  const history = await getSummaryHistory(1, 1);
  return history?.data?.[0] ?? null;
};

/** Kept for callers that explicitly need the live endpoint. */
export const getLatestSummaryEnvelope = async (): Promise<any> => {
  try {
    const result = await appApiFetch<any>(withNoCacheQuery('/market-summary/latest'), {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    const summary = normalizeSummary(result);
    return {
      summary,
      cached: result?.cached,
      sourceType: result?.sourceType ?? summary?.sourceType ?? null,
      isStale: result?.isStale,
      generatedAt: result?.generatedAt ?? summary?.generatedAt ?? null,
      message: result?.message,
    };
  } catch (error) {
    return { summary: null, message: getMessage(error, 'دریافت خلاصه بازار ناموفق بود') };
  }
};

export const getSummaryHistory = async (
  page: number = 1,
  limit: number = 10
): Promise<MarketSummaryHistoryResponse | null> => {
  let lastError: unknown = null;

  for (const base of HISTORY_ENDPOINTS) {
    try {
      const endpoint = `${base}?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}&t=${nowTs()}`;
      const result = await appApiFetch<any>(endpoint, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });

      if (result?.success === false) {
        lastError = result;
        continue;
      }

      const raw = extractHistoryArray(result);
      if (!raw) {
        lastError = new Error(`Cannot find history array in ${endpoint}`);
        continue;
      }

      const data = raw.map(normalizeSummary).filter(Boolean) as MarketSummaryData[];
      const pagination = result?.pagination ?? result?.data?.pagination;
      const total = Number(pagination?.total ?? data.length);
      const currentPage = Number(pagination?.page ?? page);
      const currentLimit = Math.max(1, Number(pagination?.limit ?? limit));
      const totalPages = Number(
        pagination?.totalPages ?? Math.max(1, Math.ceil(total / currentLimit))
      );

      return {
        success: true,
        data,
        pagination: { total, page: currentPage, limit: currentLimit, totalPages },
        cached: result?.cached,
        message: result?.message,
      };
    } catch (error) {
      lastError = error;
      console.warn(`[MarketSummaryService] History endpoint failed: ${base}`, error);
    }
  }

  console.error('[MarketSummaryService] Get history error:', getMessage(lastError, 'خطا در دریافت تاریخچه خلاصه بازار'));
  return null;
};

export const getAvailableDates = async (): Promise<MarketSummaryDatesResponse | null> => {
  let lastError: unknown = null;
  for (const endpoint of DATES_ENDPOINTS) {
    try {
      const result = await appApiFetch<any>(withNoCacheQuery(endpoint), {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      const data = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : null;
      if (data) return { success: true, data: data.map(String), cached: result?.cached, message: result?.message };
      lastError = new Error(`Cannot find dates array in ${endpoint}`);
    } catch (error) {
      lastError = error;
    }
  }
  console.error('[MarketSummaryService] Get dates error:', getMessage(lastError, 'خطا در دریافت تاریخ‌ها'));
  return null;
};

export const getMarketSummaryByDate = async (date: string): Promise<MarketSummaryData | null> => {
  const safeDate = date.trim();
  if (!safeDate) return null;
  let lastError: unknown = null;

  for (const base of BY_DATE_ENDPOINTS) {
    try {
      const result = await appApiFetch<any>(withNoCacheQuery(`${base}/${encodeURIComponent(safeDate)}`), {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (result?.success === false) {
        lastError = result;
        continue;
      }
      const summary = normalizeSummary(result);
      if (summary) return summary;
      lastError = new Error(`Invalid by-date summary shape from ${base}`);
    } catch (error) {
      lastError = error;
    }
  }

  console.error('[MarketSummaryService] Get by-date error:', getMessage(lastError, 'خطا در دریافت خلاصه بازار'));
  return null;
};

export const generateSummary = async (
  marketData: unknown,
  forceRegenerate: boolean = false
): Promise<MarketSummaryData | null> => {
  let lastError: unknown = null;
  for (const endpoint of GENERATE_ENDPOINTS) {
    try {
      const result = await appApiFetch<any>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ marketData, forceRegenerate }),
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (result?.success === false) {
        lastError = result;
        continue;
      }
      const summary = normalizeSummary(result);
      if (summary) return summary;
      lastError = new Error(`Invalid generated summary shape from ${endpoint}`);
    } catch (error) {
      lastError = error;
    }
  }
  console.error('[MarketSummaryService] Generate error:', getMessage(lastError, 'خطا در تولید خلاصه بازار'));
  return null;
};
