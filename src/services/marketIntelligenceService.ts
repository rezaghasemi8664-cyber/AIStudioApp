import { appApiFetch } from './apiConfigService';

export type JsonObject = Record<string, unknown>;

export interface MarketBreadthData {
  positive: number | null;
  negative: number | null;
  neutral: number | null;
  unknown: number | null;
  total: number | null;
  classifiedTotal: number | null;
  positivePercent: number | null;
  negativePercent: number | null;
  neutralPercent: number | null;
  coveragePercent: number | null;
  advanceDeclineRatio: number | null;
  score: number | null;
  interpretation?: string | null;
}

export interface MarketIntelligenceData {
  regime?: JsonObject | null;
  score?: number | null;
  trend?: JsonObject | null;
  indexes?: JsonObject | null;
  breadth?: MarketBreadthData | null;
  liquidity?: JsonObject | null;
  moneyFlow?: JsonObject | null;
  momentum?: JsonObject | null;
  volatility?: JsonObject | null;
  sectors?: JsonObject | null;
  leaders?: unknown[] | null;
  divergences?: unknown[] | null;
  scenarios?: unknown[] | null;
  action?: JsonObject | null;
  tradingBias?: JsonObject | null;
  confirmation?: JsonObject | null;
  dataQuality?: JsonObject | null;
  [key: string]: unknown;
}

const asObject = (value: unknown): JsonObject | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;

const asArray = (value: unknown): unknown[] | null =>
  Array.isArray(value) ? value : null;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const n = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

const unwrap = (value: unknown): unknown => {
  const obj = asObject(value);
  if (!obj) return value;
  return obj.data ?? value;
};

const findIntelligence = (payload: unknown): MarketIntelligenceData | null => {
  const root = asObject(payload);
  if (!root) return null;

  const candidates: unknown[] = [
    root.marketIntelligence,
    root.intelligence,
    asObject(root.data)?.marketIntelligence,
    asObject(root.data)?.intelligence,
    asObject(asObject(root.data)?.marketSummary)?.marketIntelligence,
    asObject(asObject(root.data)?.marketSummary)?.intelligence,
    asObject(root.marketSummary)?.marketIntelligence,
    asObject(root.marketSummary)?.intelligence,
    asObject(root.rawJson)?.marketIntelligence,
    asObject(root.rawJson)?.intelligence,
    asObject(asObject(root.rawJson)?.data)?.marketIntelligence,
    asObject(asObject(root.rawJson)?.data)?.intelligence
  ];

  for (const candidate of candidates) {
    const obj = asObject(candidate);
    if (obj) return obj as MarketIntelligenceData;
  }

  return null;
};

const normalizeBreadth = (value: unknown): MarketBreadthData | null => {
  const obj = asObject(value);
  if (!obj) return null;

  return {
    positive: toNumber(obj.positive ?? obj.positiveStocks),
    negative: toNumber(obj.negative ?? obj.negativeStocks),
    neutral: toNumber(obj.neutral ?? obj.neutralStocks),
    unknown: toNumber(obj.unknown),
    total: toNumber(obj.total),
    classifiedTotal: toNumber(obj.classifiedTotal),
    positivePercent: toNumber(obj.positivePercent),
    negativePercent: toNumber(obj.negativePercent),
    neutralPercent: toNumber(obj.neutralPercent),
    coveragePercent: toNumber(obj.coveragePercent),
    advanceDeclineRatio: toNumber(obj.advanceDeclineRatio),
    score: toNumber(obj.score),
    interpretation: typeof obj.interpretation === 'string' ? obj.interpretation : null
  };
};

export const getLatestMarketIntelligence = async (): Promise<MarketIntelligenceData | null> => {
  try {
    const payload = await appApiFetch<unknown>(`/market-summary/latest?t=${Date.now()}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      }
    });

    const intelligence = findIntelligence(unwrap(payload));
    if (!intelligence) return null;

    return {
      ...intelligence,
      score: toNumber(intelligence.score),
      breadth: normalizeBreadth(intelligence.breadth)
    };
  } catch (error) {
    console.warn('[MarketIntelligenceService] Failed to load intelligence', error);
    return null;
  }
};

export const normalizeMarketIntelligence = (value: unknown): MarketIntelligenceData | null => {
  const obj = asObject(value);
  if (!obj) return null;
  return {
    ...obj,
    score: toNumber(obj.score),
    breadth: normalizeBreadth(obj.breadth)
  };
};

export const extractMarketIntelligence = findIntelligence;
