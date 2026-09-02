import { appApiFetch } from './apiConfigService';

export interface ComparisonMarketSnapshot {
  symbol: string;
  currentPrice: number | null;
  eps: number | null;
  pe: number | null;
  marketCap: number | null;
  baseVolume: number | null;
  priceChangePercent: number | null;
  raw: any;
}

function unwrap(response: any): any {
  let value = response?.data ?? response;
  if (value?.data && typeof value.data === 'object') value = value.data;
  return value;
}

function firstDefined(...values: any[]): any {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function toNumber(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function pick(source: any, paths: string[]): any {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], source);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function normalizeSnapshot(symbol: string, raw: any): ComparisonMarketSnapshot {
  const data = raw && typeof raw === 'object' ? raw : {};
  const price = toNumber(firstDefined(
    pick(data, ['currentPrice', 'lastPrice', 'closingPrice', 'closePrice', 'finalPrice', 'price', 'pl', 'pc']),
    pick(data, ['marketData.lastClosePrice', 'marketData.currentPrice', 'marketData.closingPrice'])
  ));
  const eps = toNumber(firstDefined(
    pick(data, ['eps', 'EPS', 'earningsPerShare', 'eps_ttm']),
    pick(data, ['fundamental.eps', 'fundamentals.eps', 'metrics.eps'])
  ));
  let pe = toNumber(firstDefined(
    pick(data, ['pe', 'PE', 'peRatio', 'priceToEarnings', 'p_e', 'pe_ttm']),
    pick(data, ['fundamental.pe', 'fundamentals.pe', 'metrics.pe'])
  ));

  // If BRS does not provide P/E directly, calculate it only from the same
  // authoritative price/EPS snapshot. Never use an AI-generated P/E.
  if (pe === null && price !== null && eps !== null && eps !== 0) pe = price / eps;

  return {
    symbol,
    currentPrice: price,
    eps,
    pe,
    marketCap: toNumber(firstDefined(
      pick(data, ['marketCap', 'marketCapitalization', 'market_value', 'market_cap']),
      pick(data, ['fundamental.marketCap', 'fundamentals.marketCap'])
    )),
    baseVolume: toNumber(firstDefined(
      pick(data, ['baseVolume', 'base_volume']),
      pick(data, ['fundamental.baseVolume', 'fundamentals.baseVolume'])
    )),
    priceChangePercent: toNumber(firstDefined(
      pick(data, ['priceChangePercent', 'changePercent', 'pctChange', 'chp']),
      pick(data, ['price.closingChangePercent', 'fundamental.priceChangePercent'])
    )),
    raw: data,
  };
}

export async function getComparisonMarketSnapshots(symbols: string[]): Promise<Record<string, ComparisonMarketSnapshot>> {
  const normalizedSymbols = symbols.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean);
  const entries = await Promise.all(normalizedSymbols.map(async (symbol) => {
    const response = await appApiFetch<any>(`/market/symbol/${encodeURIComponent(symbol)}`, { method: 'GET' });
    return [symbol, normalizeSnapshot(symbol, unwrap(response))] as const;
  }));
  return Object.fromEntries(entries);
}

export function buildComparisonDataPayload(snapshots: Record<string, ComparisonMarketSnapshot>) {
  return Object.fromEntries(Object.entries(snapshots).map(([symbol, snapshot]) => [symbol, {
    symbol,
    currentPrice: snapshot.currentPrice,
    closingPrice: snapshot.currentPrice,
    eps: snapshot.eps,
    pe: snapshot.pe,
    marketCap: snapshot.marketCap,
    baseVolume: snapshot.baseVolume,
    priceChangePercent: snapshot.priceChangePercent,
    fundamental: {
      eps: snapshot.eps,
      pe: snapshot.pe,
      marketCap: snapshot.marketCap,
      baseVolume: snapshot.baseVolume,
    },
    source: 'BRS market/symbol snapshot',
  }]));
}

export async function compareStocksWithMarketData(
  symbol1: string,
  symbol2: string,
  settings: { dailyCount: number; weeklyCount: number }
) {
  const symbols = [symbol1, symbol2];
  const snapshots = await getComparisonMarketSnapshots(symbols);
  const response = await appApiFetch<any>('/analyze/compare', {
    method: 'POST',
    body: JSON.stringify({
      symbols,
      dailyCount: settings.dailyCount,
      weeklyCount: settings.weeklyCount,
      data: buildComparisonDataPayload(snapshots),
    }),
  });

  return {
    result: unwrap(response),
    snapshots,
  };
}
