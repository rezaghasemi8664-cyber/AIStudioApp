import { useEffect, useMemo, useRef, useState } from 'react';
import { ChartBarIcon, ClockIcon, MarketIcon, TrashIcon } from './Icons';
import api from '../api/apiClient';
import { getLatestSummary, getSummaryHistory } from '../services/marketSummaryService';
import { exportElementToPdf } from '../utils/exportToPdf';
import toast from 'react-hot-toast';
import * as analysisHistoryService from '../services/analysisHistoryService';
import {
  getAnalysisHistory,
  getAnalysisHistoryItem,
  deleteAnalysisFromHistory,
} from '../services/analysisHistoryService';


import type {
  AnalysisPoint,
  AnalysisResult,
  AnalysisUsage,
  DailySummary,
  MoneyFlowBreakdown,
  OHLCPoint,
  UnifiedMoneyFlow,
  AnalysisMarketMetrics,
} from '../types/analysis';

type AnalysisHistoryItem = {
  id: string;
  symbol: string;
  result: AnalysisResult | null;
  createdAt: string;
};

type MarketSummary = {
  id: number;
  date: string;
  content: string;
  createdAt: string;
  updatedAt?: string | null;
};

type ActiveTab = 'analysis' | 'marketSummary' | 'history';

type UnifiedMarketData = {
  closingPrice: number | null;
  lastTradedPrice: number | null;
  closingPriceChangePercent: number | null;
  lastPriceChangePercent: number | null;
  pe: number | null;
  eps: number | null;
  marketCap: number | null;
  tradedVolume: number | null;
  tradedValue: number | null;
  moneyFlow: UnifiedMoneyFlow | null;
  realMoneyFlow?: UnifiedMoneyFlow | null;
  legalMoneyFlow?: UnifiedMoneyFlow | null;
  dailyCandles: OHLCPoint[];
  adjustedDailyCandles: OHLCPoint[];
  hasAnyAdjustedDailyRawSource?: boolean;
  dailySummary: DailySummary | null;
  dailyCandle: OHLCPoint | null;
  adjustedDailyCandle: OHLCPoint | null;
  marketMetrics?: AnalysisMarketMetrics;
};

type UnifiedAnalysisResult = AnalysisResult & {
  marketData: UnifiedMarketData;
  usage?: AnalysisUsage | null;
  model?: string;
  meta?: Record<string, unknown>;
  analysisDate?: string;
  summary?: string;
  targets?: Record<string, number>;
  stopLoss?: number | null;
  risk_level?: string;
  ontology_version?: string;
  rawData?: unknown;
  marketMetrics?: AnalysisMarketMetrics;
};

type NormalizedAnalysis = {
  rawText: string;
  data: UnifiedAnalysisResult | null;
};

type AnalysisDetailState = {
  id?: string;
  symbol?: string;
  fullText?: string;
  parsedResult?: unknown;
  createdAt?: string;
};

const recommendationMap: Record<string, string> = {
  buy: 'خرید',
  sell: 'فروش',
  hold: 'نگهداری',
  strong_buy: 'خرید قوی',
  strong_sell: 'فروش قوی',
  خرید: 'خرید',
  فروش: 'فروش',
  نگهداری: 'نگهداری',
  'خرید قوی': 'خرید قوی',
  'فروش قوی': 'فروش قوی',
};

const riskMap: Record<string, string> = {
  low: 'کم',
  medium: 'متوسط',
  high: 'زیاد',
  پایین: 'کم',
  متوسط: 'متوسط',
  زیاد: 'زیاد',
  کم: 'کم',
  LOW: 'کم',
  MEDIUM: 'متوسط',
  HIGH: 'زیاد',
};

const trendMap: Record<string, string> = {
  bullish: 'صعودی',
  bearish: 'نزولی',
  neutral: 'خنثی',
  up: 'صعودی',
  down: 'نزولی',
  sideways: 'خنثی',
  صعودی: 'صعودی',
  نزولی: 'نزولی',
  خنثی: 'خنثی',
};

const sentimentMap: Record<string, string> = {
  positive: 'مثبت',
  negative: 'منفی',
  neutral: 'خنثی',
  مثبت: 'مثبت',
  منفی: 'منفی',
  خنثی: 'خنثی',
};

