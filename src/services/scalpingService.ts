import apiClient from '../api/apiClient';
import type { ScalpingOpportunity, ScalpingSettings } from '../types';

type UnknownRecord = Record<string, unknown>;

// --- Types ---
export interface ScalpingSignalsResponse {
  signals: ScalpingOpportunity[];
  totalSignals: number;
  activeSignals: number;
  lastUpdate: string | null;
  [key: string]: unknown;
}

export interface ScalpingStatus {
  isRunning: boolean;
  lastRunId: string | number | null;
  lastStatus: string | null;
  lastUpdate: string | null;
  lastUpdated?: string;
  statusCheckedAt?: string;
  todayTrades: number;
  activePositions: number;
  todayPnL: number;
  marketOpen?: boolean;
  marketStatus: {
    isOpen: boolean;
    available: boolean;
    source?: string;
    reason?: string;
    checkedAt?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ScalpingHistoryResult {
  items: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  [key: string]: unknown;
}

export interface StartScalpingResult {
  runId: string | number;
  status: string;
  count: number;
  results: any[];
  errors: any[];
  marketStatus: {
    isOpen: boolean;
    available: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const isObject = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toNumber = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * باز کردن wrapperهای رایج پاسخ API:
 * response.data
 * response.data.data
 * response.data.result
 * response.data.payload
 */
function unwrapData<T>(response: unknown, fallback: T): T {
  let current: unknown = response;

  for (let i = 0; i < 5; i += 1) {
    if (!isObject(current)) break;

    if ('data' in current) {
      const next = current.data;
      if (next === current) break;
      current = next;
      continue;
    }

    if ('result' in current) {
      const next = current.result;
      if (next === current) break;
      current = next;
      continue;
    }

    if ('payload' in current) {
      const next = current.payload;
      if (next === current) break;
      current = next;
      continue;
    }

    break;
  }

  if (current === undefined || current === null) return fallback;
  return current as T;
}

const getCacheBuster = () => `t=${Date.now()}`;

const normalizeMarketStatus = (raw: UnknownRecord | undefined): ScalpingStatus['marketStatus'] => {
  const market = raw ?? {};

  const isOpen =
    typeof market.isOpen === 'boolean'
      ? market.isOpen
      : typeof market.open === 'boolean'
        ? market.open
        : typeof market.status === 'string'
          ? ['open', 'opened', 'running', 'active'].includes(market.status.trim().toLowerCase())
          : false;

  const available =
    typeof market.available === 'boolean'
      ? market.available
      : typeof market.known === 'boolean'
        ? market.known
        : typeof market.isOpen === 'boolean'
          ? true
          : typeof market.open === 'boolean'
            ? true
            : typeof market.status === 'string'
              ? ['open', 'opened', 'running', 'active', 'closed', 'close', 'inactive', 'halted'].includes(
                  market.status.trim().toLowerCase()
                )
              : false;

  return {
    isOpen,
    available,
    source: typeof market.source === 'string' ? market.source : undefined,
    reason: typeof market.reason === 'string' ? market.reason : undefined,
    checkedAt: typeof market.checkedAt === 'string' ? market.checkedAt : undefined
  };
};

const normalizeStatus = (response: unknown): ScalpingStatus => {
  const raw = unwrapData<UnknownRecord>(response, {});
  const marketRaw =
    isObject(raw.marketStatus) ? raw.marketStatus :
    isObject(raw.market) ? raw.market :
    isObject(raw.status) ? raw.status :
    undefined;

  return {
    isRunning: typeof raw.isRunning === 'boolean' ? raw.isRunning : false,
    lastRunId:
      typeof raw.lastRunId === 'string' || typeof raw.lastRunId === 'number'
        ? raw.lastRunId
        : null,
    lastStatus: toStringOrNull(raw.lastStatus),
    lastUpdate: toStringOrNull(raw.lastUpdate),
    lastUpdated: toStringOrNull(raw.lastUpdated) ?? undefined,
    statusCheckedAt: toStringOrNull(raw.statusCheckedAt) ?? undefined,
    todayTrades: toNumber(raw.todayTrades, 0),
    activePositions: toNumber(raw.activePositions, 0),
    todayPnL: toNumber(raw.todayPnL, 0),
    marketOpen: typeof raw.marketOpen === 'boolean' ? raw.marketOpen : undefined,
    marketStatus: normalizeMarketStatus(marketRaw)
  };
};

const normalizeSignalItem = (item: unknown, index: number): ScalpingOpportunity => {
  const row = isObject(item) ? item : {};

  const symbol =
    toStringOrNull(row.symbol) ??
    toStringOrNull(row.ticker) ??
    toStringOrNull(row.name) ??
    `Signal-${index + 1}`;

  const reason =
    toStringOrNull(row.reason) ??
    toStringOrNull(row.description) ??
    toStringOrNull(row.note) ??
    '';

  const priceValue =
    row.price ??
    row.lastPrice ??
    row.close ??
    row.value ??
    row.currentPrice ??
    row.last;

  const scoreValue =
    row.score ??
    row.confidence ??
    row.rank ??
    row.strength ??
    row.rating;

  return {
    ...(row as object),
    id:
      row.id ??
      row._id ??
      `${symbol}-${index + 1}`,
    symbol,
    reason,
    price: toNumber(priceValue, 0),
    score: toNumber(scoreValue, 0),
    createdAt: toStringOrNull(row.createdAt) ?? undefined,
    updatedAt: toStringOrNull(row.updatedAt) ?? undefined
  } as ScalpingOpportunity;
};

const normalizeSignals = (response: unknown): ScalpingSignalsResponse => {
  const raw = unwrapData<unknown>(response, {});

  let list: unknown[] = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (isObject(raw)) {
    if (Array.isArray(raw.signals)) list = raw.signals;
    else if (Array.isArray(raw.items)) list = raw.items;
    else if (Array.isArray(raw.data)) list = raw.data;
    else if (Array.isArray(raw.results)) list = raw.results;
    else if (Array.isArray(raw.opportunities)) list = raw.opportunities;
  }

  const signals = list.map(normalizeSignalItem);

  const lastUpdate =
    isObject(raw) ? toStringOrNull(raw.lastUpdate) ?? toStringOrNull(raw.lastUpdated) : null;

  const totalSignals =
    isObject(raw) && typeof raw.totalSignals === 'number'
      ? raw.totalSignals
      : signals.length;

  const activeSignals =
    isObject(raw) && typeof raw.activeSignals === 'number'
      ? raw.activeSignals
      : signals.length;

  return {
    signals,
    totalSignals,
    activeSignals,
    lastUpdate
  };
};

const normalizeHistory = (response: unknown, page: number, limit: number): ScalpingHistoryResult => {
  const raw = unwrapData<UnknownRecord>(response, {});
  const items = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.data) ? raw.data : [];

  const paginationRaw = isObject(raw.pagination) ? raw.pagination : {};
  return {
    items,
    pagination: {
      page: typeof paginationRaw.page === 'number' ? paginationRaw.page : page,
      limit: typeof paginationRaw.limit === 'number' ? paginationRaw.limit : limit,
      total: typeof paginationRaw.total === 'number' ? paginationRaw.total : items.length,
      pages: typeof paginationRaw.pages === 'number' ? paginationRaw.pages : 0
    }
  };
};

const defaultStatus = (): ScalpingStatus => ({
  isRunning: false,
  lastRunId: null,
  lastStatus: null,
  lastUpdate: null,
  todayTrades: 0,
  activePositions: 0,
  todayPnL: 0,
  marketStatus: {
    isOpen: false,
    available: false
  }
});

const defaultSignals = (): ScalpingSignalsResponse => ({
  signals: [],
  totalSignals: 0,
  activeSignals: 0,
  lastUpdate: null
});

const defaultHistory = (page: number, limit: number): ScalpingHistoryResult => ({
  items: [],
  pagination: { page, limit, total: 0, pages: 0 }
});

const defaultStartResult = (): StartScalpingResult => ({
  runId: 0,
  status: 'failed',
  count: 0,
  results: [],
  errors: [],
  marketStatus: {
    isOpen: false,
    available: false
  }
});

export const scalpingService = {
  async getScalpingStatus(): Promise<ScalpingStatus> {
    try {
      const response = await apiClient.get(`/api/scalping/status?${getCacheBuster()}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });

      return normalizeStatus(response);
    } catch (error) {
      console.error('ScalpingStatus API Error:', error);
      return {
        ...defaultStatus(),
        lastStatus: 'error',
        marketStatus: {
          isOpen: false,
          available: false,
          reason: 'قطع ارتباط با سرور'
        }
      };
    }
  },

  async getScalpingSignals(): Promise<ScalpingSignalsResponse> {
    try {
      const response = await apiClient.get(`/api/scalping/signals?${getCacheBuster()}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });

      return normalizeSignals(response);
    } catch (error) {
      console.error('ScalpingSignals API Error:', error);
      return defaultSignals();
    }
  },

  async getScalpingSettings(): Promise<ScalpingSettings> {
    try {
      const response = await apiClient.get(`/api/scalping/settings?${getCacheBuster()}`);
      return unwrapData<ScalpingSettings>(response, { symbols: [] } as ScalpingSettings);
    } catch (error) {
      console.error('Settings API Error:', error);
      return { symbols: [] } as ScalpingSettings;
    }
  },

  async updateScalpingSettings(payload: Partial<ScalpingSettings>): Promise<ScalpingSettings> {
    try {
      const response = await apiClient.put('/api/scalping/settings', payload);
      return unwrapData<ScalpingSettings>(response, { symbols: [] } as ScalpingSettings);
    } catch (error) {
      console.error('Update Settings API Error:', error);
      return { symbols: [] } as ScalpingSettings;
    }
  },

  async getScalpingHistory(page = 1, limit = 20): Promise<ScalpingHistoryResult> {
    try {
      const response = await apiClient.get('/api/scalping/history', {
        params: { page, limit, t: Date.now() }
      });

      return normalizeHistory(response, page, limit);
    } catch (error) {
      console.error('History API Error:', error);
      return defaultHistory(page, limit);
    }
  },

  async startScalping(payload?: unknown): Promise<StartScalpingResult> {
    try {
      const response = await apiClient.post('/api/scalping/start', payload);
      const raw = unwrapData<UnknownRecord>(response, {});

      const marketRaw = isObject(raw.marketStatus) ? raw.marketStatus : undefined;

      return {
        ...defaultStartResult(),
        ...raw,
        runId:
          typeof raw.runId === 'string' || typeof raw.runId === 'number'
            ? raw.runId
            : 0,
        status: typeof raw.status === 'string' ? raw.status : 'failed',
        count: typeof raw.count === 'number' ? raw.count : 0,
        results: Array.isArray(raw.results) ? raw.results : [],
        errors: Array.isArray(raw.errors) ? raw.errors : [],
        marketStatus: {
          isOpen:
            typeof marketRaw?.isOpen === 'boolean'
              ? marketRaw.isOpen
              : typeof marketRaw?.open === 'boolean'
                ? marketRaw.open
                : false,
          available:
            typeof marketRaw?.available === 'boolean'
              ? marketRaw.available
              : typeof marketRaw?.known === 'boolean'
                ? marketRaw.known
                : false
        }
      };
    } catch (error) {
      console.error('Start Scalping API Error:', error);
      return defaultStartResult();
    }
  },

  async stopScalping(): Promise<{ success: boolean; [key: string]: unknown }> {
    try {
      const response = await apiClient.post('/api/scalping/stop');
      const raw = unwrapData<UnknownRecord>(response, { success: false });
      return {
        success: typeof raw.success === 'boolean' ? raw.success : false,
        ...raw
      };
    } catch (error) {
      console.error('Stop Scalping API Error:', error);
      return { success: false };
    }
  },

  async getScalpingBest(): Promise<unknown> {
    try {
      const response = await apiClient.get(`/api/scalping/best?${getCacheBuster()}`);
      return unwrapData(response, {});
    } catch (error) {
      console.error('Best Scalping API Error:', error);
      return {};
    }
  }
};

export default scalpingService;
