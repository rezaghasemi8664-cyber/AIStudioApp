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

const ENGLISH_TO_PERSIAN: Array<[RegExp, string]> = [
  [/\bSTRONG\s+BUY\b/gi, 'خرید قوی'],
  [/\bSTRONG\s+SELL\b/gi, 'فروش قوی'],
  [/\bBUY\b/gi, 'خرید'],
  [/\bSELL\b/gi, 'فروش'],
  [/\bHOLD\b/gi, 'نگهداری'],
  [/\bNEUTRAL\b/gi, 'خنثی'],
  [/\bBULLISH\b/gi, 'صعودی'],
  [/\bBEARISH\b/gi, 'نزولی'],
  [/\bVERY\s+LOW\b/gi, 'خیلی کم'],
  [/\bVERY\s+HIGH\b/gi, 'خیلی زیاد'],
  [/\bLOW\s+RISK\b/gi, 'ریسک کم'],
  [/\bMEDIUM\s+RISK\b/gi, 'ریسک متوسط'],
  [/\bHIGH\s+RISK\b/gi, 'ریسک زیاد'],
  [/\bLOW\b/gi, 'کم'],
  [/\bMEDIUM\b/gi, 'متوسط'],
  [/\bMODERATE\b/gi, 'متوسط'],
  [/\bHIGH\b/gi, 'زیاد'],
  [/\bYES\b/gi, 'بله'],
  [/\bNO\b/gi, 'خیر'],
  [/\bRECOMMENDATION\b/gi, 'توصیه'],
  [/\bSUMMARY\b/gi, 'خلاصه'],
  [/\bTECHNICAL\s+ANALYSIS\b/gi, 'تحلیل تکنیکال'],
  [/\bFUNDAMENTAL\s+ANALYSIS\b/gi, 'تحلیل بنیادی'],
  [/\bCOMPARISON\s+SUMMARY\b/gi, 'خلاصه مقایسه'],
  [/\bFINAL\s+RECOMMENDATION\b/gi, 'توصیه نهایی'],
  [/\bWINNER\b/gi, 'گزینه برتر'],
  [/\bREASON\b/gi, 'دلیل'],
  [/\bDETAILS\b/gi, 'جزئیات'],
  [/\bRISK\s*LEVEL\b/gi, 'سطح ریسک'],
  [/\bCONFIDENCE\b/gi, 'اطمینان'],
  [/\bCURRENT\s+PRICE\b/gi, 'قیمت فعلی'],
  [/\bTARGET\s+PRICE\b/gi, 'قیمت هدف'],
  [/\bENTRY\s+PRICE\b/gi, 'قیمت ورود'],
  [/\bSTOP\s*LOSS\b/gi, 'حد ضرر'],
  [/\bPRICE\s+CHANGE\b/gi, 'تغییر قیمت'],
  [/\bMARKET\s+CAP(?:ITALIZATION)?\b/gi, 'ارزش بازار'],
  [/\bTECHNICAL\b/gi, 'تکنیکال'],
  [/\bFUNDAMENTAL\b/gi, 'بنیادی'],
  [/\bRISK\b/gi, 'ریسک'],
  [/\bSCORE\b/gi, 'امتیاز'],
  [/\bSCORES\b/gi, 'امتیازها'],
  [/\bDETAIL\b/gi, 'جزئیات'],
  [/\bANALYSIS\b/gi, 'تحلیل'],
  [/\bCURRENT\b/gi, 'فعلی'],
  [/\bTARGET\b/gi, 'هدف'],
  [/\bENTRY\b/gi, 'ورود'],
];

function localizeComparisonText(value: unknown): unknown {
  if (typeof value === 'string') {
    return ENGLISH_TO_PERSIAN.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value).trim();
  }
  if (Array.isArray(value)) return value.map(localizeComparisonText);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, localizeComparisonText(item)]));
  }
  return value;
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
      language: 'fa',
      responseLanguage: 'Persian',
      data: buildComparisonDataPayload(snapshots),
    }),
  });

  return {
    result: localizeComparisonText(unwrap(response)),
    snapshots,
  };
}