function faNumber(value: string | number | undefined | null) {
  if (value === undefined || value === null || value === '') return '—';
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

function formatNumber(value: number | string | undefined | null) {
  if (value === undefined || value === null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return faNumber(String(value));
  return faNumber(n.toLocaleString('en-US'));
}

function formatPercent(value: number | string | undefined | null) {
  if (value === undefined || value === null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return faNumber(String(value));
  return `${faNumber(n.toLocaleString('en-US', { maximumFractionDigits: 2 }))}%`;
}

function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function toNullableNum(v: unknown): number | null {
  const n = toNum(v);
  return n === undefined ? null : n;
}

function toFiniteNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatDecimal(v: unknown, digits = 2): string {
  const n = toFiniteNumber(v);
  if (n === null) return '—';
  return faNumber(n.toFixed(digits));
}

function clamp(v: unknown, min: number, max: number, fallback = 0) {
  const n = toNum(v);
  if (n === undefined) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function normalizeConfidence(value: unknown): number {
  const n = toNum(value);
  if (n === undefined) return 0;
  const scaled = n <= 1 ? n * 100 : n;
  return Math.round(clamp(scaled, 0, 100, 0));
}

function translateValue(value: string | undefined, map: Record<string, string>) {
  if (!value) return '—';
  const raw = value.trim();
  const lower = raw.toLowerCase();
  return map[raw] ?? map[lower] ?? raw;
}

function parseJsonSafely(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function getPropByAliases<T>(obj: any, aliases: string[], defaultValue: T | null = null): T | null {
  for (const alias of aliases) {
    const v = alias.includes('.') ? getNestedValue(obj, alias) : obj?.[alias];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return defaultValue;
}

function normalizePoint(input: unknown): AnalysisPoint | null {
  if (typeof input === 'number') return { price: input, reason: '' };
  if (typeof input === 'string') {
    const numeric = toNum(input);
    return numeric !== undefined ? { price: numeric, reason: '' } : null;
  }
  if (input && typeof input === 'object') {
    const point = input as Record<string, unknown>;
    const price = toNum(point.price ?? point.value ?? point.level);
    if (price === undefined) return null;
    return {
      price,
      reason:
        typeof point.reason === 'string'
          ? point.reason
          : typeof point.description === 'string'
          ? point.description
          : typeof point.note === 'string'
          ? point.note
          : '',
    };
  }
  return null;
}

function normalizePoints(input: unknown): AnalysisPoint[] {
  if (!Array.isArray(input)) return [];
  return input.map(normalizePoint).filter((item): item is AnalysisPoint => item !== null);
}

function normalizeUsage(input: unknown): AnalysisUsage | undefined {
  if (!input || typeof input !== 'object') return undefined;
  return input as AnalysisUsage;
}

function normalizeMoneyFlow(input: unknown): UnifiedMoneyFlow | null {
  if (typeof input === 'number') {
    return { inflow: null, outflow: null, net: input, buy: null, sell: null };
  }
  const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!value) return null;

  const inflow = toNullableNum(value.inflow ?? value.buy ?? value.realMoneyFlowBuy ?? value.legalMoneyFlowBuy);
  const outflow = toNullableNum(value.outflow ?? value.sell ?? value.realMoneyFlowSell ?? value.legalMoneyFlowSell);
  const explicitNet = toNullableNum(value.net ?? value.realMoneyFlow ?? value.legalMoneyFlow);
  const buy = toNullableNum(value.buy ?? value.inflow);
  const sell = toNullableNum(value.sell ?? value.outflow);

  const net = explicitNet !== null ? explicitNet : inflow !== null && outflow !== null ? inflow - outflow : null;

  if (inflow === null && outflow === null && net === null && buy === null && sell === null) return null;
  return { inflow: inflow ?? 0, outflow: outflow ?? 0, net: net ?? 0, buy, sell };
}

function normalizeBreakdown(input: unknown): MoneyFlowBreakdown | null {
  if (!input || typeof input !== 'object') return null;
  const item = input as Record<string, unknown>;
  const inflow = toNullableNum(item.inflow);
  const outflow = toNullableNum(item.outflow);
  const net = toNullableNum(item.net);
  if (inflow === null && outflow === null && net === null) return null;
  return { inflow: inflow ?? 0, outflow: outflow ?? 0, net: net ?? 0 };
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    const n = toNum(v);
    if (n !== undefined) return n;
  }
  return null;
}

function normalizeCandle(input: unknown): OHLCPoint | null {
  if (!input || typeof input !== 'object') return null;
  const item = input as Record<string, unknown>;

  const date = String(
    getPropByAliases<string>(item, ['date', 'dEven', 'time', 'timestamp', 'dt'], '') ?? ''
  ).trim();

  const open = toNum(getPropByAliases(item, ['open', 'o', 'openPrice', 'first', 'firstPrice', 'pOpen']));
  const high = toNum(getPropByAliases(item, ['high', 'h', 'highPrice', 'max', 'pMax']));
  const low = toNum(getPropByAliases(item, ['low', 'l', 'lowPrice', 'min', 'pMin']));
  const close = toNum(
    getPropByAliases(item, [
      'close',
      'c',
      'closePrice',
      'lastPrice',
      'lastTradedPrice',
      'finalPrice',
      'closingPrice',
      'pDrCotVal',
      'pClosing',
    ])
  );
  const volume = toNum(getPropByAliases(item, ['volume', 'vol', 'qTotTran5J', 'qTotTran']));

  const o = open ?? close;
  const h = high ?? close ?? open;
  const l = low ?? close ?? open;
  const c = close ?? open ?? high ?? low;

  if (o === undefined || h === undefined || l === undefined || c === undefined) return null;

  return {
    date: date || '—',
    open: o,
    high: h,
    low: l,
    close: c,
    ...(volume !== undefined ? { volume } : {}),
  };
}

function normalizeCandleArray(input: unknown): OHLCPoint[] {
  if (!Array.isArray(input)) return [];
  return input.map(normalizeCandle).filter((item): item is OHLCPoint => item !== null);
}

function getArrayLength(input: unknown): number {
  return Array.isArray(input) ? input.length : 0;
}

function getFirstArrayItem<T = unknown>(input: unknown): T | undefined {
  return Array.isArray(input) && input.length > 0 ? (input[0] as T) : undefined;
}

function debugArraySource(label: string, input: unknown, normalized?: OHLCPoint[]): void {
  if (typeof console === 'undefined') return;

  console.log(`[StockAnalysis] ${label}`, {
    isArray: Array.isArray(input),
    rawLength: getArrayLength(input),
    rawFirst: getFirstArrayItem(input),
    normalizedLength: normalized?.length,
    normalizedFirst: normalized?.[0],
  });
}

function normalizeDailySummary(input: unknown): DailySummary | null {
  const item = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!item) return null;

  const high = toNullableNum(getPropByAliases(item, ['high', 'highPrice', 'maxPrice', 'max', 'pMax']));
  const low = toNullableNum(getPropByAliases(item, ['low', 'lowPrice', 'minPrice', 'min', 'pMin']));
  const averageDirect = toNullableNum(
    getPropByAliases(item, ['average', 'averagePrice', 'avgPrice', 'meanPrice', 'pAvg'])
  );
  const open = toNum(getPropByAliases(item, ['open', 'o', 'openPrice', 'first', 'firstPrice', 'pOpen']));
  const close = toNum(
    getPropByAliases(item, [
      'close',
      'c',
      'closePrice',
      'lastPrice',
      'lastTradedPrice',
      'finalPrice',
      'closingPrice',
      'pDrCotVal',
      'pClosing',
    ])
  );

  const averageFromOHLC =
    open !== undefined && high !== null && low !== null && close !== undefined
      ? (open + high + low + close) / 4
      : null;

  const average = averageDirect ?? averageFromOHLC;

  const value = toNullableNum(
    getPropByAliases(item, ['value', 'tradedValue', 'tradeValue', 'qTotCap', 'tval'])
  );

  if (high === null && low === null && average === null && value === null) return null;
  return { high, low, average, value };
}

function normalizeMarketMetrics(input: unknown): AnalysisMarketMetrics | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const mm = input as Record<string, unknown>;

  return {
    pe: pickFirstNumber(mm.pe, mm.peRatio, mm.priceToEarnings),
    eps: pickFirstNumber(mm.eps, mm.earningsPerShare),
    marketCap: pickFirstNumber(
      mm.marketCap,
      mm.market_capitalization,
      mm.capitalization,
      mm.marketCapitalization,
      mm.qTotCap,
      mm.tval
    ),
    priceChangePercent: pickFirstNumber(mm.priceChangePercent, mm.pctChange, mm.changePercent),
    tradedValue: pickFirstNumber(mm.tradedValue, mm.tradeValue, mm.value, mm.qTotCap, mm.tval),
    realMoneyFlow: pickFirstNumber(mm.realMoneyFlow),
    legalMoneyFlow: pickFirstNumber(mm.legalMoneyFlow),
    highPrice: pickFirstNumber(mm.highPrice, mm.high, mm.pMax),
    lowPrice: pickFirstNumber(mm.lowPrice, mm.low, mm.pMin),
    averagePrice: pickFirstNumber(mm.averagePrice, mm.avgPrice, mm.average, mm.pAvg),
    lastPrice: pickFirstNumber(mm.lastPrice, mm.lastTradedPrice, mm.closePrice, mm.finalPrice, mm.closingPrice, mm.pDrCotVal, mm.pClosing),
    realMoneyFlowBreakdown: normalizeBreakdown(mm.realMoneyFlowBreakdown),
    legalMoneyFlowBreakdown: normalizeBreakdown(mm.legalMoneyFlowBreakdown),
  };
}

function getLastHistoryRecord(history: unknown): Record<string, any> | null {
  if (Array.isArray(history) && history.length > 0) {
    const last = history[history.length - 1];
    return last && typeof last === 'object' ? (last as Record<string, any>) : null;
  }
  if (history && typeof history === 'object') return history as Record<string, any>;
  return null;
}

function hasSufficientMarketData(analysis: UnifiedAnalysisResult | null | undefined): boolean {
  if (!analysis?.marketData) return false;

  const md = analysis.marketData;
  const mm = analysis.marketMetrics ?? md.marketMetrics;

  const hasPrice =
    toNum(md.closingPrice) !== undefined ||
    toNum(md.lastTradedPrice) !== undefined ||
    toNum(mm?.lastPrice) !== undefined;

  const hasHistory =
    (md.dailyCandles?.length ?? 0) > 0 ||
    !!md.dailyCandle ||
    (md.adjustedDailyCandles?.length ?? 0) > 0 ||
    !!md.adjustedDailyCandle;

  return hasPrice || hasHistory;
}

function normalizeAnalysisShape(input: unknown): UnifiedAnalysisResult | null {
  if (!input || typeof input !== 'object') return null;

  const source = input as Record<string, any>;
  const marketData = source.marketData ?? {};
  const rawHistory = source.marketHistory ?? marketData.marketHistory ?? [];
  const lastHistoryRecord = getLastHistoryRecord(rawHistory) ?? {};
  const scores = source.scores ?? {};
  const signals = source.signals ?? {};
  const explanations = source.explanations ?? {};

  const sourceMetrics = normalizeMarketMetrics(source.marketMetrics ?? source);
  const mdMetrics = normalizeMarketMetrics(marketData.marketMetrics ?? marketData);
  const mhMetrics = normalizeMarketMetrics(lastHistoryRecord.marketMetrics ?? lastHistoryRecord.metrics ?? lastHistoryRecord);

  const mergedMetrics: AnalysisMarketMetrics | undefined =
    sourceMetrics || mdMetrics || mhMetrics
      ? { ...(sourceMetrics ?? {}), ...(mdMetrics ?? {}), ...(mhMetrics ?? {}) }
      : undefined;

  const canonicalMoneyFlow =
    normalizeMoneyFlow(marketData.moneyFlow ?? lastHistoryRecord.moneyFlow ?? source.moneyFlow) ??
    normalizeMoneyFlow({
      net: pickFirstNumber(source.realMoneyFlow, source.legalMoneyFlow, mergedMetrics?.realMoneyFlow),
    });

  const realMoneyFlow =
    normalizeMoneyFlow(
      marketData.realMoneyFlow ??
        lastHistoryRecord.realMoneyFlow ??
        source.realMoneyFlow ?? {
          net: pickFirstNumber(source.realMoneyFlow, mergedMetrics?.realMoneyFlow),
          inflow: source.realMoneyFlowBuy,
          outflow: source.realMoneyFlowSell,
          buy: source.realMoneyFlowBuy,
          sell: source.realMoneyFlowSell,
        }
    ) ?? null;

  const legalMoneyFlow =
    normalizeMoneyFlow(
      marketData.legalMoneyFlow ??
        lastHistoryRecord.legalMoneyFlow ??
        source.legalMoneyFlow ?? {
          net: pickFirstNumber(source.legalMoneyFlow, mergedMetrics?.legalMoneyFlow),
          inflow: source.legalMoneyFlowBuy,
          outflow: source.legalMoneyFlowSell,
          buy: source.legalMoneyFlowBuy,
          sell: source.legalMoneyFlowSell,
        }
    ) ?? null;

  const historyArray = Array.isArray(rawHistory) ? rawHistory : [];

  const dailySourceCandidates = [
    { label: 'marketData.dailyCandles', value: marketData.dailyCandles },
    { label: 'source.dailyCandles', value: source.dailyCandles },
    { label: 'historyArray', value: historyArray },
    { label: 'marketData.dailyCandle', value: marketData.dailyCandle ? [marketData.dailyCandle] : [] },
    { label: 'lastHistoryRecord.dailyCandle', value: lastHistoryRecord.dailyCandle ? [lastHistoryRecord.dailyCandle] : [] },
    { label: 'source.dailyCandle', value: source.dailyCandle ? [source.dailyCandle] : [] },
  ];

  const adjustedDailySourceCandidates = [
    { label: 'marketData.adjustedDailyCandles', value: marketData.adjustedDailyCandles },
    { label: 'source.adjustedDailyCandles', value: source.adjustedDailyCandles },
    { label: 'marketData.priceHistory.adjustedDaily', value: marketData.priceHistory?.adjustedDaily },
    { label: 'source.priceHistory.adjustedDaily', value: source.priceHistory?.adjustedDaily },
    { label: 'marketData.adjustedCandles', value: marketData.adjustedCandles },
    { label: 'source.adjustedCandles', value: source.adjustedCandles },
    { label: 'marketData.adjustedDailyCandle', value: marketData.adjustedDailyCandle ? [marketData.adjustedDailyCandle] : [] },
    { label: 'source.adjustedDailyCandle', value: source.adjustedDailyCandle ? [source.adjustedDailyCandle] : [] },
  ];

  const dailyCandlesSource =
  dailySourceCandidates.find(({ value }) => Array.isArray(value) && value.length > 0)?.value ?? [];

const adjustedDailyCandlesSource =
  adjustedDailySourceCandidates.find(({ value }) => Array.isArray(value) && value.length > 0)?.value ?? [];

const hasAnyAdjustedDailyRawSource = adjustedDailySourceCandidates.some(
  ({ value }) => Array.isArray(value) && value.length > 0
);

const dailyCandles = normalizeCandleArray(dailyCandlesSource);
const adjustedDailyCandles = normalizeCandleArray(adjustedDailyCandlesSource);

const dailyCandle =
  normalizeCandle(
    marketData.dailyCandle ??
      lastHistoryRecord.dailyCandle ??
      source.dailyCandle
  ) ??
  (dailyCandles.length > 0 ? dailyCandles[dailyCandles.length - 1] : null);

const adjustedDailyCandle =
  normalizeCandle(
    marketData.adjustedDailyCandle ??
      source.adjustedDailyCandle
  ) ??
  (adjustedDailyCandles.length > 0 ? adjustedDailyCandles[adjustedDailyCandles.length - 1] : null);

const hasAdjustedDailyDisplayData =
  adjustedDailyCandles.length > 0 || !!adjustedDailyCandle;

const showAdjustedDailyCandle = hasAdjustedDailyDisplayData;


  if (typeof console !== 'undefined') {
    console.groupCollapsed('[StockAnalysis] candle source debug');

    dailySourceCandidates.forEach(({ label, value }) => {
      debugArraySource(label, value, label === 'historyArray' ? dailyCandles : undefined);
    });

    adjustedDailySourceCandidates.forEach(({ label, value }) => {
      const selected = value === adjustedDailyCandlesSource;
      debugArraySource(label, value, selected ? adjustedDailyCandles : undefined);
    });

    console.log('[StockAnalysis] candle resolution', {
      selectedDailySource:
        dailySourceCandidates.find(({ value }) => value === dailyCandlesSource)?.label ?? 'none',
      selectedAdjustedSource:
        adjustedDailySourceCandidates.find(({ value }) => value === adjustedDailyCandlesSource)?.label ?? 'none',
      dailyCandlesLength: dailyCandles.length,
      adjustedDailyCandlesLength: adjustedDailyCandles.length,
      hasAnyAdjustedDailyRawSource,
      hasAdjustedDailyCandles: adjustedDailyCandles.length > 0,
      dailyFirst: dailyCandles[0],
      adjustedFirst: adjustedDailyCandles[0],
    });

    console.groupEnd();
  }

  const dailySummary = normalizeDailySummary(
    marketData.dailySummary ??
      lastHistoryRecord.dailySummary ??
      source.dailySummary ??
      lastHistoryRecord
  );

  // Canonical TSETMC/BRS mapping
  // closing price = pClosing / pc
  // last traded price = pDrCotVal / pl

  const closingPrice = pickFirstNumber(
    marketData.closingPrice,
    marketData.pClosing,
    marketData.pc,
    marketData.close,

    lastHistoryRecord.closingPrice,
    lastHistoryRecord.pClosing,
    lastHistoryRecord.pc,
    lastHistoryRecord.close,

    source.closingPrice,
    source.pClosing,
    source.pc,
    source.close
  );

  const lastTradedPrice = pickFirstNumber(
    marketData.lastTradedPrice,
    marketData.price?.last,
    marketData.pDrCotVal,
    marketData.pl,
    marketData.last,

    lastHistoryRecord.lastTradedPrice,
    lastHistoryRecord.price?.last,
    lastHistoryRecord.pDrCotVal,
    lastHistoryRecord.pl,
    lastHistoryRecord.last,

    source.lastTradedPrice,
    source.price?.last,
    source.pDrCotVal,
    source.pl,
    source.last
  );


  const lastPriceChangePercent = pickFirstNumber(
    marketData.lastPriceChangePercent,
    marketData.price?.lastChangePercent,
    marketData.lastChangePercent,
    marketData.plp,

    lastHistoryRecord.lastPriceChangePercent,
    lastHistoryRecord.price?.lastChangePercent,
    lastHistoryRecord.lastChangePercent,
    lastHistoryRecord.plp,

    source.lastPriceChangePercent,
    source.price?.lastChangePercent,
    source.lastChangePercent,
    source.plp,

    mergedMetrics?.lastPriceChangePercent,
    (mergedMetrics as any)?.priceChangePercent,
  );

  const calculatedClosingPriceChangePercent =
    closingPrice !== null &&
    lastTradedPrice !== null &&
    lastPriceChangePercent !== null &&
    Number.isFinite(closingPrice) &&
    Number.isFinite(lastTradedPrice) &&
    Number.isFinite(lastPriceChangePercent) &&
    lastTradedPrice > 0 &&
    1 + lastPriceChangePercent / 100 > 0
      ? (() => {
          const referencePrice =
            lastTradedPrice / (1 + lastPriceChangePercent / 100);

          if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
            return null;
          }

          const percent =
            ((closingPrice - referencePrice) / referencePrice) * 100;

          return Number.isFinite(percent)
            ? Number(percent.toFixed(2))
            : null;
        })()
      : null;

  const explicitClosingPriceChangePercent = pickFirstNumber(
    marketData.closingPriceChangePercent,
    marketData.closeChangePercent,
    marketData.pcp,

    lastHistoryRecord.closingPriceChangePercent,
    lastHistoryRecord.closeChangePercent,
    lastHistoryRecord.pcp,

    source.closingPriceChangePercent,
    source.closeChangePercent,
    source.pcp
  );

  const closingPriceChangePercent =
    explicitClosingPriceChangePercent ??
    calculatedClosingPriceChangePercent;

  const pe = pickFirstNumber(marketData.pe, lastHistoryRecord.pe, mergedMetrics?.pe, source.pe);
  const eps = pickFirstNumber(marketData.eps, lastHistoryRecord.eps, mergedMetrics?.eps, source.eps);

  const marketCap = pickFirstNumber(
    marketData.marketCap, marketData.marketValue, marketData.qTotCap, marketData.tval,
    lastHistoryRecord.marketCap, lastHistoryRecord.marketValue, lastHistoryRecord.qTotCap, lastHistoryRecord.tval,
    mergedMetrics?.marketCap, source.marketCap, source.marketValue, source.qTotCap, source.tval
  );

  const tradedVolume = pickFirstNumber(
    marketData.tradedVolume, marketData.volume, marketData.vol, marketData.qTotTran5J,
    lastHistoryRecord.tradedVolume, lastHistoryRecord.volume, lastHistoryRecord.vol, lastHistoryRecord.qTotTran5J,
    source.tradedVolume, source.volume, source.vol, source.qTotTran5J
  );

  const tradedValue = pickFirstNumber(
    marketData.tradedValue, marketData.tradeValue, marketData.value, marketData.qTotCap, marketData.tval,
    lastHistoryRecord.tradedValue, lastHistoryRecord.tradeValue, lastHistoryRecord.value, lastHistoryRecord.qTotCap, lastHistoryRecord.tval, lastHistoryRecord.qTotTran5J,
    mergedMetrics?.tradedValue, source.tradedValue, source.tradeValue, source.value, source.qTotCap, source.tval, source.qTotTran5J, dailySummary?.value
  );

  const normalized: UnifiedAnalysisResult = {
    symbol: source.symbol ?? 'نامشخص',
    summary: source.summary ?? '',
    recommendation: source.recommendation ?? 'hold',
    riskLevel: source.riskLevel ?? source.risk_level ?? 'medium',
    shortTermTrend: source.shortTermTrend ?? source.short_term_trend ?? 'neutral',
    mediumTermTrend: source.mediumTermTrend ?? source.medium_term_trend ?? 'neutral',
    sentiment: source.sentiment ?? 'neutral',
    confidence: normalizeConfidence(source.confidence),
    analysisDate: source.analysisDate ?? source.analysis_date ?? source.createdAt ?? new Date().toISOString(),
    meta: source.meta ?? {},
    model: source.model,
    usage: normalizeUsage(source.usage) ?? null,
    rawData: source.rawData,
    ontology_version: source.ontology_version,
    risk_level: source.risk_level,
    marketMetrics: mergedMetrics,

    marketData: {
      closingPrice,
      lastTradedPrice,
      closingPriceChangePercent,
      lastPriceChangePercent,
      pe,
      eps,
      marketCap,
      tradedVolume,
      tradedValue,
      moneyFlow: canonicalMoneyFlow,
      realMoneyFlow,
      legalMoneyFlow,
      dailyCandles,
      adjustedDailyCandles,
      hasAnyAdjustedDailyRawSource,
      dailySummary,
      dailyCandle,
      adjustedDailyCandle,
      marketMetrics: mergedMetrics,
    },

    scores: {
      fundamentalScore: clamp(scores.fundamentalScore ?? source.fundamentalScore ?? scores.fundamental ?? source.fundamental, 0, 100, 0),
      technicalScore: clamp(scores.technicalScore ?? source.technicalScore ?? scores.technical ?? source.technical, 0, 100, 0),
    },

    signals: {
      entryPoints: normalizePoints(signals.entryPoints ?? source.entryPoints),
      exitPoints: normalizePoints(signals.exitPoints ?? source.exitPoints),
      stopLoss: toNum(signals.stopLoss ?? source.stopLoss) ?? null,
      targets:
        signals.targets && typeof signals.targets === 'object'
          ? signals.targets
          : source.targets && typeof source.targets === 'object'
          ? source.targets
          : {},
      timeframe: signals.timeframe ?? source.timeframe ?? 'روزانه',
    },

    explanations: {
      fundamental: explanations.fundamental ?? source.fundamentalAnalysis ?? source.detailedFundamentalExplanation ?? '',
      technical: explanations.technical ?? source.technicalAnalysis ?? source.detailedTechnicalExplanation ?? '',
      additional: explanations.additional ?? source.additionalExplanation ?? source.details ?? '',
    },

    targets:
      signals.targets && typeof signals.targets === 'object'
        ? signals.targets
        : source.targets && typeof source.targets === 'object'
        ? source.targets
        : {},
    stopLoss: toNum(signals.stopLoss ?? source.stopLoss),
  };

  return normalized;
}

function normalizeAnalysisResponse(payload: any): NormalizedAnalysis {
  const root = payload?.data ?? payload?.result ?? payload?.analysis ?? payload?.message ?? payload;

  if (!root) return { rawText: 'پاسخ تحلیل دریافت نشد.', data: null };

  if (root && typeof root === 'object' && root.data && typeof root.data === 'object') {
    const nested = normalizeAnalysisShape(root.data);
    return {
      rawText: typeof root.content === 'string' ? root.content : JSON.stringify(root.data, null, 2),
      data: nested,
    };
  }

  if (typeof root === 'string') {
    const parsed = parseJsonSafely(root);
    if (parsed && typeof parsed === 'object') return { rawText: root, data: normalizeAnalysisShape(parsed) };
    return { rawText: root, data: null };
  }

  if (typeof root === 'object') return { rawText: JSON.stringify(root, null, 2), data: normalizeAnalysisShape(root) };

  return { rawText: String(root), data: null };
}

function getRecommendationTone(recommendation?: string) {
  const value = (recommendation || '').toLowerCase();
  if (value.includes('buy') || value.includes('خرید')) {
    return { text: 'text-emerald-800', bg: 'bg-emerald-50', border: 'border-emerald-200' };
  }
  if (value.includes('sell') || value.includes('فروش')) {
    return { text: 'text-rose-800', bg: 'bg-rose-50', border: 'border-rose-200' };
  }
  return { text: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200' };
}

function getRiskTone(risk?: string) {
  const value = (risk || '').toLowerCase();
  if (value.includes('کم') || value.includes('low')) return 'text-emerald-700';
  if (value.includes('زیاد') || value.includes('high')) return 'text-rose-700';
  return 'text-amber-700';
}

function getPercentToneClass(value: number | null | undefined) {
  if ((value ?? 0) > 0) return 'text-emerald-700';
  if ((value ?? 0) < 0) return 'text-rose-700';
  return 'text-slate-900';
}

function SectionHeader({
  title,
  subtitle,
  tone = 'slate',
}: {
  title: string;
  subtitle?: string;
  tone?: 'slate' | 'blue' | 'emerald' | 'rose' | 'indigo';
}) {
  const toneMap: Record<string, string> = {
    slate: 'text-slate-900',
    blue: 'text-blue-900',
    emerald: 'text-emerald-900',
    rose: 'text-rose-900',
    indigo: 'text-indigo-900',
  };

  return (
    <div className="mb-3">
      <div className={`text-[15px] font-bold leading-6 ${toneMap[tone]}`}>{title}</div>
      {subtitle ? <div className="mt-1 text-[12px] font-medium leading-5 text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = 'slate',
  valueClassName,
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'blue' | 'emerald' | 'rose' | 'amber' | 'indigo' | 'violet';
  valueClassName?: string;
}) {
  const toneClasses: Record<string, string> = {
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900',
    violet: 'border-violet-200 bg-violet-50 text-violet-900',
  };

  return (
    <div className={`rounded-xl border p-3 ${toneClasses[tone]}`}>
      <div className="text-[11px] font-semibold leading-5 text-slate-500">{label}</div>
      <div className={`mt-1 text-[17px] font-extrabold leading-7 ${valueClassName ?? ''}`}>{value}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClassName = 'text-slate-900',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-[13px] font-medium leading-6 text-slate-500">{label}</span>
      <span className={`text-left text-[14px] font-semibold leading-6 ${valueClassName}`}>{value}</span>
    </div>
  );
}

/**
 * Fallback local chart
 * اگر در پروژه‌ات CandleChart واقعی داری، این کامپوننت را حذف کن
 * و import واقعی را جایگزین کن.
 */
function CandleChart({
  data,
}: {
  data: OHLCPoint[];
  theme?: string;
}) {
  const latest = data[data.length - 1];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-[12px] font-semibold text-slate-500">
        تعداد کندل: {faNumber(data.length)}
      </div>

      {latest ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MetricCard label="باز" value={formatNumber(latest.open)} tone="slate" />
          <MetricCard label="بسته" value={formatNumber(latest.close)} tone="blue" />
          <MetricCard label="بیشینه" value={formatNumber(latest.high)} tone="emerald" />
          <MetricCard label="کمینه" value={formatNumber(latest.low)} tone="rose" />
        </div>
      ) : (
        <div className="text-[13px] font-medium text-slate-500">داده‌ای برای نمایش نمودار موجود نیست.</div>
      )}
    </div>
  );
}


export default function StockAnalysis() {
  const reportRef = useRef<HTMLDivElement | null>(null);

  const [analysisUsage, setAnalysisUsage] = useState<AnalysisUsage | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('analysis');
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<UnifiedAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryItem[]>([]);
  const [showHistoryLimitWarning, setShowHistoryLimitWarning] = useState(false);
  const [marketSummary, setMarketSummary] = useState<MarketSummary | null>(null);
  const [marketSummaryHistory, setMarketSummaryHistory] = useState<MarketSummary[]>([]);
  const [selectedMarketSummaryId, setSelectedMarketSummaryId] = useState<number | null>(null);
  const [isLoadingMarketSummary, setIsLoadingMarketSummary] = useState(false);
  const [isLoadingMarketSummaryHistory, setIsLoadingMarketSummaryHistory] = useState(false);
  const [hasUnreadMarketSummary, setHasUnreadMarketSummary] = useState(false);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [selectedAnalysisDetail, setSelectedAnalysisDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  
useEffect(() => {
  let cancelled = false;

  const loadHistory = async () => {
    try {
      const items = await getAnalysisHistory('');

      if (cancelled) return;

      setAnalysisHistory(
        items
          .filter((item) => item.id)
          .map((item) => ({
            id: String(item.id),
            symbol: item.symbol || item.stock || '',
            result:
              item.parsedResult ??
              item.result ??
              null,
            createdAt:
              item.createdAt ??
              item.created_at ??
              new Date(item.timestamp).toISOString(),
          }))
      );
    } catch (error) {
      console.error(
        '[StockAnalysis] failed to load history:',
        error
      );
    }
  };

  loadHistory();

  return () => {
    cancelled = true;
  };
}, []);

   // تابع فراخوانی جزئیات از سرور
  const fetchAnalysisDetail = async (id: string) => {
  if (!id) return;

  setLoadingDetail(true);
  setDetailError(null);
  setSelectedAnalysisId(id);

  try {
    const item = await getAnalysisHistoryItem('', id);

    const fullResult =
      item.parsedResult ??
      item.result ??
      (
        typeof item.resultJson === 'string'
          ? parseJsonSafely(item.resultJson)
          : item.resultJson
      );

    if (!fullResult || typeof fullResult !== 'object') {
      throw new Error(
        'نسخه کامل تحلیل در تاریخچه موجود نیست.'
      );
    }

    const normalized =
      normalizeAnalysisShape(fullResult);

    if (!normalized) {
      throw new Error(
        'ساختار تحلیل ذخیره‌شده قابل پردازش نیست.'
      );
    }

    setSelectedSymbol(
      item.symbol ||
      item.stock ||
      (normalized as any).symbol ||
      ''
    );

    setAnalysisData(normalized);

    setAnalysisResult(
      typeof fullResult === 'string'
        ? fullResult
        : JSON.stringify(fullResult, null, 2)
    );

    setSelectedAnalysisDetail({
      ...item,
      parsedResult: fullResult,
    });

    setAnalysisError(null);

    // بعد از کلیک، مستقیماً صفحه کامل تحلیل نمایش داده شود
    setActiveTab('analysis');

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  } catch (error) {
    console.error(
      '[StockAnalysis] failed to open history detail:',
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : 'دریافت تحلیل کامل ناموفق بود.';

    setDetailError(message);
    toast.error(message);
  } finally {
    setLoadingDetail(false);
  }
};

  const analyzeStock = async (symbol: string) => {
    const trimmedSymbol = symbol.trim();

    if (!trimmedSymbol) {
      throw new Error('نماد سهم الزامی است.');
    }

    const response = await api.post('/analyze/stock', { symbol: trimmedSymbol }, { timeout: 60000 });
    return normalizeAnalysisResponse(response.data);
  };

 
const toMarketSummaryView = (item: any): MarketSummary | null => {
  if (!item || typeof item !== 'object') return null;

  const content =
    typeof item.content === 'string' && item.content.trim()
      ? item.content.trim()
      : typeof item.summary === 'string' && item.summary.trim()
        ? item.summary.trim()
        : '';

  const createdAt =
    typeof item.createdAt === 'string' && item.createdAt
      ? item.createdAt
      : typeof item.updatedAt === 'string' && item.updatedAt
        ? item.updatedAt
        : '';

  const id = Number(item.id);
  if (!Number.isFinite(id) || !createdAt) return null;

  return {
    id,
    date: typeof item.date === 'string' ? item.date : createdAt,
    content: content || 'محتوای خلاصه بازار در دسترس نیست.',
    createdAt,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : null,
  };
};

const fetchMarketSummaryHistory = async () => {
  const response = await getSummaryHistory(1, 5);
  const items = (response?.data ?? [])
    .map(toMarketSummaryView)
    .filter((item): item is MarketSummary => item !== null)
    .sort((a, b) => {
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      return bt - at;
    })
    .slice(0, 5);

  return items;
};

const fetchMarketSummary = async () => {
  try {
    const response = await getLatestSummary();
    return toMarketSummaryView(response);
  } catch (error) {
    console.error('[MarketSummary] Error fetching market summary:', error);
    return null;
  }
};

    
  const renderAnalysisHistory = () => {
  if (false) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-center">در حال بارگذاری...</div>
      </div>
    );
  }

  if (analysisHistory.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        تاریخچه تحلیلی یافت نشد.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {analysisHistory.map((item) => (
  <div
    key={item.id}
    onClick={() => openHistoryItem(item.id)}
    role="button"
    tabIndex={0}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openHistoryItem(item.id);
      }
    }}
    className="bg-gray-800 p-4 rounded-lg border border-gray-700 relative group cursor-pointer hover:border-blue-500 hover:bg-gray-750 transition-all duration-200"
  >
    <div className="flex justify-between items-start mb-2">
      <div>
        <span className="text-lg font-bold text-white ml-2">
          {item.symbol}
        </span>
      </div>
    </div>
  </div>
))}
    </div>
  );
};

               
  const handleExportPdf = async () => {
  const reportEl = reportRef.current;

  if (!analysisData || !reportEl) {
    toast.error('محتوای گزارش برای خروجی PDF آماده نیست.');
    return;
  }

  const rect = reportEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    toast.error('گزارش هنوز کامل رندر نشده است.');
    return;
  }

  const toastId = toast.loading('در حال آماده سازی فایل PDF...');

  try {
    const symbol =
      String(analysisData.symbol ?? selectedSymbol ?? 'UNKNOWN').trim() || 'UNKNOWN';

    const formattedAnalysisDate = analysisData.analysisDate
      ? (() => {
          const date = new Date(analysisData.analysisDate);
          return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fa-IR');
        })()
      : '';

    await exportElementToPdf({
      element: reportEl,
      fileName: `stock-analysis-${symbol}.pdf`,
      title: `گزارش تحلیل نماد ${symbol}`,
      subtitle: formattedAnalysisDate ? `تاریخ تحلیل: ${formattedAnalysisDate}` : undefined,
      logoSrc: undefined,
    });

    toast.success('فایل PDF با موفقیت دانلود شد.', { id: toastId });
  } catch (error) {
    console.error('PDF export failed:', error);
    toast.error(
      error instanceof Error ? error.message : 'دریافت خروجی PDF ناموفق بود.',
      { id: toastId }
    );
  }
};
  const startAnalysis = async () => {
    if (isAnalyzing) return;

    const trimmedSymbol = selectedSymbol.trim();

    if (!trimmedSymbol) {
      setAnalysisError('نماد سهم را وارد کنید.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setShowHistoryLimitWarning(false);

    try {
      const response = await analyzeStock(trimmedSymbol);

      if (response.data && !hasSufficientMarketData(response.data)) {
        throw new Error('خطای تحلیل داده بازار برای این نماد کافی و قابل اتکا نیست؛ تحلیل متوقف شد');
      }

      setAnalysisResult(response.rawText);
      setAnalysisData(response.data);
try {
  const latestHistory = await getAnalysisHistory('', 3, 0);

  setAnalysisHistory(
    latestHistory
      .filter((item) => item.id)
      .map((item) => ({
        id: String(item.id),
        symbol: item.symbol || item.stock || '',
        result:
          item.parsedResult ??
          item.result ??
          null,
        createdAt:
          item.createdAt ??
          item.created_at ??
          new Date(item.timestamp).toISOString(),
      }))
  );
} catch (historyError) {
  console.error(
    '[StockAnalysis] failed to refresh history:',
    historyError
  );
}
           
    } catch (e: any) {
      setAnalysisResult(null);
      setAnalysisData(null);
      setAnalysisError(e?.response?.data?.message || e?.message || 'خطا در تحلیل');
    } finally {
      setIsAnalyzing(false);
    }
  };

const clearCurrentAnalysis = () => {
  setAnalysisResult(null);
  setAnalysisData(null);
  setAnalysisError(null);
};

  useEffect(() => {
    if (activeTab !== 'marketSummary') return;

    let isMounted = true;

    const loadMarketSummary = async () => {
      setIsLoadingMarketSummaryHistory(true);

      try {
        const [latest, history] = await Promise.all([
          fetchMarketSummary(),
          fetchMarketSummaryHistory(),
        ]);

        if (!isMounted) return;

        setMarketSummaryHistory(history);

        // ????? ???? ????? ????? ???? ???? ?? ????? ?????.
        // ??????? ??? ?? ?????? ???? ????? ????? ???? ?????.
        if (latest?.content?.trim()) {
          setMarketSummary(latest);
          setSelectedMarketSummaryId(null);
        } else if (selectedMarketSummaryId !== null) {
          const selected = history.find(
            (item) => item.id === selectedMarketSummaryId
          );

          if (selected) {
            setMarketSummary(selected);
          } else {
            setSelectedMarketSummaryId(null);
            setMarketSummary(null);
          }
        } else {
          setMarketSummary(null);
        }

        setHasUnreadMarketSummary(false);
      } catch (error) {
        console.error(
          '[MarketSummary] failed to load latest/history:',
          error
        );
      } finally {
        if (isMounted) {
          setIsLoadingMarketSummaryHistory(false);
        }
      }
    };

    void loadMarketSummary();

    return () => {
      isMounted = false;
    };
  }, [activeTab]);



  const removeHistoryItem = async (id: string) => {
  if (!window.confirm('این تحلیل حذف شود؟')) {
    return;
  }

  try {
    await deleteAnalysisFromHistory('', id);

    setAnalysisHistory((prev) =>
      prev.filter((item) => item.id !== id)
    );

    toast.success('تحلیل از تاریخچه حذف شد.');
  } catch (error) {
    console.error(
      '[StockAnalysis] failed to delete history item:',
      error
    );

    toast.error(
      error instanceof Error
        ? error.message
        : 'حذف تحلیل ناموفق بود.'
    );
  }
};

  const openHistoryItem = async (id: string) => {
  try {
    const item = await getAnalysisHistoryItem('', id);

    const fullResult =
      item.parsedResult ??
      item.result;

    if (!fullResult) {
      throw new Error(
        'نسخه کامل تحلیل در تاریخچه موجود نیست.'
      );
    }

    const normalized = normalizeAnalysisShape(fullResult);

    setSelectedSymbol(
      item.symbol || normalized?.symbol || ''
    );

    setAnalysisData(normalized);
    setAnalysisResult(
      JSON.stringify(fullResult, null, 2)
    );

    setAnalysisError(null);
    setActiveTab('analysis');
  } catch (error) {
    console.error(
      '[StockAnalysis] failed to open history item:',
      error
    );

    toast.error(
      error instanceof Error
        ? error.message
        : 'دریافت تحلیل کامل ناموفق بود.'
    );
  }
};

  const analysisMeta = useMemo(() => {
    if (!analysisData) return null;

    return {
      recommendation: translateValue(
        typeof analysisData.recommendation === 'string' ? analysisData.recommendation : undefined,
        recommendationMap
      ),
      riskLevel: translateValue(
        typeof analysisData.riskLevel === 'string' ? analysisData.riskLevel : undefined,
        riskMap
      ),
      shortTermTrend: translateValue(
        typeof analysisData.shortTermTrend === 'string' ? analysisData.shortTermTrend : undefined,
        trendMap
      ),
      mediumTermTrend: translateValue(
        typeof analysisData.mediumTermTrend === 'string' ? analysisData.mediumTermTrend : undefined,
        trendMap
      ),
      sentiment: translateValue(
        typeof analysisData.sentiment === 'string' ? analysisData.sentiment : undefined,
        sentimentMap
      ),
      confidence: analysisData.confidence ?? 0,
      fundamentalScore: analysisData.scores?.fundamentalScore ?? 0,
      technicalScore: analysisData.scores?.technicalScore ?? 0,
    };
  }, [analysisData]);

  const entryPoints = analysisData?.signals?.entryPoints ?? [];
  const exitPoints = analysisData?.signals?.exitPoints ?? [];
  const targets = analysisData?.signals?.targets ?? analysisData?.targets ?? {};
  const stopLoss = analysisData?.signals?.stopLoss ?? analysisData?.stopLoss;

  const recommendationTone = getRecommendationTone(
    typeof analysisData?.recommendation === 'string' ? analysisData.recommendation : undefined
  );

  const riskToneClass = getRiskTone(
    typeof analysisData?.riskLevel === 'string' ? analysisData.riskLevel : undefined
  );

  const resolvedMarketMetrics = useMemo<AnalysisMarketMetrics | undefined>(() => {
    return analysisData?.marketData?.marketMetrics ?? analysisData?.marketMetrics;
  }, [analysisData]);

  const dailyCandles = analysisData?.marketData?.dailyCandles ?? [];
  const adjustedDailyCandles = analysisData?.marketData?.adjustedDailyCandles ?? [];
  const hasAnyAdjustedDailyRawSource =
  analysisData?.marketData?.hasAnyAdjustedDailyRawSource ?? false;
  const dailyCandleToShow = analysisData?.marketData?.dailyCandle ?? dailyCandles[dailyCandles.length - 1] ?? null;
  const adjustedCandleToShow =
    analysisData?.marketData?.adjustedDailyCandle ??
    adjustedDailyCandles[adjustedDailyCandles.length - 1] ??
    null;

  const hasAdjustedDailyDisplayData = adjustedDailyCandles.length > 0 || !!adjustedCandleToShow;
  const showAdjustedDailyCandle = hasAdjustedDailyDisplayData;
  const theme = 'light';

  const chartData = useMemo(() => {
      if (hasAdjustedDailyDisplayData) {
      if (adjustedDailyCandles.length > 0) return adjustedDailyCandles;
      if (adjustedCandleToShow) return [adjustedCandleToShow];
      return [];
    }

    if (dailyCandles.length > 0) return dailyCandles;
    if (dailyCandleToShow) return [dailyCandleToShow];
    return [];
  }, [
    hasAdjustedDailyDisplayData,
    adjustedDailyCandles,
    adjustedCandleToShow,
    dailyCandles,
    dailyCandleToShow,
  ]);

  const marketDataResolved = useMemo(() => {
    const md = (analysisData?.marketData ?? {}) as any;
    const mm = (resolvedMarketMetrics ?? {}) as any;
    const raw = (analysisData?.rawData ?? analysisData) as any;
    const rawMarketData = raw?.marketData ?? {};
    const rawPayload = raw?.analysisPayload ?? {};

    // Canonical TSETMC/BRS mapping
    // closing price = pClosing / pc
    // last traded price = pDrCotVal / pl

    const closingPrice = pickFirstNumber(
      md?.closingPrice,
      (md as any)?.price?.closing,
      (md as any)?.pClosing,
      (md as any)?.pc,
      (md as any)?.close,

      rawMarketData?.closingPrice,
      rawMarketData?.price?.closing,
      rawMarketData?.pClosing,
      rawMarketData?.pc,
      rawMarketData?.close,

      rawPayload?.closingPrice,
      rawPayload?.price?.closing,
      rawPayload?.pClosing,
      rawPayload?.pc,
      rawPayload?.close,

      raw?.price?.closing,
      raw?.pClosing,
      raw?.pc,
      raw?.close
    );

    const lastTradedPrice = pickFirstNumber(
      md?.lastTradedPrice,
      (md as any)?.price?.last,
      (md as any)?.pDrCotVal,
      (md as any)?.pl,
      (md as any)?.last,

      rawMarketData?.lastTradedPrice,
      rawMarketData?.price?.last,
      rawMarketData?.pDrCotVal,
      rawMarketData?.pl,
      rawMarketData?.last,

      rawPayload?.lastTradedPrice,
      rawPayload?.price?.last,
      rawPayload?.pDrCotVal,
      rawPayload?.pl,
      rawPayload?.last,

      raw?.price?.last,
      raw?.pDrCotVal,
      raw?.pl,
      raw?.last
    );

    const closingPriceChangePercent = pickFirstNumber(
      md?.closingPriceChangePercent,
      (md as any)?.price?.closingChangePercent,
      (md as any)?.closeChangePercent,
      (md as any)?.pcp,

      mm?.closingPriceChangePercent,

      rawMarketData?.closingPriceChangePercent,
      rawMarketData?.price?.closingChangePercent,
      rawMarketData?.closeChangePercent,
      rawMarketData?.pcp,

      rawPayload?.closingPriceChangePercent,
      rawPayload?.price?.closingChangePercent,
      rawPayload?.closeChangePercent,
      rawPayload?.pcp,

      raw?.price?.closingChangePercent,
      raw?.closingPriceChangePercent,
      raw?.closeChangePercent,
      raw?.pcp
    );

    const lastPriceChangePercent = pickFirstNumber(
      md?.lastPriceChangePercent,
      (md as any)?.lastChangePercent,
      (md as any)?.priceChangePercent,
      (md as any)?.changePercent,
      (md as any)?.plp,
      (md as any)?.chp,
      mm?.lastPriceChangePercent,
      mm?.priceChangePercent,
      rawMarketData?.lastPriceChangePercent,
      rawMarketData?.priceChangePercent,
      rawMarketData?.lastChangePercent,
      rawMarketData?.plp,
      rawMarketData?.chp,
      rawPayload?.lastPriceChangePercent,
      rawPayload?.priceChangePercent,
      rawPayload?.lastChangePercent,
      rawPayload?.plp,
      rawPayload?.chp,
      raw?.lastPriceChangePercent,
      raw?.priceChangePercent
    );

    const pe = pickFirstNumber(md?.pe, mm?.pe, rawMarketData?.pe, rawPayload?.pe, raw?.pe);

    const eps = pickFirstNumber(md?.eps, mm?.eps, rawMarketData?.eps, rawPayload?.eps, raw?.eps);

    const marketCap = pickFirstNumber(
      md?.marketCap,
      (md as any)?.qTotCap,
      (md as any)?.tval,
      mm?.marketCap,
      rawMarketData?.marketCap,
      rawMarketData?.qTotCap,
      rawPayload?.marketCap,
      raw?.qTotCap
    );

    const tradedVolume = pickFirstNumber(
      md?.tradedVolume,
      (md as any)?.volume,
      (md as any)?.qTotTran,
      rawMarketData?.tradedVolume,
      rawMarketData?.qTotTran,
      rawPayload?.volume,
      raw?.qTotTran
    );

    const tradedValue = pickFirstNumber(
      md?.tradedValue,
      (md as any)?.tradeValue,
      (md as any)?.value,
      (md as any)?.qTotTran5J,
      mm?.tradedValue,
      rawMarketData?.tradedValue,
      rawMarketData?.tradeValue,
      rawMarketData?.value,
      rawPayload?.tradedValue,
      rawPayload?.value,
      raw?.tradedValue
    );

    const high = pickFirstNumber(
      (md as any)?.high,
      (md as any)?.highPrice,
      mm?.highPrice,
      rawMarketData?.high,
      rawMarketData?.highPrice,
      rawPayload?.high,
      raw?.high
    );

    const low = pickFirstNumber(
      (md as any)?.low,
      (md as any)?.lowPrice,
      mm?.lowPrice,
      rawMarketData?.low,
      rawMarketData?.lowPrice,
      rawPayload?.low,
      raw?.low
    );

    const averagePrice = pickFirstNumber(
      (md as any)?.averagePrice,
      mm?.averagePrice,
      rawMarketData?.averagePrice,
      rawPayload?.averagePrice,
      raw?.averagePrice
    );

    if (typeof console !== 'undefined') {
      console.groupCollapsed('[StockAnalysis] market metrics debug');
      console.log('analysisData', analysisData);
      console.log('marketData', md);
      console.log('resolvedMarketMetrics', mm);
      console.log('rawData', raw);
      console.log('rawData.marketData', rawMarketData);
      console.log('rawData.analysisPayload', rawPayload);
      console.log('marketDataResolved.base', {
        closingPrice,
        lastTradedPrice,
        closingPriceChangePercent,
        lastPriceChangePercent,
        pe,
        eps,
        marketCap,
        tradedVolume,
        tradedValue,
        high,
        low,
        averagePrice,
      });
      console.groupEnd();
    }

    const moneyFlowNet = pickFirstNumber(
      (md?.moneyFlow as any)?.net,
      md?.moneyFlow as any
    );

    const candleForDaily = md?.dailyCandle ?? md?.dailyCandles?.[md.dailyCandles.length - 1] ?? null;

    const dailyHigh = pickFirstNumber(
      md?.dailySummary?.high,
      mm?.highPrice,
      candleForDaily?.high,
      high
    );

    const dailyLow = pickFirstNumber(
      md?.dailySummary?.low,
      mm?.lowPrice,
      candleForDaily?.low,
      low
    );

    const averageDirect = pickFirstNumber(md?.dailySummary?.average, mm?.averagePrice, averagePrice);

    const averageFromCandle =
      candleForDaily &&
      [candleForDaily.open, candleForDaily.high, candleForDaily.low, candleForDaily.close].every((x) => toNum(x) !== undefined)
        ? (Number(candleForDaily.open) +
            Number(candleForDaily.high) +
            Number(candleForDaily.low) +
            Number(candleForDaily.close)) / 4
        : null;

    const dailyAverage = averageDirect ?? averageFromCandle;

    const realMoneyNet = pickFirstNumber(md?.realMoneyFlow?.net, mm?.realMoneyFlow);
    const legalMoneyNet = pickFirstNumber(md?.legalMoneyFlow?.net, mm?.legalMoneyFlow);

    return {
      closingPrice,
      lastTradedPrice,
      priceChangePercent: lastPriceChangePercent,
      closingPriceChangePercent,
      lastPriceChangePercent,
      pe,
      eps,
      marketCap,
      tradedVolume,
      tradedValue,
      high,
      low,
      averagePrice,
      moneyFlowNet,
      dailyHigh,
      dailyLow,
      dailyAverage,
      realMoneyNet,
      legalMoneyNet,
      realBreakdown: mm?.realMoneyFlowBreakdown,
      legalBreakdown: mm?.legalMoneyFlowBreakdown,
    };
  }, [analysisData, resolvedMarketMetrics]);

  return (
    <div className="space-y-5">
     <div className="flex flex-wrap gap-2">
  <button
    type="button"
    onClick={() => setActiveTab('analysis')}
    className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-bold transition-colors ${
      activeTab === 'analysis'
        ? 'border-blue-500 bg-blue-50 text-blue-800'
        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
    }`}
  >
    <ChartBarIcon className="h-4 w-4" />
    تحلیل
  </button>

  <button
    type="button"
    onClick={() => setActiveTab('marketSummary')}
    className={`relative flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-bold transition-colors ${
      activeTab === 'marketSummary'
        ? 'border-blue-500 bg-blue-50 text-blue-800'
        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
    } ${hasUnreadMarketSummary ? 'animate-pulse' : ''}`}
  >
    <MarketIcon size={16} />
    خلاصه بازار

    {hasUnreadMarketSummary ? (
      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-500" />
    ) : null}
  </button>

  <button
    type="button"
    onClick={() => setActiveTab('history')}
    className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-bold transition-colors ${
      activeTab === 'history'
        ? 'border-blue-500 bg-blue-50 text-blue-800'
        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
    }`}
  >
    <ClockIcon className="h-4 w-4" />
    تاریخچه

    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
        analysisHistory.length >= 3
          ? 'bg-rose-100 text-rose-700'
          : 'bg-emerald-100 text-emerald-700'
      }`}
    >
      {faNumber(analysisHistory.length)} / {faNumber(3)}
    </span>
  </button>
</div>

      {activeTab === 'marketSummary' && (
  <div
    dir="rtl"
    className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
  >
    {isLoadingMarketSummaryHistory ? (
      <div className="py-6 text-center text-[13px] font-medium text-slate-500">
        در حال دریافت ۵ خلاصه بازار آخر...
      </div>
    ) : marketSummaryHistory.length === 0 ? (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-right text-[13px] font-medium leading-7 text-amber-700">
        هنوز خلاصه بازار ثبت‌شده‌ای وجود ندارد.
      </div>
    ) : (
      <>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-[12px] font-bold text-slate-600">
            ۵ روز معاملاتی آخر
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {marketSummaryHistory.map((item) => {
              const isSelected = item.id === selectedMarketSummaryId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setSelectedMarketSummaryId(item.id); setMarketSummary(item); }}
                  className={`rounded-xl border p-3 text-right transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50'
                  }`}
                >
                  <div className="text-[12px] font-extrabold">
                    {new Date(item.date || item.createdAt).toLocaleDateString('fa-IR')}
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-slate-500">
                    {new Date(item.date || item.createdAt).toLocaleTimeString('fa-IR')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {isLoadingMarketSummary ? (
          <div className="py-4 text-center text-[13px] font-medium text-slate-500">
            در حال دریافت خلاصه انتخاب‌شده...
          </div>
        ) : marketSummary ? (
          <>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="text-[11px] font-bold text-blue-700">تاریخ و زمان ثبت در پایگاه داده</div>
              <div className="mt-1 text-[13px] font-extrabold text-blue-950">
                {new Date(marketSummary.createdAt).toLocaleString('fa-IR')}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="whitespace-pre-wrap text-right text-[14px] font-medium leading-8 text-slate-900">
                {marketSummary.content}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-right text-[13px] font-medium leading-7 text-amber-700">
            خلاصه انتخاب‌شده برای نمایش دریافت نشد.
          </div>
        )}
      </>
    )}
  </div>
)}

      {activeTab === 'analysis' && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              placeholder="نماد سهم"
              className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-[14px] font-semibold text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />

            <button
              onClick={startAnalysis}
              disabled={isAnalyzing}
              className="rounded-lg bg-blue-600 px-5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzing ? 'در حال تحلیل...' : 'شروع تحلیل'}
            </button>

            {analysisData ? (
  <button
    type="button"
    onClick={handleExportPdf}
    className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-[13px] font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
  >
    خروجی PDF
  </button>
) : null}


            {analysisResult ? (
              <button
                onClick={clearCurrentAnalysis}
                className="flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-[13px] font-bold text-rose-700 transition-colors hover:bg-rose-50"
              >
                <TrashIcon className="h-4 w-4" />
                حذف تحلیل
              </button>
            ) : null}
          </div>

          {analysisError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-700">
              {analysisError}
            </div>
          ) : null}

          {showHistoryLimitWarning ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-700">
              تاریخچه پر است (۳ تحلیل)
            </div>
          ) : null}

          <div ref={reportRef}>
            {analysisData && analysisMeta ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="نماد" value={analysisData.symbol ?? selectedSymbol} tone="slate" />

                  <div className={`rounded-xl border p-3 ${recommendationTone.bg} ${recommendationTone.border}`}>
                    <div className="text-[11px] font-semibold leading-5 text-slate-500">پیشنهاد</div>
                    <div className={`mt-1 text-[17px] font-extrabold leading-7 ${recommendationTone.text}`}>
                      {analysisMeta.recommendation}
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="text-[11px] font-semibold leading-5 text-slate-500">ریسک</div>
                    <div className={`mt-1 text-[17px] font-extrabold leading-7 ${riskToneClass}`}>
                      {analysisMeta.riskLevel}
                    </div>
                  </div>

                  <MetricCard
                    label="اطمینان مدل"
                    value={`${faNumber(analysisMeta.confidence)}%`}
                    tone="blue"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <SectionHeader
                      title="امتیاز بنیادی"
                      subtitle="قدرت فاندامنتال و کیفیت متغیرهای بنیادی"
                      tone="emerald"
                    />
                    <div className="text-[30px] font-black leading-none text-emerald-800">
                      {faNumber(analysisMeta.fundamentalScore)}
                      <span className="mr-2 text-[15px] font-bold text-emerald-700">از ۱۰۰</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                    <SectionHeader
                      title="امتیاز تکنیکال"
                      subtitle="کیفیت روند، سطوح و قدرت سیگنال‌های نموداری"
                      tone="indigo"
                    />
                    <div className="text-[30px] font-black leading-none text-indigo-800">
                      {faNumber(analysisMeta.technicalScore)}
                      <span className="mr-2 text-[15px] font-bold text-indigo-700">از ۱۰۰</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <SectionHeader
                    title="جمع‌بندی تحلیل"
                    subtitle="برداشت سریع از وضعیت نماد و تصمیم پیشنهادی"
                    tone="blue"
                  />
                  <div className="whitespace-pre-wrap text-[14px] font-medium leading-8 text-slate-900">
                    {analysisData.summary ?? analysisResult}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <SectionHeader
                    title="مشخصات معاملاتی سهم"
                    subtitle="قیمت پایانی و لحظه‌ای همراه با درصد تغییر، P/E، EPS، ارزش بازار و حجم معاملات"
                  />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[11px] font-semibold leading-5 text-slate-500">قیمت پایانی</div>
                      <div className="mt-1 text-[17px] font-extrabold leading-7 text-slate-900">
                        {formatNumber(marketDataResolved.closingPrice)}
                      </div>
                      <div className={`mt-1 text-[12px] font-bold ${getPercentToneClass(marketDataResolved.closingPriceChangePercent)}`}>
                        {formatPercent(marketDataResolved.closingPriceChangePercent)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                      <div className="text-[11px] font-semibold leading-5 text-slate-500">قیمت لحظه‌ای</div>
                      <div className="mt-1 text-[17px] font-extrabold leading-7 text-blue-900">
                        {formatNumber(marketDataResolved.lastTradedPrice)}
                      </div>
                      <div className={`mt-1 text-[12px] font-bold ${getPercentToneClass(marketDataResolved.lastPriceChangePercent)}`}>
                        {formatPercent(marketDataResolved.lastPriceChangePercent)}
                      </div>
                    </div>
                    <MetricCard label="P/E" value={formatDecimal(marketDataResolved.pe, 2)} tone="indigo" />
                    <MetricCard label="EPS" value={formatNumber(marketDataResolved.eps)} tone="emerald" />
                    <MetricCard label="ارزش بازار" value={formatNumber(marketDataResolved.marketCap)} tone="violet" />
                    <MetricCard label="حجم معامله" value={formatNumber(marketDataResolved.tradedVolume)} tone="rose" />
                    <MetricCard label="ارزش معاملات" value={formatNumber(marketDataResolved.tradedValue)} tone="blue" />
                    <MetricCard label="جریان نقدینگی خالص" value={formatNumber(marketDataResolved.moneyFlowNet)} tone="emerald" />
                    <MetricCard label="جریان نقدینگی حقیقی (خالص)" value={formatNumber(marketDataResolved.realMoneyNet)} tone="emerald" />
                    <MetricCard label="جریان نقدینگی حقوقی (خالص)" value={formatNumber(marketDataResolved.legalMoneyNet)} tone="indigo" />
                  </div>
                </div>

                {(marketDataResolved.realBreakdown || marketDataResolved.legalBreakdown) && (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                      <SectionHeader title="جزئیات جریان نقدینگی حقیقی" tone="emerald" />
                      <div className="divide-y divide-emerald-100">
                        <DetailRow label="ورود" value={formatNumber(marketDataResolved.realBreakdown?.inflow)} />
                        <DetailRow label="خروج" value={formatNumber(marketDataResolved.realBreakdown?.outflow)} />
                        <DetailRow label="خالص" value={formatNumber(marketDataResolved.realBreakdown?.net)} />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
                      <SectionHeader title="جزئیات جریان نقدینگی حقوقی" tone="indigo" />
                      <div className="divide-y divide-indigo-100">
                        <DetailRow label="ورود" value={formatNumber(marketDataResolved.legalBreakdown?.inflow)} />
                        <DetailRow label="خروج" value={formatNumber(marketDataResolved.legalBreakdown?.outflow)} />
                        <DetailRow label="خالص" value={formatNumber(marketDataResolved.legalBreakdown?.net)} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <SectionHeader title="کندل روزانه تعدیل شده" subtitle="روز جاری یا آخرین روز معاملاتی" />

{!hasAdjustedDailyDisplayData && !hasAnyAdjustedDailyRawSource && (
  <div className="flex h-[200px] items-center justify-center">
    <div className="text-[13px] font-medium text-slate-500">
      داده‌ای برای کندل روزانه تعدیل‌شده موجود نیست.
    </div>
  </div>
)}

{!hasAdjustedDailyDisplayData && hasAnyAdjustedDailyRawSource && (
  <div className="flex h-[200px] items-center justify-center">
    <div className="text-[13px] font-medium text-amber-600">
      داده تعدیل‌شده از API دریافت شده اما در مرحله نرمال‌سازی قابل استفاده نشده است. جزئیات را در Console بررسی کنید.
    </div>
  </div>
)}

  {!showAdjustedDailyCandle && !hasAnyAdjustedDailyRawSource && dailyCandles.length === 0 && (
  <div className="flex h-[200px] items-center justify-center">
    <div className="text-[13px] font-medium text-slate-500">
      داده‌ای برای کندل روزانه موجود نیست.
    </div>
  </div>
)}
                    {chartData.length > 0 && (
                      <>
                        {(() => {
                          if (typeof console !== 'undefined') {
                            console.log('[StockAnalysis] chart render debug', {
                              showAdjustedDailyCandle,
                              chartDataLength: chartData.length,
                              chartDataFirst: chartData[0],
                              dailyCandlesLength: dailyCandles.length,
                              adjustedDailyCandlesLength: adjustedDailyCandles.length,
                            });
                          }
                          return null;
                        })()}

                        <div className="p-2">
                          <CandleChart data={chartData} theme={theme} />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <SectionHeader
                      title="خلاصه روزانه سهم"
                      subtitle="بیشینه، کمینه، میانگین قیمت و ارزش معاملات"
                    />
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <MetricCard label="قیمت بیشینه" value={formatNumber(marketDataResolved.dailyHigh)} tone="emerald" />
                      <MetricCard label="قیمت کمینه" value={formatNumber(marketDataResolved.dailyLow)} tone="rose" />
                      <MetricCard label="میانگین قیمت" value={formatNumber(marketDataResolved.dailyAverage)} tone="blue" />
                      <MetricCard label="ارزش معاملات" value={formatNumber(marketDataResolved.tradedValue)} tone="indigo" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <SectionHeader
                      title="روند و احساس بازار"
                      subtitle="جهت حرکت سهم در دو بازه و برداشت کلی از فضای معامله"
                    />
                    <div className="divide-y divide-slate-100">
                      <DetailRow label="روند کوتاه‌مدت" value={analysisMeta.shortTermTrend} />
                      <DetailRow label="روند میان‌مدت" value={analysisMeta.mediumTermTrend} />
                      <DetailRow label="احساس بازار" value={analysisMeta.sentiment} />
                      <DetailRow label="بازه تحلیل" value={analysisData.signals?.timeframe ?? '—'} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <SectionHeader
                      title="سطوح کلیدی"
                      subtitle="اهداف قیمتی و حد ضرر برای تصمیم‌گیری سریع‌تر"
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {Object.entries(targets).map(([key, value]) => (
                        <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="text-[11px] font-semibold leading-5 text-slate-500">{key}</div>
                          <div className="mt-1 text-[16px] font-extrabold leading-7 text-slate-900">
                            {formatNumber(value)}
                          </div>
                        </div>
                      ))}

                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3">
                        <div className="text-[11px] font-semibold leading-5 text-slate-500">حد ضرر</div>
                        <div className="mt-1 text-[16px] font-extrabold leading-7 text-rose-700">
                          {formatNumber(stopLoss)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <SectionHeader
                      title="نقاط ورود"
                      subtitle="محدوده‌های ورود پیشنهادی همراه با منطق هر سطح"
                      tone="emerald"
                    />
                    {entryPoints.length === 0 ? (
                      <div className="text-[13px] font-medium text-slate-500">نقطه ورود مشخص نشده است.</div>
                    ) : (
                      <div className="space-y-3">
                        {entryPoints.map((p, i) => (
                          <div key={`entry-${i}`} className="rounded-xl border border-emerald-200 bg-white p-3">
                            <div className="text-[14px] font-extrabold leading-6 text-emerald-700">
                              قیمت: {formatNumber(p?.price)}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-[13px] font-medium leading-7 text-slate-700">
                              {p?.reason || '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
                    <SectionHeader
                      title="نقاط خروج"
                      subtitle="سطوح خروج و دلایل مدیریت سود یا کاهش ریسک"
                      tone="rose"
                    />
                    {exitPoints.length === 0 ? (
                      <div className="text-[13px] font-medium text-slate-500">نقطه خروج مشخص نشده است.</div>
                    ) : (
                      <div className="space-y-3">
                        {exitPoints.map((p, i) => (
                          <div key={`exit-${i}`} className="rounded-xl border border-rose-200 bg-white p-3">
                            <div className="text-[14px] font-extrabold leading-6 text-rose-700">
                              قیمت: {formatNumber(p?.price)}
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-[13px] font-medium leading-7 text-slate-700">
                              {p?.reason || '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <SectionHeader
                      title="توضیحات بنیادی"
                      subtitle="تحلیل مرتبط با کیفیت متغیرهای مالی، ارزش‌گذاری و وضعیت سهم"
                    />
                    <div className="whitespace-pre-wrap text-[14px] font-medium leading-8 text-slate-800">
                      {analysisData.explanations?.fundamental || '—'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <SectionHeader
                      title="توضیحات تکنیکال"
                      subtitle="برداشت تحلیلی از ساختار نمودار، روند، حمایت و مقاومت"
                    />
                    <div className="whitespace-pre-wrap text-[14px] font-medium leading-8 text-slate-800">
                      {analysisData.explanations?.technical || '—'}
                    </div>
                  </div>
                </div>

                {analysisData.explanations?.additional ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <SectionHeader
                      title="نکات تکمیلی"
                      subtitle="موارد مکملی که در تصمیم نهایی باید دیده شوند"
                    />
                    <div className="whitespace-pre-wrap text-[14px] font-medium leading-8 text-slate-800">
                      {analysisData.explanations.additional}
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <SectionHeader title="اطلاعات تحلیل" subtitle="زمان تولید تحلیل و مدل مورد استفاده" />
                    <div className="divide-y divide-slate-100">
                      <DetailRow
                        label="تاریخ تحلیل"
                        value={
                          analysisData.analysisDate
                            ? new Date(analysisData.analysisDate).toLocaleString('fa-IR')
                            : '—'
                        }
                      />
                      <DetailRow label="مدل" value={analysisData.model ? analysisData.model : '—'} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <SectionHeader title="مصرف" subtitle="جمع‌بندی توکن‌های مصرفی برای این درخواست" />
                    <div className="divide-y divide-slate-100">
                      <DetailRow label="توکن ورودی" value={faNumber(analysisData.usage?.prompt_tokens)} />
                      <DetailRow label="توکن خروجی" value={faNumber(analysisData.usage?.completion_tokens)} />
                      <DetailRow label="جمع توکن" value={faNumber(analysisData.usage?.total_tokens)} />
                    </div>
                  </div>
                </div>
              </div>
            ) : analysisResult ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <SectionHeader title="نتیجه تحلیل" subtitle="خروجی خام یا پاسخ متنی دریافت‌شده از سرویس" />
                <div className="whitespace-pre-wrap text-[14px] font-medium leading-8 text-slate-800">
                  {analysisResult}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {activeTab === 'history' && (
        <div
          dir="rtl"
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          {analysisHistory.length === 0 ? (
            <div className="text-[13px] font-medium text-slate-500">
              تحلیلی ذخیره نشده است
            </div>
          ) : (
            analysisHistory.map((item) => {
              const date = new Date(item.createdAt);

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => fetchAnalysisDetail(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fetchAnalysisDetail(item.id);
                    }
                  }}
                  className="flex cursor-pointer justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-blue-300 hover:bg-blue-50/40"
                >
                  <div className="min-w-0">
                    <div className="text-[15px] font-extrabold text-blue-700">
                      {item.symbol}
                    </div>

                    <div className="mt-1 text-[11px] font-medium text-slate-500">
                      {date.toLocaleDateString('fa-IR')} -{' '}
                      {date.toLocaleTimeString('fa-IR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>

                    <div className="mt-2 line-clamp-2 text-[13px] font-medium leading-7 text-slate-800">
                      {item.result?.summary ??
                        item.summary ??
                        'تحلیل ذخیره شده'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeHistoryItem(item.id);
                    }}
                    className="shrink-0 rounded p-1 text-rose-600 transition-colors hover:bg-rose-50"
                    aria-label="حذف"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}








