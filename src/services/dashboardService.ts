import { apiFetch } from './apiConfigService';
import type { DashboardData, DashboardMarketIndex, DashboardMover } from '../types/dashboard';

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/٬/g, ''));
  return Number.isFinite(n) ? n : null;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

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

  const indices: DashboardMarketIndex[] = [
    { name: 'شاخص کل', value, changeValue, changePercent, isMarketOpen },
  ];
  if (equalValue !== null) {
    indices.push({ name: 'شاخص هم‌وزن', value: equalValue, changeValue: equalChange, changePercent: equalPercent, isMarketOpen });
  }

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
  const source = Array.isArray(value) ? value : Array.isArray(record(value).items) ? record(value).items : [];
  return source.slice(0, 10).map((item) => {
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

export async function getDashboardMovers(): Promise<{ gainers: DashboardMover[]; losers: DashboardMover[] }> {
  try {
    const response = await apiFetch('/market/movers');
    const data = record(unwrap(response));
    const gainers = normalizeMovers(data.gainers ?? data.positive ?? data.topGainers ?? []);
    const losers = normalizeMovers(data.losers ?? data.negative ?? data.topLosers ?? []);
    return { gainers, losers };
  } catch {
    return { gainers: [], losers: [] };
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const [market, movers] = await Promise.all([getDashboardMarket(), getDashboardMovers()]);
  return { market, ...movers, fetchedAt: new Date().toISOString() };
}
