import { useEffect, useMemo, useRef, useState } from 'react';
import { ChartBarIcon, ClockIcon, MarketIcon, TrashIcon } from './Icons';
import api from '../api/apiClient';
import { getLatestSummary } from '../services/marketSummaryService';
import { exportElementToPdf } from '../utils/exportToPdf';
import toast from 'react-hot-toast';
import * as analysisHistoryService from '../services/analysisHistoryService';
import { getAnalysisHistory, getAnalysisHistoryItem, deleteAnalysisFromHistory } from '../services/analysisHistoryService';
import type { AnalysisPoint, AnalysisResult, AnalysisUsage, DailySummary, MoneyFlowBreakdown, OHLCPoint, UnifiedMoneyFlow, AnalysisMarketMetrics } from '../types/analysis';

type AnalysisHistoryItem = { id: string; symbol: string; result: AnalysisResult | null; createdAt: string };
type MarketSummary = { content: string; createdAt: string };
type ActiveTab = 'analysis' | 'marketSummary' | 'history';
type UnifiedMarketData = {
  closingPrice: number | null;
  lastTradedPrice: number | null;
  closingPriceChangePercent: number | null;
  lastPriceChangePercent: number | null;
  pe: number | null; eps: number | null; marketCap: number | null; tradedVolume: number | null; tradedValue: number | null;
  moneyFlow: UnifiedMoneyFlow | null; realMoneyFlow?: UnifiedMoneyFlow | null; legalMoneyFlow?: UnifiedMoneyFlow | null;
  dailyCandles: OHLCPoint[]; adjustedDailyCandles: OHLCPoint[]; hasAnyAdjustedDailyRawSource?: boolean;
  dailySummary: DailySummary | null; dailyCandle: OHLCPoint | null; adjustedDailyCandle: OHLCPoint | null; marketMetrics?: AnalysisMarketMetrics;
};
type UnifiedAnalysisResult = AnalysisResult & { marketData: UnifiedMarketData; usage?: AnalysisUsage | null; model?: string; meta?: Record<string, unknown>; analysisDate?: string; summary?: string; targets?: Record<string, number>; stopLoss?: number | null; risk_level?: string; ontology_version?: string; rawData?: unknown; marketMetrics?: AnalysisMarketMetrics };
type NormalizedAnalysis = { rawText: string; data: UnifiedAnalysisResult | null };
type AnalysisDetailState = { id?: string; symbol?: string; fullText?: string; parsedResult?: unknown; createdAt?: string };

const recommendationMap: Record<string, string> = { buy: 'خرید', sell: 'فروش', hold: 'نگهداری', strong_buy: 'خرید قوی', strong_sell: 'فروش قوی', خرید: 'خرید', فروش: 'فروش', نگهداری: 'نگهداری', 'خرید قوی': 'خرید قوی', 'فروش قوی': 'فروش قوی' };
const riskMap: Record<string, string> = { low: 'کم', medium: 'متوسط', high: 'زیاد', پایین: 'کم', متوسط: 'متوسط', زیاد: 'زیاد', کم: 'کم', LOW: 'کم', MEDIUM: 'متوسط', HIGH: 'زیاد' };
const trendMap: Record<string, string> = { bullish: 'صعودی', bearish: 'نزولی', neutral: 'خنثی', up: 'صعودی', down: 'نزولی', sideways: 'خنثی', صعودی: 'صعودی', نزولی: 'نزولی', خنثی: 'خنثی' };
const sentimentMap: Record<string, string> = { positive: 'مثبت', negative: 'منفی', neutral: 'خنثی', مثبت: 'مثبت', منفی: 'منفی', خنثی: 'خنثی' };
function faNumber(value: string | number | undefined | null) { if (value === undefined || value === null || value === '') return '—'; return String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]); }
function formatNumber(value: number | string | undefined | null) { if (value === undefined || value === null || value === '') return '—'; const n = Number(value); if (!Number.isFinite(n)) return faNumber(String(value)); return faNumber(n.toLocaleString('en-US')); }
function formatPercent(value: number | string | undefined | null) { if (value === undefined || value === null || value === '') return '—'; const n = Number(value); if (!Number.isFinite(n)) return faNumber(String(value)); return `${faNumber(n.toLocaleString('en-US', { maximumFractionDigits: 2 }))}%`; }
function toNum(v: unknown): number | undefined { if (v === undefined || v === null || v === '') return undefined; const n = Number(v); return Number.isFinite(n) ? n : undefined; }
function toNullableNum(v: unknown): number | null { const n = toNum(v); return n === undefined ? null : n; }
function pickFirstNumber(...values: unknown[]): number | null { for (const v of values) { const n = toNum(v); if (n !== undefined) return n; } return null; }
function getNestedValue(obj: Record<string, unknown>, path: string): unknown { return path.split('.').reduce<unknown>((acc, key) => acc && typeof acc === 'object' && key in (acc as Record<string, unknown>) ? (acc as Record<string, unknown>)[key] : undefined, obj); }
function getPropByAliases<T>(obj: any, aliases: string[], defaultValue: T | null = null): T | null { for (const alias of aliases) { const v = alias.includes('.') ? getNestedValue(obj, alias) : obj?.[alias]; if (v !== undefined && v !== null && v !== '') return v as T; } return defaultValue; }

