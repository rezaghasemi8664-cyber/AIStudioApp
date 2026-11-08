import { getPortfolioAnalytics } from './portfolioAnalyticsService';
import { normalizePortfolioDate } from '../utils/portfolioDate';

export interface PortfolioRiskPoint {
  date: string;
  dailyReturnPercent: number;
}

export interface HoldingRisk {
  symbol: string;
  name?: string;
  volatilityPercent: number | null;
  downsideDeviationPercent: number | null;
  maxDrawdownPercent: number | null;
  observations: number;
}

export interface PortfolioRiskResult {
  points: PortfolioRiskPoint[];
  volatilityPercent: number | null;
  downsideDeviationPercent: number | null;
  maxDrawdownPercent: number | null;
  returnToRisk: number | null;
  positiveDays: number;
  negativeDays: number;
  holdingRisks: HoldingRisk[];
}

interface QuotePoint { date: string; close: number; }
const num = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const normalizeDate = normalizePortfolioDate;

const stddev = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const mean = values.reduce((s, x) => s + x, 0) / values.length;
  return Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1));
};

function riskFromReturns(returns: number[]) {
  const volatility = stddev(returns);
  const downside = returns.filter(x => x < 0);
  const downsideDeviation = downside.length
    ? Math.sqrt(downside.reduce((s, x) => s + x * x, 0) / downside.length)
    : 0;
  return { volatilityPercent: volatility, downsideDeviationPercent: downsideDeviation };
}

function maxDrawdown(closes: number[]): number | null {
  if (!closes.length) return null;
  let peak = closes[0];
  let max = 0;
  closes.forEach(close => {
    peak = Math.max(peak, close);
    if (peak > 0) max = Math.min(max, ((close - peak) / peak) * 100);
  });
  return max;
}

function getQuotes(historyBySymbol: Record<string, Array<{ date: string; close: number }>>, symbol: string): QuotePoint[] {
  return (historyBySymbol[String(symbol || '').trim().toUpperCase()] || [])
    .map(row => ({ date: normalizeDate(row.date), close: num(row.close) }))
    .filter((row): row is QuotePoint => Boolean(row.date) && row.close != null && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getPortfolioRisk(): Promise<PortfolioRiskResult> {
  const analytics = await getPortfolioAnalytics();
  const portfolio = Array.isArray(analytics.portfolio?.items) ? analytics.portfolio.items : [];
  const historyBySymbol = analytics.historyBySymbol || {};
  if (!portfolio.length) {
    return { points: [], volatilityPercent: null, downsideDeviationPercent: null, maxDrawdownPercent: null, returnToRisk: null, positiveDays: 0, negativeDays: 0, holdingRisks: [] };
  }

  const dailyValues = new Map<string, number>();
  portfolio.forEach(item => {
    const entryDate = normalizeDate(item.entryDate);
    getQuotes(historyBySymbol, item.symbol).forEach(q => {
      if (!entryDate || q.date >= entryDate) {
        dailyValues.set(q.date, (dailyValues.get(q.date) ?? 0) + q.close * Number(item.quantity || 0));
      }
    });
  });

  const sorted = Array.from(dailyValues.entries()).sort(([a], [b]) => a.localeCompare(b));
  const points: PortfolioRiskPoint[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1][1];
    const current = sorted[i][1];
    if (previous > 0 && current > 0) points.push({ date: sorted[i][0], dailyReturnPercent: ((current / previous) - 1) * 100 });
  }
  const returns = points.map(x => x.dailyReturnPercent);
  const risk = riskFromReturns(returns);
  const positiveDays = returns.filter(x => x > 0).length;
  const negativeDays = returns.filter(x => x < 0).length;
  const totalReturn = sorted.length > 1 && sorted[0][1] > 0
    ? ((sorted[sorted.length - 1][1] / sorted[0][1]) - 1) * 100
    : null;
  const returnToRisk = totalReturn != null && risk.volatilityPercent != null && risk.volatilityPercent > 0
    ? totalReturn / risk.volatilityPercent
    : null;

  const grouped = new Map<string, { symbol: string; name?: string; firstEntryDate: string }>();
  portfolio.forEach(item => {
    const symbol = String(item.symbol || '').trim().toUpperCase();
    if (!symbol) return;
    const entryDate = normalizeDate(item.entryDate);
    const existing = grouped.get(symbol);
    if (!existing) grouped.set(symbol, { symbol, name: item.name, firstEntryDate: entryDate });
    else if (entryDate && (!existing.firstEntryDate || entryDate < existing.firstEntryDate)) existing.firstEntryDate = entryDate;
  });

  const holdingRisks: HoldingRisk[] = Array.from(grouped.values()).map(item => {
    const quotes = getQuotes(historyBySymbol, item.symbol);
    const active = quotes.filter(q => !item.firstEntryDate || q.date >= item.firstEntryDate);
    const holdingReturns = active.slice(1)
      .map((q, i) => active[i].close > 0 ? ((q.close / active[i].close) - 1) * 100 : null)
      .filter((x): x is number => x != null);
    const r = riskFromReturns(holdingReturns);
    return {
      symbol: item.symbol,
      name: item.name,
      volatilityPercent: r.volatilityPercent,
      downsideDeviationPercent: r.downsideDeviationPercent,
      maxDrawdownPercent: maxDrawdown(active.map(q => q.close)),
      observations: holdingReturns.length,
    };
  });

  return {
    points,
    volatilityPercent: risk.volatilityPercent,
    downsideDeviationPercent: risk.downsideDeviationPercent,
    maxDrawdownPercent: maxDrawdown(sorted.map(([, value]) => value)),
    returnToRisk,
    positiveDays,
    negativeDays,
    holdingRisks,
  };
}
