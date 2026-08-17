import { appApiFetch } from './apiConfigService';

type JsonObject = Record<string, unknown>;

const asObject = (v: unknown): JsonObject | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : null;

const asArray = <T = unknown>(v: unknown): T[] | null =>
  Array.isArray(v) ? (v as T[]) : null;

const toNumber = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const normalized = v.replace(/,/g, '').trim();
    if (!normalized) return fallback;
    const n = Number(normalized);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

const toNullableNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = toNumber(v, Number.NaN);
  return Number.isFinite(n) ? n : null;
};

const toNullableString = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
};

const getMessage = (v: unknown, fallback: string): string => {
  const obj = asObject(v);
  if (!obj) return fallback;

  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;

  const err = asObject(obj.error);
  if (err && typeof err.message === 'string' && err.message.trim()) return err.message;

  const data = asObject(obj.data);
  if (data && typeof data.message === 'string' && data.message.trim()) return data.message;

  return fallback;
};

const pickArray = (v: unknown): unknown[] | null => {
  if (Array.isArray(v)) return v;

  const obj = asObject(v);
  if (!obj) return null;

  const keys = ['items', 'rows', 'result', 'records', 'list', 'symbols', 'history', 'data'];
  for (const k of keys) {
    const arr = asArray(obj[k]);
    if (arr) return arr;
  }

  const data = asObject(obj.data);
  if (data) {
    for (const k of keys) {
      const arr = asArray(data[k]);
      if (arr) return arr;
    }
  }

  return null;
};

const normalizeMarketStatus = (value: unknown, fallbackRawState?: unknown): string | null => {
  const direct = toNullableString(value);
  if (direct) return direct;

  const rawState = toNullableString(fallbackRawState);
  if (!rawState) return null;

  const normalized = rawState.toLowerCase();
  if (normalized === 'بسته') return 'close';
  if (normalized === 'باز') return 'open';

  return rawState;
};

const extractRawData = (rawJson: unknown): JsonObject | null => {
  const raw = asObject(rawJson);
  if (!raw) return null;

  const data = asObject(raw.data);
  return data ?? raw;
};

const coalesceNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const n = toNullableNumber(value);
    if (n !== null) return n;
  }
  return null;
};

const coalesceStringValue = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
};

export interface MarketSummaryData {
  id: number;
  date: string;
  overallIndex: number | null;
  overallChange: number | null;
  equalIndex: number | null;
  equalChange: number | null;
  marketStatus: string | null;
  totalTrades: string | null;
  totalVolume: string | null;
  totalValue: string | null;
  positiveStocks: number | null;
  negativeStocks: number | null;
  neutralStocks: number | null;
  topGainers: unknown[] | null;
  topLosers: unknown[] | null;
  topVolumes: unknown[] | null;
  rawJson: unknown;
  createdAt: string;
  content?: string | null;
  summary?: string | null;
  fallback?: boolean;
}

