import { apiFetch } from './apiConfigService';
import type { MarketRadarBreadth, MarketRadarHistory, MarketRadarHistoryRange, MarketRadarIndex, MarketRadarSnapshot, MarketRadarMover, MarketRadarSector, MarketRadarSymbol } from '../types/marketRadar';

type RecordValue = Record<string, unknown>;
type MarketRadarCacheEnvelope = { version: 1; cachedAt: number; snapshot: MarketRadarSnapshot };

const CACHE_KEY = 'ronia_market_radar_cache_v1';
export const MARKET_RADAR_CACHE_TTL_MS = 120_000;

const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const unwrap = (value: unknown): unknown => { const root = record(value); return root.data ?? root.result ?? value; };
const numberFrom = (value: unknown, keys: string[], fallback: number | null = null): number | null => {
  const source = record(value);
  for (const key of keys) { const raw = source[key]; if (raw === null || raw === undefined || raw === '') continue; const parsed = Number(String(raw).replace(/,/g, '').replace(/٬/g, '')); if (Number.isFinite(parsed)) return parsed; }
  return fallback;
};
const arrayFrom = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const root = record(value);
  for (const key of ['items', 'rows', 'records', 'symbols', 'data']) if (Array.isArray(root[key])) return root[key] as unknown[];
  return [];
};

export function readMarketRadarCache(): { snapshot: MarketRadarSnapshot; cachedAt: number; fresh: boolean } | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MarketRadarCacheEnvelope>;
    if (parsed.version !== 1 || !parsed.snapshot || typeof parsed.cachedAt !== 'number') return null;
    return { snapshot: parsed.snapshot, cachedAt: parsed.cachedAt, fresh: Date.now() - parsed.cachedAt < MARKET_RADAR_CACHE_TTL_MS };
  } catch { return null; }
}

export function writeMarketRadarCache(snapshot: MarketRadarSnapshot): void {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1, cachedAt: Date.now(), snapshot } satisfies MarketRadarCacheEnvelope)); } catch { /* cache is optional */ }
}

