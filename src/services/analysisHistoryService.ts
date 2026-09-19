import type { AnalysisResult } from '../types/analysis';
import { appApiFetch } from './apiConfigService';

export interface AnalysisHistoryItem {
  id?: string | number;
  userId?: string | number;

  symbol: string;
  stock?: string;

  timestamp: number;

  recommendation?: string;
  riskLevel?: string;
  summary?: string;

  result?: AnalysisResult | null;
  parsedResult?: AnalysisResult | null;

  createdAt?: string;
  created_at?: string;

  resultJson?: string | AnalysisResult | null;
  dataStatus?: 'LIVE' | 'CACHED' | 'UNAVAILABLE';
  source?: string;
  fetchedAt?: string;
  stale?: boolean;
}

interface AddHistoryPayload {
  symbol: string;
  recommendation?: string;
  riskLevel?: string;
  summary?: string;
  result?: AnalysisResult;
}

export interface AnalysisHistoryStats {
  total: number;
  buyCount: number;
  sellCount: number;
  holdCount: number;
  uniqueSymbols: string[];
  maxItems: number;
  latestAt?: string | null;
  firstAt?: string | null;
}

export interface AnalysisHistoryPage {
  items: AnalysisHistoryItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface ApiWrapped<T> {
  success?: boolean;
  data?: T;
  message?: string;
  total?: number;
  limit?: number;
  offset?: number;
}

function safeParseJSON<T>(
  value: string,
  fallback: T
): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * پاسخ API را unwrap می‌کند.
 *
 * پشتیبانی از:
 * 1. { success: true, data: ... }
 * 2. داده مستقیم
 */
function unwrapApiData<T>(res: unknown): T {
  if (
    res &&
    typeof res === 'object' &&
    'success' in res
  ) {
    const wrapped =
      res as ApiWrapped<T>;

    if (wrapped.success === false) {
      throw new Error(
        wrapped.message ||
          'خطا در دریافت داده تاریخچه.'
      );
    }

    return (
      wrapped.data ??
      (null as T)
    );
  }

  return res as T;
}

/**
 * result کامل تحلیل را از تمام فرمت‌های
 * احتمالی پاسخ Backend استخراج می‌کند.
 */
function parseResult(
  item: Partial<AnalysisHistoryItem>
): AnalysisResult | null {
  if (
    item.parsedResult &&
    typeof item.parsedResult === 'object'
  ) {
    return item.parsedResult;
  }

  if (
    item.result &&
    typeof item.result === 'object'
  ) {
    return item.result;
  }

  if (
    typeof item.resultJson === 'string' &&
    item.resultJson.trim()
  ) {
    return safeParseJSON<
      AnalysisResult | null
    >(
      item.resultJson,
      null
    );
  }

  if (
    item.resultJson &&
    typeof item.resultJson === 'object'
  ) {
    return item.resultJson as AnalysisResult;
  }

  return null;
}

/**
 * Backend ممکن است stock را برگرداند
 * یا symbol را.
 */
function normalizeHistoryItem(
  item: AnalysisHistoryItem
): AnalysisHistoryItem {
  const parsedResult =
    parseResult(item);

  const stock =
    item.stock ||
    item.symbol ||
    parsedResult?.symbol ||
    '';

  let timestamp = Date.now();

  if (
    typeof item.timestamp === 'number' &&
    Number.isFinite(item.timestamp)
  ) {
    timestamp = item.timestamp;
  } else if (
    item.createdAt ||
    item.created_at
  ) {
    const parsedDate =
      new Date(
        item.createdAt ||
          item.created_at ||
          Date.now()
      ).getTime();

    if (Number.isFinite(parsedDate)) {
      timestamp = parsedDate;
    }
  }

  return {
    ...item,

    symbol: stock,
    stock,

    timestamp,

    recommendation:
      item.recommendation ||
      parsedResult?.recommendation,

    riskLevel:
      item.riskLevel ||
      parsedResult?.riskLevel,

    summary:
      item.summary ||
      parsedResult?.summary,

    result: parsedResult,
    parsedResult,
  };
}

function assertSymbol(
  symbol: string
): void {
  if (
    !symbol ||
    typeof symbol !== 'string' ||
    !symbol.trim()
  ) {
    throw new Error(
      'نماد معتبر نیست.'
    );
  }
}

function normalizePagination(
  limit: number,
  offset: number
) {
  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            100,
            Math.floor(limit)
          )
        )
      : 3;

  const safeOffset =
    Number.isFinite(offset)
      ? Math.max(
          0,
          Math.floor(offset)
        )
      : 0;

  return {
    safeLimit,
    safeOffset,
  };
}

/**
 * ذخیره تحلیل در History
 *
 * Backend:
 * POST /api/v1/analysis-history
 */