export interface MarketSummaryHistoryResponse {
  success: boolean;
  data: MarketSummaryData[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  cached?: boolean;
  message?: string;
}

export interface MarketSummarySingleResponse {
  success: boolean;
  data?: MarketSummaryData | { marketSummary?: MarketSummaryData } | null;
  marketSummary?: MarketSummaryData;
  cached?: boolean;
  message?: string;
}

const isLikelySummary = (candidate: JsonObject | null): boolean => {
  if (!candidate) return false;

  const rawData = extractRawData(candidate.rawJson);

  const hasDate =
    (typeof candidate.date === 'string' && candidate.date.trim().length > 0) ||
    (typeof candidate.createdAt === 'string' && candidate.createdAt.trim().length > 0);

  const hasSomeSummarySignal =
    'marketStatus' in candidate ||
    'overallIndex' in candidate ||
    'totalValue' in candidate ||
    'rawJson' in candidate ||
    !!rawData;

  return hasDate && hasSomeSummarySignal;
};

const buildSummaryText = (candidate: JsonObject): string => {
  const rawData = extractRawData(candidate.rawJson) ?? candidate;
  const content = coalesceStringValue(candidate.content, candidate.summary, rawData?.content, rawData?.summary);
  if (content) return content;

  const overallIndex = coalesceNumber(candidate.overallIndex, rawData?.index, rawData?.marketIndex);
  const overallChange = coalesceNumber(candidate.overallChange, rawData?.index_change, rawData?.indexChange);
  const equalIndex = coalesceNumber(candidate.equalIndex, rawData?.index_equalWeight, rawData?.indexEqualWeight);
  const marketStatus = normalizeMarketStatus(candidate.marketStatus, rawData?.state) ?? 'نامشخص';
  const totalTrades = coalesceStringValue(candidate.totalTrades, rawData?.tno, rawData?.totalTrades, rawData?.tradeCount) ?? 'نامشخص';
  const totalVolume = coalesceStringValue(candidate.totalVolume, rawData?.tvol, rawData?.totalVolume, rawData?.tradeVolume) ?? 'نامشخص';
  const totalValue = coalesceStringValue(candidate.totalValue, rawData?.tval, rawData?.totalValue, rawData?.tradeValue) ?? 'نامشخص';
  const positiveStocks = coalesceNumber(candidate.positiveStocks, rawData?.positiveStocks) ?? 0;
  const negativeStocks = coalesceNumber(candidate.negativeStocks, rawData?.negativeStocks) ?? 0;

  const changePart = overallChange === null ? '' : ` (${overallChange >= 0 ? '+' : ''}${overallChange.toLocaleString('fa-IR')}%)`;
  const equalPart = equalIndex === null ? '' : `؛ شاخص هم‌وزن: ${equalIndex.toLocaleString('fa-IR')}`;

  return `شاخص کل: ${overallIndex === null ? 'نامشخص' : overallIndex.toLocaleString('fa-IR')}${changePart}؛ وضعیت بازار: ${marketStatus}؛ تعداد معاملات: ${totalTrades}؛ حجم معاملات: ${totalVolume}؛ ارزش معاملات: ${totalValue}${equalPart}؛ سهم‌های مثبت/منفی: ${positiveStocks.toLocaleString('fa-IR')}/${negativeStocks.toLocaleString('fa-IR')}.`;
};

const normalizeSummary = (candidate: JsonObject): MarketSummaryData | null => {
  if (!isLikelySummary(candidate)) return null;

  const rawData = extractRawData(candidate.rawJson);
  const rawTopLevel = asObject(candidate.rawJson);

  const overallIndex = coalesceNumber(candidate.overallIndex, rawData?.index);
  const overallChange = coalesceNumber(candidate.overallChange, rawData?.index_change);
  const equalIndex = coalesceNumber(candidate.equalIndex, rawData?.index_equalWeight);
  const equalChange = coalesceNumber(candidate.equalChange, rawData?.index_equalWeight_change);

  const totalTrades = coalesceStringValue(candidate.totalTrades, rawData?.tno);
  const totalVolume = coalesceStringValue(candidate.totalVolume, rawData?.tvol);
  const totalValue = coalesceStringValue(candidate.totalValue, rawData?.tval);

  const topGainers =
    asArray(candidate.topGainers) ??
    asArray(rawData?.topGainers) ??
    asArray(rawData?.top_gainers) ??
    null;

  const topLosers =
    asArray(candidate.topLosers) ??
    asArray(rawData?.topLosers) ??
    asArray(rawData?.top_losers) ??
    null;

  const topVolumes =
    asArray(candidate.topVolumes) ??
    asArray(rawData?.topVolumes) ??
    asArray(rawData?.top_volumes) ??
    null;

  const dateValue =
    toNullableString(candidate.date) ??
    toNullableString(rawData?.date) ??
    toNullableString(rawTopLevel?.snapshotCreatedAt) ??
    toNullableString(candidate.createdAt);

  const createdAtValue =
    toNullableString(candidate.createdAt) ??
    toNullableString(rawTopLevel?.snapshotCreatedAt) ??
    toNullableString(rawTopLevel?.cachedAt) ??
    toNullableString(candidate.date);

  const content = coalesceStringValue(candidate.content, candidate.summary, rawData?.content, rawData?.summary) ?? buildSummaryText(candidate);

  if (!dateValue || !createdAtValue) return null;

  return {
    id: toNumber(candidate.id, 0),
    date: dateValue,
    overallIndex,
    overallChange,
    equalIndex,
    equalChange,
    marketStatus: normalizeMarketStatus(candidate.marketStatus, rawData?.state),
    totalTrades,
    totalVolume,
    totalValue,
    positiveStocks: coalesceNumber(candidate.positiveStocks),
    negativeStocks: coalesceNumber(candidate.negativeStocks),
    neutralStocks: coalesceNumber(candidate.neutralStocks),
    topGainers,
    topLosers,
    topVolumes,
    rawJson: candidate.rawJson ?? null,
    createdAt: createdAtValue,
    content,
    summary: content,
    fallback: typeof candidate.fallback === 'boolean' ? candidate.fallback : undefined
  };
};

const pickMarketSummary = (payload: unknown): MarketSummaryData | null => {
  const obj = asObject(payload);
  if (!obj) return null;

  const data = asObject(obj.data);
  const marketSummaryInData = data ? asObject(data.marketSummary) : null;
  const marketSummaryDirect = asObject(obj.marketSummary);

  const candidates: Array<JsonObject | null> = [
    marketSummaryInData,
    marketSummaryDirect,
    data,
    obj
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const normalized = normalizeSummary(candidate);
    if (normalized) return normalized;
  }

  return null;
};

const LATEST_ENDPOINTS = [
  '/market-summary/latest',
  '/market/summary',
  '/market-summary'
];

const HISTORY_ENDPOINTS = [
  '/market-summary/history',
  '/market/summary/history'
];

const GENERATE_ENDPOINTS = [
  '/market-summary/generate',
  '/market/summary/generate'
];

export const getLatestSummary = async (): Promise<MarketSummaryData | null> => {
  let lastError: unknown = null;

  for (const endpoint of LATEST_ENDPOINTS) {
    try {
      const result = await appApiFetch<MarketSummarySingleResponse>(endpoint, { method: 'GET' });

      if (result?.success === false) {
        lastError = result;
        continue;
      }

      const summary = pickMarketSummary(result);
      if (summary) return summary;

      lastError = new Error(`Invalid summary shape from ${endpoint}`);
    } catch (error) {
      lastError = error;
      console.warn(`[MarketSummaryService] Latest endpoint failed: ${endpoint}`, error);
    }
  }

  console.error(
    '[MarketSummaryService] Get latest error:',
    getMessage(lastError, 'no valid endpoint/response')
  );
  return null;
};

export const getSummaryHistory = async (
  page: number = 1,
  limit: number = 10
): Promise<MarketSummaryHistoryResponse | null> => {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit)
  });

  let lastError: unknown = null;

  for (const base of HISTORY_ENDPOINTS) {
    const endpoint = `${base}?${query.toString()}`;

    try {
      const result = await appApiFetch<unknown>(endpoint, { method: 'GET' });
      const obj = asObject(result);

      if (!obj) {
        lastError = new Error(`Non-object response from ${endpoint}`);
        continue;
      }

      if ('success' in obj && obj.success === false) {
        lastError = obj;
        continue;
      }

      const dataArray = pickArray(obj.data) ?? pickArray(obj);
      if (!dataArray) {
        lastError = new Error(`Cannot find history array in ${endpoint}`);
        continue;
      }

      const normalized = dataArray
        .map((item) => (asObject(item) ? normalizeSummary(item) : null))
        .filter((x): x is MarketSummaryData => x !== null);

      const dataObj = asObject(obj.data);
      const pagination = asObject(obj.pagination) ?? (dataObj ? asObject(dataObj.pagination) : null);

      const total = pagination ? toNumber(pagination.total, normalized.length) : normalized.length;
      const currentPage = pagination ? toNumber(pagination.page, page) : page;
      const currentLimit = Math.max(1, pagination ? toNumber(pagination.limit, limit) : limit);
      const totalPages = pagination
        ? toNumber(pagination.totalPages, Math.max(1, Math.ceil(total / currentLimit)))
        : Math.max(1, Math.ceil(total / currentLimit));

      return {
        success: true,
        data: normalized,
        pagination: {
          total,
          page: currentPage,
          limit: currentLimit,
          totalPages
        },
        cached: typeof obj.cached === 'boolean' ? obj.cached : undefined,
        message: typeof obj.message === 'string' ? obj.message : undefined
      };
    } catch (error) {
      lastError = error;
      console.warn(`[MarketSummaryService] History endpoint failed: ${endpoint}`, error);
    }
  }

  console.error(
    '[MarketSummaryService] Get history error:',
    getMessage(lastError, 'no valid endpoint/response')
  );
  return null;
};

export const generateSummary = async (
  marketData: unknown,
  forceRegenerate: boolean = false
): Promise<MarketSummaryData | null> => {
  let lastError: unknown = null;

  for (const endpoint of GENERATE_ENDPOINTS) {
    try {
      const result = await appApiFetch<MarketSummarySingleResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ marketData, forceRegenerate })
      });

      if (result?.success === false) {
        lastError = result;
        continue;
      }

      const summary = pickMarketSummary(result);
      if (summary) return summary;

      lastError = new Error(`Invalid generated summary shape from ${endpoint}`);
    } catch (error) {
      lastError = error;
      console.warn(`[MarketSummaryService] Generate endpoint failed: ${endpoint}`, error);
    }
  }

  console.error(
    '[MarketSummaryService] Generate error:',
    getMessage(lastError, 'no valid endpoint/response')
  );
  return null;
};