function normalizeMarketMetrics(input: unknown): AnalysisMarketMetrics | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const mm = input as Record<string, unknown>;
  return {
    pe: pickFirstNumber(mm.pe, mm.peRatio, mm.priceToEarnings), eps: pickFirstNumber(mm.eps, mm.earningsPerShare),
    marketCap: pickFirstNumber(mm.marketCap, mm.market_capitalization, mm.capitalization, mm.marketCapitalization, mm.qTotCap, mm.tval),
    priceChangePercent: pickFirstNumber(mm.priceChangePercent, mm.pctChange, mm.changePercent),
    tradedValue: pickFirstNumber(mm.tradedValue, mm.tradeValue, mm.value, mm.qTotCap, mm.tval),
    realMoneyFlow: pickFirstNumber(mm.realMoneyFlow), legalMoneyFlow: pickFirstNumber(mm.legalMoneyFlow),
    highPrice: pickFirstNumber(mm.highPrice, mm.high, mm.pMax), lowPrice: pickFirstNumber(mm.lowPrice, mm.low, mm.pMin),
    averagePrice: pickFirstNumber(mm.averagePrice, mm.avgPrice, mm.average, mm.pAvg),
    lastPrice: pickFirstNumber(mm.lastPrice, mm.lastTradedPrice, mm.closePrice, mm.finalPrice, mm.closingPrice, mm.pDrCotVal, mm.pClosing),
    closingPrice: pickFirstNumber(mm.closingPrice, mm.lastClosePrice, mm.closePrice, mm.finalPrice, mm.pClosing),
    closingPriceChangePercent: pickFirstNumber(mm.closingPriceChangePercent, mm.closeChangePercent, mm.pcp),
    lastPriceChangePercent: pickFirstNumber(mm.lastPriceChangePercent, mm.lastChangePercent, mm.plp, mm.priceChangePercent),
  };
}

