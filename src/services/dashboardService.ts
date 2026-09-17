import { apiFetch } from './apiConfigService';
import * as watchlistService from './watchlistService';
import * as portfolioService from './portfolioService';
import type { DashboardData, DashboardIndustry, DashboardMarketIndex, DashboardMover } from '../types/dashboard';

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/٬/g, ''));
  return Number.isFinite(n) ? n : null;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const unwrap = (value: unknown): unknown => {
  const root = record(value);
  return root.data ?? root.result ?? value;
};

const numberFrom = (value: unknown, keys: string[], fallback: number | null = null): number | null => {
  const source = record(value);
  for (const key of keys) {
    const n = asNumber(source[key]);
    if (n !== null) return n;
  }
  return fallback;
};

export async function getDashboardMarket(): Promise<DashboardData['market']> {
  const response = await apiFetch('/market/index');
  const data = record(unwrap(response));
  const value = numberFrom(data, ['index', 'overallIndex', 'value', 'marketIndex', 'indexValue']);
  const changeValue = numberFrom(data, ['changeValue', 'change', 'overallChangeValue', 'indexChange'], 0) ?? 0;
  const explicitPercent = numberFrom(data, ['changePercent', 'overallChangePercent', 'indexChangePercent', 'percentChange']);
  const changePercent = explicitPercent ?? (value && value - changeValue !== 0 ? (changeValue / (value - changeValue)) * 100 : 0);
  const equalValue = numberFrom(data, ['equalWeightedValue', 'equalWeightValue', 'equalWeightedIndex']);
  const equalChange = numberFrom(data, ['equalWeightedChangeValue', 'equalWeightChangeValue', 'equalWeightedChange'], 0) ?? 0;
  const equalPercent = numberFrom(data, ['equalWeightedChangePercent', 'equalWeightChangePercent', 'equalChangePercent'], 0) ?? 0;
  const isMarketOpen = typeof data.isMarketOpen === 'boolean' ? data.isMarketOpen : true;
  const indices: DashboardMarketIndex[] = [{ name: 'شاخص کل', value, changeValue, changePercent, isMarketOpen }];
  if (equalValue !== null) indices.push({ name: 'شاخص هم‌وزن', value: equalValue, changeValue: equalChange, changePercent: equalPercent, isMarketOpen });
  return {
    updatedAt: new Date().toISOString(),
    indices,
    totalValue: numberFrom(data, ['totalValue', 'marketValue', 'tradeValue', 'valueTraded']),
    totalVolume: numberFrom(data, ['totalVolume', 'volume', 'tradeVolume']),
    totalTrades: numberFrom(data, ['totalTrades', 'trades', 'tradeCount']),
  };
}

const normalizeMovers = (payload: unknown): DashboardMover[] => {
  const value = unwrap(payload);
  const root = record(value);
  const source: unknown[] = Array.isArray(value) ? value : Array.isArray(root.items) ? root.items : [];
  return source.map((item: unknown) => {
    const row = record(item);
    return {
      symbol: String(row.symbol ?? row.ticker ?? row.code ?? '—'),
      name: typeof row.name === 'string' ? row.name : undefined,
      price: numberFrom(row, ['price', 'lastPrice', 'close', 'closingPrice']),
      changePercent: numberFrom(row, ['changePercent', 'percentChange', 'change'], 0) ?? 0,
      volume: numberFrom(row, ['volume', 'tradeVolume']),
    };
  });
};

export async function getDashboardMovers(): Promise<{ gainers: DashboardMover[]; losers: DashboardMover[]; highVolume: DashboardMover[] }> {
  try {
    const response = await apiFetch('/market/movers');
    const data = record(unwrap(response));
    const all = normalizeMovers(data.items ?? data.symbols ?? data.movers ?? []);
    const gainers = normalizeMovers(data.gainers ?? data.positive ?? data.topGainers ?? []).slice(0, 10);
    const losers = normalizeMovers(data.losers ?? data.negative ?? data.topLosers ?? []).slice(0, 10);
    const highVolume = normalizeMovers(data.highVolume ?? data.topVolume ?? data.mostTraded ?? []).slice(0, 10);
    const combined = [...all, ...gainers, ...losers, ...highVolume];
    const unique = new Map<string, DashboardMover>();
    combined.forEach((item) => unique.set(item.symbol, item));
    const fallbackHighVolume = [...unique.values()]
      .filter((item) => item.volume !== null && item.volume !== undefined)
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 10);
    return { gainers, losers, highVolume: highVolume.length ? highVolume : fallbackHighVolume };
  } catch {
    return { gainers: [], losers: [], highVolume: [] };
  }
}

const normalizeIndustries = (payload: unknown): DashboardIndustry[] => {
  const value = unwrap(payload);
  const root = record(value);
  const source: unknown[] = Array.isArray(value) ? value : Array.isArray(root.items) ? root.items : [];
  return source.slice(0, 12).map((item) => {
    const row = record(item);
    return {
      name: String(row.name ?? row.title ?? row.industry ?? row.group ?? '—'),
      changePercent: numberFrom(row, ['changePercent', 'percentChange', 'change'], 0) ?? 0,
      value: numberFrom(row, ['value', 'marketValue', 'tradeValue']),
      symbolCount: numberFrom(row, ['symbolCount', 'count', 'symbolsCount']),
    };
  });
};

export async function getDashboardIndustries(): Promise<DashboardIndustry[]> {
  try {
    const response = await apiFetch('/market/industries');
    return normalizeIndustries(response).sort((a, b) => b.changePercent - a.changePercent);
  } catch {
    return [];
  }
}

export async function getDashboardPersonalSummary(unreadAlertCount: number, subscriptionDaysRemaining: number | null, subscriptionExpired: boolean): Promise<DashboardData['personal']> {
  const [watchlistsResult, portfolioResult] = await Promise.allSettled([watchlistService.getWatchlists(), portfolioService.getPortfolio()]);
  const watchlists = watchlistsResult.status === 'fulfilled' ? watchlistsResult.value : [];
  const portfolio = portfolioResult.status === 'fulfilled' ? portfolioResult.value : [];
  const watchlistSymbolCount = watchlists.reduce((sum, item) => sum + item.symbols.length, 0);
  const portfolioInvestedValue = portfolio.reduce((sum, item) => sum + (Number(item.entryPrice) || 0) * (Number(item.quantity) || 0), 0);
  return { watchlistCount: watchlists.length, watchlistSymbolCount, portfolioCount: portfolio.length, portfolioInvestedValue, unreadAlertCount: Math.max(0, Number(unreadAlertCount) || 0), subscriptionDaysRemaining, subscriptionExpired };
}

export async function getDashboardData(unreadAlertCount = 0, subscriptionDaysRemaining: number | null = null, subscriptionExpired = false): Promise<DashboardData> {
  const [market, movers, industries, personal] = await Promise.all([
    getDashboardMarket(),
    getDashboardMovers(),
    getDashboardIndustries(),
    getDashboardPersonalSummary(unreadAlertCount, subscriptionDaysRemaining, subscriptionExpired),
  ]);
  return { market, ...movers, industries, personal, fetchedAt: new Date().toISOString() };
}
