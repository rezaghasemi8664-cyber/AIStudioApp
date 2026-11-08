import { getPortfolioAnalytics } from './portfolioAnalyticsService';
import { normalizePortfolioDate } from '../utils/portfolioDate';

export interface CorrelationPair { left: string; right: string; correlation: number; observations: number; }
export interface PortfolioCorrelationResult { symbols: string[]; pairs: CorrelationPair[]; averageAbsoluteCorrelation: number | null; highCorrelationPairs: CorrelationPair[]; }

const num = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const date = normalizePortfolioDate;

function correlation(a: number[], b: number[]) {
  if (a.length < 3 || a.length !== b.length) return null;
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let xy = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    xy += da * db;
    aa += da * da;
    bb += db * db;
  }
  if (aa <= 0 || bb <= 0) return null;
  return xy / Math.sqrt(aa * bb);
}

export async function getPortfolioCorrelation(): Promise<PortfolioCorrelationResult> {
  const analytics = await getPortfolioAnalytics();
  const portfolio = Array.isArray(analytics.portfolio?.items) ? analytics.portfolio.items : [];
  const grouped = new Map<string, { symbol: string; firstEntryDate: string | null }>();
  portfolio.forEach(item => {
    const symbol = String(item.symbol || '').trim().toUpperCase();
    if (!symbol) return;
    const entryDate = date(item.entryDate);
    const existing = grouped.get(symbol);
    if (!existing) grouped.set(symbol, { symbol, firstEntryDate: entryDate });
    else if (entryDate && (!existing.firstEntryDate || entryDate < existing.firstEntryDate)) existing.firstEntryDate = entryDate;
  });
  const holdings = Array.from(grouped.values());
  if (holdings.length < 2) {
    return { symbols: holdings.map(item => item.symbol), pairs: [], averageAbsoluteCorrelation: null, highCorrelationPairs: [] };
  }

  const historyBySymbol = analytics.historyBySymbol || {};
  const returns = new Map<string, Map<string, number>>();
  holdings.forEach(item => {
    const quotes = (historyBySymbol[item.symbol] || [])
      .map(row => ({ date: date(row.date), close: num(row.close) }))
      .filter((row): row is { date: string; close: number } => Boolean(row.date) && row.close != null && row.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const active = quotes.filter(q => !item.firstEntryDate || q.date >= item.firstEntryDate);
    const map = new Map<string, number>();
    for (let i = 1; i < active.length; i += 1) {
      const previous = active[i - 1].close;
      if (previous > 0) map.set(active[i].date, (active[i].close / previous) - 1);
    }
    returns.set(item.symbol, map);
  });

  const pairs: CorrelationPair[] = [];
  for (let i = 0; i < holdings.length; i += 1) {
    for (let j = i + 1; j < holdings.length; j += 1) {
      const left = holdings[i].symbol;
      const right = holdings[j].symbol;
      const a = returns.get(left) ?? new Map<string, number>();
      const b = returns.get(right) ?? new Map<string, number>();
      const xs: number[] = [];
      const ys: number[] = [];
      a.forEach((value, key) => {
        const other = b.get(key);
        if (other != null) { xs.push(value); ys.push(other); }
      });
      const value = correlation(xs, ys);
      if (value != null) pairs.push({ left, right, correlation: value, observations: xs.length });
    }
  }
  pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  const averageAbsoluteCorrelation = pairs.length
    ? pairs.reduce((sum, pair) => sum + Math.abs(pair.correlation), 0) / pairs.length
    : null;
  return {
    symbols: holdings.map(item => item.symbol),
    pairs,
    averageAbsoluteCorrelation,
    highCorrelationPairs: pairs.filter(pair => Math.abs(pair.correlation) >= 0.7),
  };
}