function normalizeAnalysisShape(input: unknown): UnifiedAnalysisResult | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, any>; const marketData = source.marketData ?? {}; const rawHistory = source.marketHistory ?? marketData.marketHistory ?? [];
  const lastHistoryRecord = Array.isArray(rawHistory) && rawHistory.length ? rawHistory[rawHistory.length - 1] ?? {} : (rawHistory && typeof rawHistory === 'object' ? rawHistory : {});
  const sourceMetrics = normalizeMarketMetrics(source.marketMetrics ?? source); const mdMetrics = normalizeMarketMetrics(marketData.marketMetrics ?? marketData); const mhMetrics = normalizeMarketMetrics(lastHistoryRecord.marketMetrics ?? lastHistoryRecord.metrics ?? lastHistoryRecord);
  const mergedMetrics: AnalysisMarketMetrics | undefined = sourceMetrics || mdMetrics || mhMetrics ? { ...(sourceMetrics ?? {}), ...(mdMetrics ?? {}), ...(mhMetrics ?? {}) } : undefined;

  // IMPORTANT: closing and live percentages are deliberately independent.
  // Never use priceChangePercent as a fallback for closingPriceChangePercent.
  const closingPrice = pickFirstNumber(marketData.closingPrice, marketData.lastClosePrice, marketData.closePrice, marketData.finalPrice, marketData.pClosing, lastHistoryRecord.closingPrice, lastHistoryRecord.lastClosePrice, lastHistoryRecord.closePrice, lastHistoryRecord.finalPrice, lastHistoryRecord.pClosing, source.closingPrice, source.lastClosePrice, source.closePrice, source.finalPrice, source.pClosing, mergedMetrics?.closingPrice);
  const lastTradedPrice = pickFirstNumber(marketData.lastTradedPrice, marketData.lastPrice, marketData.pDrCotVal, lastHistoryRecord.lastTradedPrice, lastHistoryRecord.lastPrice, lastHistoryRecord.pDrCotVal, mergedMetrics?.lastPrice, source.lastTradedPrice, source.lastPrice, source.pDrCotVal);
  const closingPriceChangePercent = pickFirstNumber(marketData.closingPriceChangePercent, marketData.closeChangePercent, marketData.pcp, lastHistoryRecord.closingPriceChangePercent, lastHistoryRecord.closeChangePercent, lastHistoryRecord.pcp, source.closingPriceChangePercent, source.closeChangePercent, source.pcp, mergedMetrics?.closingPriceChangePercent, (mergedMetrics as any)?.closeChangePercent);
  const lastPriceChangePercent = pickFirstNumber(marketData.lastPriceChangePercent, marketData.lastChangePercent, marketData.plp, lastHistoryRecord.lastPriceChangePercent, lastHistoryRecord.lastChangePercent, lastHistoryRecord.plp, source.lastPriceChangePercent, source.lastChangePercent, source.plp, mergedMetrics?.lastPriceChangePercent, (mergedMetrics as any)?.priceChangePercent);

  const normalized: UnifiedAnalysisResult = {
    symbol: source.symbol ?? 'نامشخص', summary: source.summary ?? '', recommendation: source.recommendation ?? 'hold', riskLevel: source.riskLevel ?? source.risk_level ?? 'medium', shortTermTrend: source.shortTermTrend ?? source.short_term_trend ?? 'neutral', mediumTermTrend: source.mediumTermTrend ?? source.medium_term_trend ?? 'neutral', sentiment: source.sentiment ?? 'neutral', confidence: Number(source.confidence) || 0, analysisDate: source.analysisDate ?? source.analysis_date ?? source.createdAt ?? new Date().toISOString(), meta: source.meta ?? {}, model: source.model, usage: source.usage ?? null, rawData: source.rawData, ontology_version: source.ontology_version, risk_level: source.risk_level, marketMetrics: mergedMetrics,
    marketData: { closingPrice, lastTradedPrice, closingPriceChangePercent, lastPriceChangePercent, pe: pickFirstNumber(marketData.pe, lastHistoryRecord.pe, mergedMetrics?.pe, source.pe), eps: pickFirstNumber(marketData.eps, lastHistoryRecord.eps, mergedMetrics?.eps, source.eps), marketCap: pickFirstNumber(marketData.marketCap, marketData.marketValue, marketData.qTotCap, marketData.tval, mergedMetrics?.marketCap, source.marketCap, source.marketValue, source.qTotCap, source.tval), tradedVolume: pickFirstNumber(marketData.tradedVolume, marketData.volume, marketData.vol, marketData.qTotTran5J, source.tradedVolume, source.volume, source.vol, source.qTotTran5J), tradedValue: pickFirstNumber(marketData.tradedValue, marketData.tradeValue, marketData.value, marketData.qTotCap, marketData.tval, mergedMetrics?.tradedValue, source.tradedValue, source.value, source.qTotCap, source.tval), moneyFlow: null, realMoneyFlow: null, legalMoneyFlow: null, dailyCandles: [], adjustedDailyCandles: [], dailySummary: null, dailyCandle: null, adjustedDailyCandle: null, marketMetrics: mergedMetrics }
  };
  return normalized;
}