function normalizeIndexRows(payload: unknown): MarketRadarIndex[] {
  const unwrapped = unwrap(payload);
  const root = record(unwrapped);
  const rows = Array.isArray(unwrapped) ? arrayFrom(unwrapped) : [];
  if (rows.length) return rows.map((item) => { const row = record(item); return { name: String(row.name ?? row.title ?? 'شاخص'), value: numberFrom(row, ['value', 'index', 'overallIndex', 'marketIndex']), changeValue: numberFrom(row, ['changeValue', 'change', 'indexChange'], 0) ?? 0, changePercent: numberFrom(row, ['changePercent', 'percentChange', 'indexChangePercent'], 0) ?? 0 }; });

  // Some BRS selected-index responses are retained as an array in the shared
  // snapshot JSON while the flattened aliases are null. Read those actual rows
  // as a fallback; never calculate or invent a missing index value.
  const selectedRows = Array.isArray(root.selectedIndexes) ? arrayFrom(root.selectedIndexes) : [];
  const normalizeName = (value: unknown) => String(value ?? '')
    .replace(/[\u200c\u200f\u0640\s()[\]،,._-]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک');
  const selected = (predicate: (name: string) => boolean) =>
    selectedRows.map((item) => record(item)).find((row) => predicate(normalizeName(row.name ?? row.title ?? row.indexName ?? row.l30)));
  const selectedValue = (row: Record<string, unknown> | undefined) =>
    row ? numberFrom(row, ['index', 'indexValue', 'value', 'lastIndex', 'index_value']) : null;
  const selectedChange = (row: Record<string, unknown> | undefined) =>
    row ? numberFrom(row, ['indexChange', 'index_change', 'change', 'changeValue']) : null;
  const selectedPercent = (row: Record<string, unknown> | undefined) =>
    row ? numberFrom(row, ['indexChangePercent', 'index_change_percent', 'changePercent', 'change_percent']) : null;

  const value = numberFrom(root, ['index', 'overallIndex', 'value', 'marketIndex', 'indexValue']);
  const changeValue = numberFrom(root, ['changeValue', 'change', 'overallChangeValue', 'indexChange'], 0) ?? 0;
  const changePercent = numberFrom(root, ['changePercent', 'overallChangePercent', 'indexChangePercent', 'percentChange']);
  const equalValue = numberFrom(root, ['equalWeightedValue', 'equalWeightValue', 'equalWeightedIndex', 'equalIndex']);
  const equalChange = numberFrom(root, ['equalWeightedChangeValue', 'equalWeightChangeValue', 'equalWeightedChange', 'equalChange'], 0) ?? 0;
  const equalPercent = numberFrom(root, ['equalWeightedChangePercent', 'equalWeightChangePercent', 'equalChangePercent'], 0) ?? 0;
  const result: MarketRadarIndex[] = [{ name: 'شاخص کل', value, changeValue, changePercent: changePercent ?? (value && value !== changeValue ? (changeValue / (value - changeValue)) * 100 : 0) }];
  if (equalValue !== null) result.push({ name: 'شاخص هم‌وزن', value: equalValue, changeValue: equalChange, changePercent: equalPercent });

  const priceRow = selected((name) => name.includes('شاخصقیمت') && (name.includes('وزنیارزشی') || name.includes('کل')));
  const priceIndex = numberFrom(root, ['priceIndex', 'indexPrice', 'index_price', 'price_index']) ?? selectedValue(priceRow);
  if (priceIndex !== null) result.push({
    name: 'شاخص قیمت',
    value: priceIndex,
    changeValue: numberFrom(root, ['priceIndexChange', 'indexPriceChange', 'index_price_change']) ?? selectedChange(priceRow),
    changePercent: numberFrom(root, ['priceIndexChangePercent', 'indexPriceChangePercent', 'index_price_change_percent']) ?? selectedPercent(priceRow)
  });

  const freeFloatRow = selected((name) => name.includes('آزادشناور'));
  const freeFloatIndex = numberFrom(root, ['freeFloatIndex', 'indexFreeFloat', 'index_freeFloat', 'free_float_index']) ?? selectedValue(freeFloatRow);
  if (freeFloatIndex !== null) result.push({
    name: 'شاخص آزاد شناور',
    value: freeFloatIndex,
    changeValue: numberFrom(root, ['freeFloatIndexChange', 'indexFreeFloatChange', 'index_freeFloat_change']) ?? selectedChange(freeFloatRow),
    changePercent: numberFrom(root, ['freeFloatIndexChangePercent', 'indexFreeFloatChangePercent', 'index_freeFloat_change_percent']) ?? selectedPercent(freeFloatRow)
  });
  return result;
}
function normalizeMover(item: unknown): MarketRadarMover { const row = record(item); return { symbol: String(row.symbol ?? row.ticker ?? row.code ?? '—'), changePercent: numberFrom(row, ['changePercent', 'percentChange', 'change']), volume: numberFrom(row, ['volume', 'tradeVolume', 'tradedVolume'], 0) ?? 0, value: numberFrom(row, ['value', 'tradeValue', 'tradedValue'], 0) ?? 0 }; }
function normalizeSector(item: unknown): MarketRadarSector { const row = record(item); return { name: String(row.name ?? row.title ?? row.industry ?? row.group ?? '—'), symbols: numberFrom(row, ['symbols', 'symbolCount', 'count', 'symbolsCount'], 0) ?? 0, positive: numberFrom(row, ['positive'], 0) ?? 0, negative: numberFrom(row, ['negative'], 0) ?? 0, neutral: numberFrom(row, ['neutral'], 0) ?? 0, changePercent: numberFrom(row, ['changePercent', 'percentChange', 'change'], 0) ?? 0, value: numberFrom(row, ['value', 'marketValue', 'tradeValue'], 0) ?? 0, realMoneyFlow: numberFrom(row, ['realMoneyFlow']), moneyFlowRows: numberFrom(row, ['moneyFlowRows'], 0) ?? 0 }; }
function normalizeBreadth(payload: unknown): MarketRadarBreadth | null {
  const root = record(unwrap(payload)); if (root.available === false && !root.positive && !root.negative && !root.neutral) return null;
  const sectorRoot = record(root.sectors);
  const flowRoot = record(root.realFlow);
  const realFlow = {
    available: Boolean(flowRoot.available),
    rowsWithRealFlow: numberFrom(flowRoot, ['rowsWithRealFlow'], 0) ?? 0,
    totalRealBuyVolume: numberFrom(flowRoot, ['totalRealBuyVolume']),
    totalRealSellVolume: numberFrom(flowRoot, ['totalRealSellVolume']),
    netRealBuyVolume: numberFrom(flowRoot, ['netRealBuyVolume']),
    moneyFlowAvailable: Boolean(flowRoot.moneyFlowAvailable),
    moneyFlowRows: numberFrom(flowRoot, ['moneyFlowRows'], 0) ?? 0,
    totalRealBuyValue: numberFrom(flowRoot, ['totalRealBuyValue']),
    totalRealSellValue: numberFrom(flowRoot, ['totalRealSellValue']),
    netRealMoneyFlow: numberFrom(flowRoot, ['netRealMoneyFlow']),
    realBuyerCount: numberFrom(flowRoot, ['realBuyerCount']),
    realSellerCount: numberFrom(flowRoot, ['realSellerCount']),
    averageRealBuyPerBuyer: numberFrom(flowRoot, ['averageRealBuyPerBuyer']),
    averageRealSellPerSeller: numberFrom(flowRoot, ['averageRealSellPerSeller']),
    perCapitaRatio: numberFrom(flowRoot, ['perCapitaRatio']),
    legalFlowAvailable: Boolean(flowRoot.legalFlowAvailable),
    legalFlowRows: numberFrom(flowRoot, ['legalFlowRows'], 0) ?? 0,
    totalLegalBuyValue: numberFrom(flowRoot, ['totalLegalBuyValue']),
    totalLegalSellValue: numberFrom(flowRoot, ['totalLegalSellValue']),
    netLegalMoneyFlow: numberFrom(flowRoot, ['netLegalMoneyFlow']),
    legalVolumeAvailable: Boolean(flowRoot.legalVolumeAvailable),
    totalLegalBuyVolume: numberFrom(flowRoot, ['totalLegalBuyVolume']),
    totalLegalSellVolume: numberFrom(flowRoot, ['totalLegalSellVolume']),
    unit: flowRoot.unit === 'rial' ? 'rial' as const : flowRoot.unit === 'volume' ? 'volume' as const : null
  };
  const abnormalRoot = record(root.abnormalVolume);
  const queueRoot = record(root.queues);
  const valueComparisonRoot = record(root.marketValueVsAverage);
  return { available: Boolean(root.available), positive: numberFrom(root, ['positive'], 0) ?? 0, negative: numberFrom(root, ['negative'], 0) ?? 0, neutral: numberFrom(root, ['neutral'], 0) ?? 0, total: numberFrom(root, ['total', 'classifiedTotal', 'tradedSymbols'], 0) ?? 0, positivePercent: numberFrom(root, ['positivePercent'], 0) ?? 0, negativePercent: numberFrom(root, ['negativePercent'], 0) ?? 0, neutralPercent: numberFrom(root, ['neutralPercent'], 0) ?? 0, advanceDeclineRatio: numberFrom(root, ['advanceDeclineRatio']), source: typeof root.source === 'string' ? root.source : null, coveragePercent: numberFrom(root, ['coveragePercent'], 0) ?? 0, topGainers: arrayFrom(root.topGainers).map(normalizeMover).slice(0, 10), topLosers: arrayFrom(root.topLosers).map(normalizeMover).slice(0, 10), topVolumes: arrayFrom(root.topVolumes).map(normalizeMover).slice(0, 10), sectors: { available: Boolean(sectorRoot.available), leaders: arrayFrom(sectorRoot.leaders).map(normalizeSector).slice(0, 6), laggards: arrayFrom(sectorRoot.laggards).map(normalizeSector).slice(0, 6), rows: arrayFrom(sectorRoot.rows).map(normalizeSector).slice(0, 100) }, generatedAt: typeof root.generatedAt === 'string' ? root.generatedAt : typeof root.updatedAt === 'string' ? root.updatedAt : typeof record(root.diagnostics).generatedAt === 'string' ? String(record(root.diagnostics).generatedAt) : null, realFlow,
    abnormalVolume: { available: Boolean(abnormalRoot.available), count: numberFrom(abnormalRoot, ['count'], 0) ?? 0, multiplier: numberFrom(abnormalRoot, ['multiplier'], 2) ?? 2, baseline: String(abnormalRoot.baseline ?? '') },
    queues: { available: Boolean(queueRoot.available), classifiedSymbols: numberFrom(queueRoot, ['classifiedSymbols'], 0) ?? 0, buy: numberFrom(queueRoot, ['buy'], 0) ?? 0, sell: numberFrom(queueRoot, ['sell'], 0) ?? 0 },
    marketValueVsAverage: {
      available: Boolean(valueComparisonRoot.available),
      currentValue: numberFrom(valueComparisonRoot, ['currentValue'], 0) ?? 0,
      historicalAverage: numberFrom(valueComparisonRoot, ['historicalAverage']),
      changePercent: numberFrom(valueComparisonRoot, ['changePercent']),
      sampleDays: numberFrom(valueComparisonRoot, ['sampleDays'], 0) ?? 0,
      baseline: String(valueComparisonRoot.baseline ?? '')
    }
  };
}

export async function getMarketRadarSnapshot(): Promise<MarketRadarSnapshot> {
  const [indexResult, breadthResult] = await Promise.allSettled([apiFetch('/market/index'), apiFetch('/market/breadth')]);
  const indexPayload = indexResult.status === 'fulfilled' ? indexResult.value : null; const breadthPayload = breadthResult.status === 'fulfilled' ? breadthResult.value : null;
  if (indexResult.status === 'rejected' && breadthResult.status === 'rejected') throw new Error('Market Radar data unavailable');
  const root = record(unwrap(indexPayload));
  const marketOpen = typeof root.isMarketOpen === 'boolean' ? root.isMarketOpen : false;
  return { fetchedAt: new Date().toISOString(), dataStatus: 'LIVE', source: 'shared-db', stale: false, marketOpen, indices: normalizeIndexRows(indexPayload), totalValue: numberFrom(root, ['totalValue', 'tval', 'marketValue', 'tradeValue', 'totalTradeValue', 'valueTraded']), totalVolume: numberFrom(root, ['totalVolume', 'tvol', 'volume', 'tradeVolume', 'totalTradeVolume']), totalTrades: numberFrom(root, ['totalTrades', 'tno', 'trades', 'tradeCount']), breadth: normalizeBreadth(breadthPayload) };
}

export async function getMarketRadarSymbols(): Promise<MarketRadarSymbol[]> {
  // Read the active AllSymbols snapshot through the shared DB endpoint; no direct BRS request.
  const payload = await apiFetch('/market/symbols?limit=10000');
  return arrayFrom(unwrap(payload)).map((item) => {
    const row = record(item);
    return {
      symbol: String(row.symbol ?? row.ticker ?? ''),
      name: row.name == null ? null : String(row.name),
      sector: row.sector == null ? null : String(row.sector),
      lastPrice: numberFrom(row, ['lastPrice', 'last', 'pl']),
      closePrice: numberFrom(row, ['closePrice', 'closingPrice', 'close', 'pc']),
      lastChangePercent: numberFrom(row, ['lastChangePercent', 'changePercent', 'plp']),
      closeChangePercent: numberFrom(row, ['closeChangePercent', 'closingChangePercent', 'pcp'])
    };
  }).filter((row) => row.symbol && row.sector);
}

export async function getMarketRadarHistory(range: MarketRadarHistoryRange): Promise<MarketRadarHistory> {
  const payload = await apiFetch(`/market/history/radar?range=${encodeURIComponent(range)}`);
  const root = record(unwrap(payload));
  const points = Array.isArray(root.points) ? root.points : [];
  return {
    range: (root.range as MarketRadarHistoryRange) || range,
    granularity: root.granularity === 'intraday' ? 'intraday' : 'daily',
    available: Boolean(root.available) && points.length > 0,
    points: points.map((item) => {
      const row = record(item);
      return {
        timestamp: String(row.timestamp ?? ''),
        index: numberFrom(row, ['index', 'overallIndex']),
        equalWeightedIndex: numberFrom(row, ['equalWeightedIndex', 'equalIndex']),
        totalValue: numberFrom(row, ['totalValue']),
        totalVolume: numberFrom(row, ['totalVolume']),
        totalTrades: numberFrom(row, ['totalTrades'])
      };
    }),
    generatedAt: typeof root.generatedAt === 'string' ? root.generatedAt : null
  };
}