export async function addAnalysisToHistory(
  _userId: string,
  payload: AddHistoryPayload
): Promise<AnalysisHistoryItem> {
  assertSymbol(
    payload.symbol
  );

  if (!payload.result) {
    throw new Error(
      'نتیجه کامل تحلیل برای ذخیره تاریخچه موجود نیست.'
    );
  }

  const resultJson =
    JSON.stringify(
      payload.result
    );

  const symbol =
    payload.symbol.trim();

  const raw =
    await appApiFetch<
      | AnalysisHistoryItem
      | ApiWrapped<AnalysisHistoryItem>
    >(
      '/analysis-history',
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          /*
           * stock فیلد اصلی Prisma است.
           */
          stock: symbol,

          /*
           * symbol را هم برای سازگاری
           * با Backendهای قدیمی ارسال می‌کنیم.
           * Controller جدید آن را به stock تبدیل می‌کند.
           */
          symbol,

          recommendation:
            payload.recommendation ||
            payload.result
              .recommendation ||
            'نامشخص',

          riskLevel:
            payload.riskLevel ||
            payload.result
              .riskLevel ||
            'نامشخص',

          summary:
            payload.summary ||
            payload.result.summary ||
            '',

          /*
           * کل نتیجه تحلیل.
           */
          resultJson,
        }),
      }
    );

  const saved =
    unwrapApiData<
      AnalysisHistoryItem
    >(raw);

  if (
    !saved ||
    typeof saved !== 'object'
  ) {
    throw new Error(
      'پاسخ نامعتبر از API تاریخچه دریافت شد.'
    );
  }

  return normalizeHistoryItem(
    saved
  );
}

/**
 * دریافت تاریخچه تحلیل‌ها
 *
 * GET /api/v1/analysis-history
 */
export async function getAnalysisHistory(
  _userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<AnalysisHistoryItem[]> {
  const {
    safeLimit,
    safeOffset,
  } =
    normalizePagination(
      limit,
      offset
    );

  const raw =
    await appApiFetch<
      | AnalysisHistoryItem[]
      | ApiWrapped<
          AnalysisHistoryItem[]
        >
    >(
      `/analysis-history?limit=${safeLimit}&offset=${safeOffset}`
    );

  const items =
    unwrapApiData<
      AnalysisHistoryItem[]
    >(raw);

  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(normalizeHistoryItem)
    .sort(
      (a, b) =>
        b.timestamp -
        a.timestamp
    );
}

/**
 * دریافت یک تحلیل بر اساس ID
 *
 * GET /api/v1/analysis-history/:id
 */
export async function getAnalysisById(
  _userId: string,
  itemId: string | number
): Promise<AnalysisHistoryItem> {
  if (
    itemId === undefined ||
    itemId === null ||
    String(itemId).trim() === ''
  ) {
    throw new Error(
      'شناسه تحلیل معتبر نیست.'
    );
  }

  const raw =
    await appApiFetch<
      | AnalysisHistoryItem
      | ApiWrapped<AnalysisHistoryItem>
    >(
      `/analysis-history/${encodeURIComponent(
        String(itemId)
      )}`
    );

  const item =
    unwrapApiData<
      AnalysisHistoryItem
    >(raw);

  if (
    !item ||
    typeof item !== 'object'
  ) {
    throw new Error(
      'تحلیل موردنظر یافت نشد.'
    );
  }

  return normalizeHistoryItem(
    item
  );
}

/**
 * نام قدیمی تابع برای سازگاری با
 * StockAnalysis.tsx
 *
 * StockAnalysis این تابع را import می‌کند:
 *
 * getAnalysisHistoryItem
 */
export async function getAnalysisHistoryItem(
  _userId: string,
  itemId: string | number
): Promise<AnalysisHistoryItem> {
  return getAnalysisById(
    _userId,
    itemId
  );
}

/**
 * حذف یک تحلیل
 *
 * DELETE /api/v1/analysis-history/:id
 */
export async function deleteAnalysisFromHistory(
  _userId: string,
  itemId: string
): Promise<boolean> {
  if (
    !itemId ||
    !itemId.trim()
  ) {
    throw new Error(
      'شناسه رکورد معتبر نیست.'
    );
  }

  const raw =
    await appApiFetch<
      ApiWrapped<unknown> | unknown
    >(
      `/analysis-history/${encodeURIComponent(
        itemId
      )}`,
      {
        method: 'DELETE',
      }
    );

  if (
    raw &&
    typeof raw === 'object' &&
    'success' in raw
  ) {
    const wrapped =
      raw as ApiWrapped<unknown>;

    if (
      wrapped.success === false
    ) {
      throw new Error(
        wrapped.message ||
          'خطا در حذف رکورد.'
      );
    }
  }

  return true;
}

/**
 * پاک کردن کل تاریخچه
 *
 * DELETE /api/v1/analysis-history/clear
 */
export async function clearAnalysisHistory(
  _userId: string
): Promise<boolean> {
  const raw =
    await appApiFetch<
      ApiWrapped<unknown> | unknown
    >(
      '/analysis-history/clear',
      {
        method: 'DELETE',
      }
    );

  if (
    raw &&
    typeof raw === 'object' &&
    'success' in raw
  ) {
    const wrapped =
      raw as ApiWrapped<unknown>;

    if (
      wrapped.success === false
    ) {
      throw new Error(
        wrapped.message ||
          'خطا در پاکسازی تاریخچه.'
      );
    }
  }

  return true;
}

export async function getAnalysisHistoryStats(_userId: string): Promise<AnalysisHistoryStats> {
  const raw = await appApiFetch<ApiWrapped<AnalysisHistoryStats> | AnalysisHistoryStats>('/analysis-history/stats');
  const data = unwrapApiData<AnalysisHistoryStats>(raw);
  return data ?? { total: 0, buyCount: 0, sellCount: 0, holdCount: 0, uniqueSymbols: [], maxItems: 5000, latestAt: null, firstAt: null };
}

export async function getAnalysisHistoryPage(_userId: string, limit = 20, offset = 0): Promise<AnalysisHistoryPage> {
  const items = await getAnalysisHistory(_userId, limit, offset);
  return { items, total: items.length, limit, offset, hasMore: items.length === limit };
}
