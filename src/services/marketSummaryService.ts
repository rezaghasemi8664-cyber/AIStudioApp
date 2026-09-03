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

  const keys = ['items', 'rows', 'result', 'records', 'list', 'symbols', 'history', 'data', 'dates', 'availableDates'];
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

const nowTs = () => Date.now();

/** به endpoint مقدار timestamp اضافه می‌کند تا کش مرورگر/پروکسی کمتر اثر بگذارد */
const withNoCacheQuery = (endpoint: string): string => {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}t=${nowTs()}`;
};

export interface SummaryMeta {
  generatedAt: string | null;
  ageMinutes: number | null;
  freshnessThresholdMinutes: number | null;
  isStale: boolean;
  source?: string | null;
}

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
  updatedAt?: string | null;
  content?: string | null;
  summary?: string | null;
  fallback?: boolean;
  sourceType?: string | null;
  _meta?: SummaryMeta;
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

export interface MarketSummaryDatesResponse {
  success: boolean;
  data: string[];
  cached?: boolean;
  message?: string;
}

export interface MarketSummarySingleResponse {
  success: boolean;
  data?: MarketSummaryData | { marketSummary?: MarketSummaryData } | null;
  marketSummary?: MarketSummaryData;
  cached?: boolean;
  message?: string;
  sourceType?: string | null;
  isStale?: boolean;
  generatedAt?: string | null;
}

export interface LatestSummaryEnvelope {
  summary: MarketSummaryData | null;
  cached?: boolean;
  sourceType?: string | null;
  isStale?: boolean;
  generatedAt?: string | null;
  message?: string;
}

const isLikelySummary = (candidate: JsonObject | null): boolean => {
  if (!candidate) return false;

  const rawData = extractRawData(candidate.rawJson);

  const hasDate =
    (typeof candidate.date === 'string' && candidate.date.trim().length > 0) ||
    (typeof candidate.summaryDate === 'string' && candidate.summaryDate.trim().length > 0) ||
    (typeof candidate.createdAt === 'string' && candidate.createdAt.trim().length > 0) ||
    (typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim().length > 0);

  const hasContent =
    (typeof candidate.content === 'string' && candidate.content.trim().length > 0) ||
    (typeof candidate.summary === 'string' && candidate.summary.trim().length > 0) ||
    (typeof rawData?.content === 'string' && rawData.content.trim().length > 0) ||
    (typeof rawData?.summary === 'string' && rawData.summary.trim().length > 0);

  const hasSomeSummarySignal =
    'marketStatus' in candidate ||
    'overallIndex' in candidate ||
    'overallChange' in candidate ||
    'totalValue' in candidate ||
    'totalTrades' in candidate ||
    'totalVolume' in candidate ||
    'rawJson' in candidate ||
    !!rawData;

  // اگر متن واقعی خلاصه وجود دارد، پاسخ را معتبر در نظر بگیر.
  if (hasContent) {
    return true;
  }

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
  const positiveStocks = coalesceNumber(candidate.positiveStocks, rawData?.positiveStocks);
  const negativeStocks = coalesceNumber(candidate.negativeStocks, rawData?.negativeStocks);

  if (overallIndex === null && totalTrades === 'نامشخص' && totalValue === 'نامشخص') {
    return 'خلاصه بازار هنوز تولید نشده یا داده‌ی معتبر در دسترس نیست.';
  }

  const changePart = overallChange === null ? '' : ` (${overallChange >= 0 ? '+' : ''}${overallChange.toLocaleString('fa-IR')}%)`;
  const equalPart = equalIndex === null ? '' : `؛ شاخص هم‌وزن: ${equalIndex.toLocaleString('fa-IR')}`;
  const balancePart =
    positiveStocks === null || negativeStocks === null
      ? ''
      : `؛ سهم‌های مثبت/منفی: ${positiveStocks.toLocaleString('fa-IR')}/${negativeStocks.toLocaleString('fa-IR')}`;

  return `شاخص کل: ${overallIndex === null ? 'نامشخص' : overallIndex.toLocaleString('fa-IR')}${changePart}؛ وضعیت بازار: ${marketStatus}؛ تعداد معاملات: ${totalTrades}؛ حجم معاملات: ${totalVolume}؛ ارزش معاملات: ${totalValue}${equalPart}${balancePart}.`;
};

const normalizeMeta = (candidate: JsonObject, rawData: JsonObject | null): SummaryMeta | undefined => {
  const metaObj = asObject(candidate._meta) ?? asObject(rawData?._meta);
  if (metaObj) {
    return {
      generatedAt: toNullableString(metaObj.generatedAt),
      ageMinutes: toNullableNumber(metaObj.ageMinutes),
      freshnessThresholdMinutes: toNullableNumber(metaObj.freshnessThresholdMinutes),
      isStale: Boolean(metaObj.isStale),
      source: toNullableString(metaObj.source)
    };
  }

  const generatedAt = toNullableString(candidate.updatedAt) ?? toNullableString(candidate.createdAt);
  return {
    generatedAt,
    ageMinutes: null,
    freshnessThresholdMinutes: null,
    isStale: false,
    source: toNullableString(candidate.sourceType)
  };
};

const normalizeSummary = (candidate: JsonObject): MarketSummaryData | null => {
  if (!isLikelySummary(candidate)) return null;

  const rawData = extractRawData(candidate.rawJson);
  const rawTopLevel = asObject(candidate.rawJson);

  const overallIndex = coalesceNumber(candidate.overallIndex, rawData?.index);
  const overallChange = coalesceNumber(candidate.overallChange, rawData?.index_change);
  const equalIndex = coalesceNumber(
    candidate.equalIndex,
    candidate.equalWeightedValue,
    candidate.equalWeightValue,
    candidate.equalWeightedIndex,
    candidate.equalWeightIndex,

    rawData?.equalIndex,
    rawData?.equalWeightedValue,
    rawData?.equalWeightValue,
    rawData?.equalWeightedIndex,
    rawData?.equalWeightIndex,

    rawData?.index_equalWeight,
    rawData?.indexEqualWeight,
    rawData?.equal_index
);

const equalChange = coalesceNumber(
    candidate.equalChange,
    candidate.equalWeightedChange,
    candidate.equalWeightedChangeValue,
    candidate.equalWeightChange,
    candidate.equalWeightChangeValue,

    rawData?.equalChange,
    rawData?.equalWeightedChange,
    rawData?.equalWeightedChangeValue,
    rawData?.equalWeightChange,
    rawData?.equalWeightChangeValue,

    rawData?.index_equalWeight_change,
    rawData?.indexEqualWeightChange,
    rawData?.equal_index_change
);
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
  toNullableString(candidate.summaryDate) ??
  toNullableString(rawData?.date) ??
  toNullableString(rawData?.summaryDate) ??
  toNullableString(rawTopLevel?.snapshotCreatedAt) ??
  toNullableString(candidate.createdAt) ??
  toNullableString(candidate.updatedAt) ??
  new Date().toISOString();

const createdAtValue =
  toNullableString(candidate.createdAt) ??
  toNullableString(candidate.updatedAt) ??
  toNullableString(rawTopLevel?.snapshotCreatedAt) ??
  toNullableString(rawTopLevel?.cachedAt) ??
  toNullableString(candidate.date) ??
  toNullableString(candidate.summaryDate) ??
  new Date().toISOString();

  const content = coalesceStringValue(candidate.content, candidate.summary, rawData?.content, rawData?.summary);

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
    updatedAt: toNullableString(candidate.updatedAt),
    content,
    summary: content,
    fallback: typeof candidate.fallback === 'boolean' ? candidate.fallback : undefined,
    sourceType: toNullableString(candidate.sourceType),
    _meta: normalizeMeta(candidate, rawData)
  };
};

const pickMarketSummary = (payload: unknown): MarketSummaryData | null => {
  const obj = asObject(payload);
  if (!obj) return null;

  const data = asObject(obj.data);

  const candidates: Array<JsonObject | null> = [
    data,
    data ? asObject(data.marketSummary) : null,
    asObject(obj.marketSummary),
    obj,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    // اگر پاسخ مستقیماً content/summary دارد،
    // آن را بدون وابستگی به سایر فیلدهای market-data معتبر بدانیم.
    const hasText =
      (typeof candidate.content === 'string' &&
        candidate.content.trim().length > 0) ||
      (typeof candidate.summary === 'string' &&
        candidate.summary.trim().length > 0);

    if (hasText) {
      const now = new Date().toISOString();

      return {
        id: toNumber(candidate.id, 0),
        date:
          toNullableString(candidate.date) ??
          toNullableString(candidate.summaryDate) ??
          toNullableString(candidate.createdAt) ??
          now,
        overallIndex: coalesceNumber(
          candidate.overallIndex,
          candidate.index
        ),
        overallChange: coalesceNumber(
          candidate.overallChange,
          candidate.index_change,
          candidate.indexChange
        ),
        equalIndex: coalesceNumber(
    candidate.equalIndex,
    candidate.equalWeightedValue,
    candidate.equalWeightValue,
    candidate.equalWeightedIndex,
    candidate.equalWeightIndex,
    candidate.index_equalWeight,
    candidate.indexEqualWeight,
    candidate.equal_index
),

equalChange: coalesceNumber(
    candidate.equalChange,
    candidate.equalWeightedChange,
    candidate.equalWeightedChangeValue,
    candidate.equalWeightChange,
    candidate.equalWeightChangeValue,
    candidate.index_equalWeight_change,
    candidate.indexEqualWeightChange,
    candidate.equal_index_change
),
        
        marketStatus: normalizeMarketStatus(
          candidate.marketStatus,
          candidate.state
        ),
        totalTrades: coalesceStringValue(
          candidate.totalTrades,
          candidate.tno,
          candidate.tradeCount
        ),
        totalVolume: coalesceStringValue(
          candidate.totalVolume,
          candidate.tvol,
          candidate.tradeVolume
        ),
        totalValue: coalesceStringValue(
          candidate.totalValue,
          candidate.tval,
          candidate.tradeValue
        ),
        positiveStocks: coalesceNumber(candidate.positiveStocks),
        negativeStocks: coalesceNumber(candidate.negativeStocks),
        neutralStocks: coalesceNumber(candidate.neutralStocks),
        topGainers: asArray(candidate.topGainers),
        topLosers: asArray(candidate.topLosers),
        topVolumes: asArray(candidate.topVolumes),
        rawJson: candidate.rawJson ?? null,
        createdAt:
          toNullableString(candidate.createdAt) ??
          toNullableString(candidate.updatedAt) ??
          now,
        updatedAt: toNullableString(candidate.updatedAt),
        content:
          toNullableString(candidate.content) ??
          toNullableString(candidate.summary),
        summary:
          toNullableString(candidate.summary) ??
          toNullableString(candidate.content),
        fallback:
          typeof candidate.fallback === 'boolean'
            ? candidate.fallback
            : undefined,
        sourceType: toNullableString(candidate.sourceType),
        _meta: normalizeMeta(candidate, extractRawData(candidate.rawJson)),
      };
    }

    const normalized = normalizeSummary(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
};
const pickDates = (payload: unknown): string[] => {
  const obj = asObject(payload);
  if (!obj) return [];

  const candidates: unknown[] = [
    obj.data,
    obj.dates,
    obj.availableDates,
    obj.items,
    obj.rows,
    obj.records,
    obj.list
  ];

  const result = new Set<string>();

  for (const c of candidates) {
    if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string') {
          const s = item.trim();
          if (s) result.add(s);
          continue;
        }

        const itemObj = asObject(item);
        if (!itemObj) continue;

        const d =
          toNullableString(itemObj.summaryDate) ??
          toNullableString(itemObj.date) ??
          toNullableString(itemObj.createdAt) ??
          toNullableString(itemObj.snapshotCreatedAt) ??
          toNullableString(itemObj.value);

        if (d) result.add(d);
      }
      continue;
    }

    const arr = pickArray(c);
    if (arr) {
      for (const item of arr) {
        if (typeof item === 'string') {
          const s = item.trim();
          if (s) result.add(s);
          continue;
        }

        const itemObj = asObject(item);
        if (!itemObj) continue;

        const d =
          toNullableString(itemObj.summaryDate) ??
          toNullableString(itemObj.date) ??
          toNullableString(itemObj.createdAt) ??
          toNullableString(itemObj.snapshotCreatedAt) ??
          toNullableString(itemObj.value);

        if (d) result.add(d);
      }
    }
  }

  return Array.from(result);
};

const LATEST_ENDPOINTS = ['/market-summary/latest'];

const HISTORY_ENDPOINTS = [
  '/market-summary/history',
  '/market/summary/history'
];

const GENERATE_ENDPOINTS = [
  '/market-summary/generate',
  '/market/summary/generate'
];

const DATES_ENDPOINTS = [
  '/market-summary/dates',
  '/market/summary/dates'
];

const BY_DATE_ENDPOINTS = [
  '/market-summary/by-date',
  '/market/summary/by-date'
];

/** نسخه جدید: علاوه بر summary، متای پاسخ latest را هم برمی‌گرداند */
export const getLatestSummaryEnvelope = async (): Promise<LatestSummaryEnvelope> => {
  let lastError: unknown = null;

  for (const endpoint of LATEST_ENDPOINTS) {
    try {
      const result = await appApiFetch<MarketSummarySingleResponse>(withNoCacheQuery(endpoint), {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });

      if (result?.success === false) {
        lastError = result;
        continue;
      }

      const summary = pickMarketSummary(result);
      if (summary) {
        return {
          summary,
          cached: result?.cached,
          sourceType: result?.sourceType ?? summary.sourceType ?? null,
          isStale: typeof result?.isStale === 'boolean' ? result.isStale : summary?._meta?.isStale,
          generatedAt: result?.generatedAt ?? summary?._meta?.generatedAt ?? null,
          message: result?.message
        };
      }

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

  return {
    summary: null,
    message: getMessage(lastError, 'no valid endpoint/response')
  };
};

// backward compatible
export const getLatestSummary = async (): Promise<MarketSummaryData | null> => {
  const env = await getLatestSummaryEnvelope();
  return env.summary;
};

export const getSummaryHistory = async (
  page: number = 1,
  limit: number = 10
): Promise<MarketSummaryHistoryResponse | null> => {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    t: String(nowTs())
  });

  let lastError: unknown = null;

  for (const base of HISTORY_ENDPOINTS) {
    const endpoint = `${base}?${query.toString()}`;

    try {
      const result = await appApiFetch<unknown>(endpoint, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });
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

export const getAvailableDates = async (): Promise<MarketSummaryDatesResponse | null> => {
  let lastError: unknown = null;

  for (const endpoint of DATES_ENDPOINTS) {
    try {
      const result = await appApiFetch<unknown>(withNoCacheQuery(endpoint), {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });

      const obj = asObject(result);
      if (!obj) {
        lastError = new Error(`Non-object response from ${endpoint}`);
        continue;
      }

      if ('success' in obj && obj.success === false) {
        lastError = obj;
        continue;
      }

      const dates = pickDates(obj);
      if (dates.length === 0) {
        lastError = new Error(`Cannot find dates array in ${endpoint}`);
        continue;
      }

      return {
        success: true,
        data: dates,
        cached: typeof obj.cached === 'boolean' ? obj.cached : undefined,
        message: typeof obj.message === 'string' ? obj.message : undefined
      };
    } catch (error) {
      lastError = error;
      console.warn(`[MarketSummaryService] Dates endpoint failed: ${endpoint}`, error);
    }
  }

  console.error(
    '[MarketSummaryService] Get dates error:',
    getMessage(lastError, 'no valid endpoint/response')
  );
  return null;
};

export const getMarketSummaryByDate = async (date: string): Promise<MarketSummaryData | null> => {
  const safeDate = date.trim();
  if (!safeDate) return null;

  let lastError: unknown = null;

  for (const base of BY_DATE_ENDPOINTS) {
    const endpoint = withNoCacheQuery(`${base}/${encodeURIComponent(safeDate)}`);

    try {
      const result = await appApiFetch<MarketSummarySingleResponse>(endpoint, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });

      if (result?.success === false) {
        lastError = result;
        continue;
      }

      const summary = pickMarketSummary(result);
      if (summary) return summary;

      lastError = new Error(`Invalid by-date summary shape from ${endpoint}`);
    } catch (error) {
      lastError = error;
      console.warn(`[MarketSummaryService] By-date endpoint failed: ${endpoint}`, error);
    }
  }

  console.error(
    '[MarketSummaryService] Get by-date error:',
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
        body: JSON.stringify({ marketData, forceRegenerate }),
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
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

