import { apiFetch } from './apiConfigService';
import type { MarketRadarBreadth, MarketRadarIndex, MarketRadarSnapshot, MarketRadarMover, MarketRadarSector } from '../types/marketRadar';

type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};

const unwrap = (value: unknown): unknown => {
  const root = record(value);
  return root.data ?? root.result ?? value;
};

const numberFrom = (value: unknown, keys: string[], fallback: number | null = null): number | null => {
  const source = record(value);
  for (const key of keys) {
    const raw = source[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const parsed = Number(String(raw).replace(/,/g, '').replace(/٬/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const arrayFrom = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const root = record(value);
  for (const key of ['items', 'rows', 'records', 'symbols', 'data']) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  return [];
};

function normalizeIndexRows(payload: unknown): MarketRadarIndex[] {
  const root = record(unwrap(payload));
  const rows = Array.isArray(unwrap(payload)) ? arrayFrom(unwrap(payload)) : [];
  if (rows.length) {
    return rows.map((item) => {
      const row = record(item);
      return {
        name: String(row.name ?? row.title ?? 'شاخص'),
        value: numberFrom(row, ['value', 'index', 'overallIndex', 'marketIndex']),
        changeValue: numberFrom(row, ['changeValue', 'change', 'indexChange'], 0) ?? 0,
        changePercent: numberFrom(row, ['changePercent', 'percentChange', 'indexChangePercent'], 0) ?? 0,
      };
    });
  }

  const value = numberFrom(root, ['index', 'overallIndex', 'value', 'marketIndex', 'indexValue']);
  const changeValue = numberFrom(root, ['changeValue', 'change', 'overallChangeValue', 'indexChange'], 0) ?? 0;
  const changePercent = numberFrom(root, ['changePercent', 'overallChangePercent', 'indexChangePercent', 'percentChange']);
  const equalValue = numberFrom(root, ['equalWeightedValue', 'equalWeightValue', 'equalWeightedIndex', 'equalIndex']);
  const equalChange = numberFrom(root, ['equalWeightedChangeValue', 'equalWeightChangeValue', 'equalWeightedChange', 'equalChange'], 0) ?? 0;
  const equalPercent = numberFrom(root, ['equalWeightedChangePercent', 'equalWeightChangePercent', 'equalChangePercent'], 0) ?? 0;

  const result: MarketRadarIndex[] = [{
    name: 'شاخص کل',
    value,
    changeValue,
    changePercent: changePercent ?? (value && value !== changeValue ? (changeValue / (value - changeValue)) * 100 : 0),
  }];

  if (equalValue !== null) result.push({ name: 'شاخص هم‌وزن', value: equalValue, changeValue: equalChange, changePercent: equalPercent });
  return result;
}

function normalizeMover(item: unknown): MarketRadarMover {
  const row = record(item);
  return {
    symbol: String(row.symbol ?? row.ticker ?? row.code ?? '—'),
    changePercent: numberFrom(row, ['changePercent', 'percentChange', 'change']),
    volume: numberFrom(row, ['volume', 'tradeVolume', 'tradedVolume'], 0) ?? 0,
    value: numberFrom(row, ['value', 'tradeValue', 'tradedValue'], 0) ?? 0,
  };
}

function normalizeSector(item: unknown): MarketRadarSector {
  const row = record(item);
  return {
    name: String(row.name ?? row.title ?? row.industry ?? row.group ?? '—'),
    symbols: numberFrom(row, ['symbols', 'symbolCount', 'count', 'symbolsCount'], 0) ?? 0,
    changePercent: numberFrom(row, ['changePercent', 'percentChange', 'change'], 0) ?? 0,
    value: numberFrom(row, ['value', 'marketValue', 'tradeValue'], 0) ?? 0,
  };
}

function normalizeBreadth(payload: unknown): MarketRadarBreadth | null {
  const root = record(unwrap(payload));
  if (root.available === false && !root.positive && !root.negative && !root.neutral) return null;

  const sectorRoot = record(root.sectors);
  return {
    available: Boolean(root.available),
    positive: numberFrom(root, ['positive'], 0) ?? 0,
    negative: numberFrom(root, ['negative'], 0) ?? 0,
    neutral: numberFrom(root, ['neutral'], 0) ?? 0,
    total: numberFrom(root, ['total', 'classifiedTotal', 'tradedSymbols'], 0) ?? 0,
    positivePercent: numberFrom(root, ['positivePercent'], 0) ?? 0,
    negativePercent: numberFrom(root, ['negativePercent'], 0) ?? 0,
    neutralPercent: numberFrom(root, ['neutralPercent'], 0) ?? 0,
    advanceDeclineRatio: numberFrom(root, ['advanceDeclineRatio']),
    source: typeof root.source === 'string' ? root.source : null,
    coveragePercent: numberFrom(root, ['coveragePercent'], 0) ?? 0,
    topGainers: arrayFrom(root.topGainers).map(normalizeMover).slice(0, 10),
    topLosers: arrayFrom(root.topLosers).map(normalizeMover).slice(0, 10),
    topVolumes: arrayFrom(root.topVolumes).map(normalizeMover).slice(0, 10),
    sectors: {
      available: Boolean(sectorRoot.available),
      leaders: arrayFrom(sectorRoot.leaders).map(normalizeSector).slice(0, 6),
      laggards: arrayFrom(sectorRoot.laggards).map(normalizeSector).slice(0, 6),
      rows: arrayFrom(sectorRoot.rows).map(normalizeSector).slice(0, 20),
    },
    generatedAt: typeof record(root.diagnostics).generatedAt === 'string' ? String(record(root.diagnostics).generatedAt) : null,
  };
}

export async function getMarketRadarSnapshot(): Promise<MarketRadarSnapshot> {
  const [indexResult, breadthResult] = await Promise.allSettled([
    apiFetch('/market/index'),
    apiFetch('/market/breadth'),
  ]);

  const indexPayload = indexResult.status === 'fulfilled' ? indexResult.value : null;
  const breadthPayload = breadthResult.status === 'fulfilled' ? breadthResult.value : null;
  const root = record(unwrap(indexPayload));
  const marketOpen = typeof root.isMarketOpen === 'boolean' ? root.isMarketOpen : true;
  const indices = normalizeIndexRows(indexPayload);
  const breadth = normalizeBreadth(breadthPayload);

  return {
    fetchedAt: new Date().toISOString(),
    marketOpen,
    indices,
    totalValue: numberFrom(root, ['totalValue', 'marketValue', 'tradeValue', 'valueTraded']),
    totalVolume: numberFrom(root, ['totalVolume', 'volume', 'tradeVolume']),
    totalTrades: numberFrom(root, ['totalTrades', 'trades', 'tradeCount']),
    breadth,
  };
}
