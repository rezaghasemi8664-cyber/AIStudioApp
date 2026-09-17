import api from '../api/apiClient';
import * as portfolioService from './portfolioService';

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

const num = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeDate = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : raw.slice(0, 10);
};

const stddev = (values: number[]): number | null => {
  if (values.length < 2) return null;
  const mean = values.reduce((s, x) => s + x, 0) / values.length;
  return Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1));
};

async function getQuotes(symbol: string) {
  const response = await api.get(`/brs/symbol/${encodeURIComponent(symbol)}/history`, { params: { limit: 365 } });
  const raw = response?.data?.data ?? response?.data ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map(row => ({
    date: normalizeDate(row.date ?? row.tradeDate ?? row.jalaliDate ?? row.timestamp),
    close: num(row.close ?? row.closePrice ?? row.closingPrice ?? row.lastPrice),
  })).filter((x): x is { date: string; close: number } => Boolean(x.date) && x.close != null && x.close > 0).sort((a, b) => a.date.localeCompare(b.date));
}

function riskFromReturns(returns: number[]) {
  const volatility = stddev(returns);
  const downside = returns.filter(x => x < 0);
  const downsideDeviation = downside.length ? Math.sqrt(downside.reduce((s, x) => s + x * x, 0) / downside.length) : 0;
  return { volatilityPercent: volatility, downsideDeviationPercent: downsideDeviation };
}

function maxDrawdown(closes: number[]): number | null {
  if (!closes.length) return null;
  let peak = closes[0];
  let max = 0;
  closes.forEach(close => { peak = Math.max(peak, close); if (peak > 0) max = Math.min(max, ((close - peak) / peak) * 100); });
  return max;
}

export async function getPortfolioRisk(): Promise<PortfolioRiskResult> {
  const portfolio = await portfolioService.getPortfolio();
  if (!portfolio.length) return { points: [], volatilityPercent: null, downsideDeviationPercent: null, maxDrawdownPercent: null, returnToRisk: null, positiveDays: 0, negativeDays: 0, holdingRisks: [] };

  const rows = await Promise.all(portfolio.map(async item => ({ item, quotes: await getQuotes(item.symbol).catch(() => []) })));
  const dailyValues = new Map<string, number>();
  rows.forEach(({ item, quotes }) => {
    const entryDate = normalizeDate(item.entryDate);
    quotes.forEach(q => { if (!entryDate || q.date >= entryDate) dailyValues.set(q.date, (dailyValues.get(q.date) ?? 0) + q.close * item.quantity); });
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
  const totalReturn = sorted.length > 1 && sorted[0][1] > 0 ? ((sorted[sorted.length - 1][1] / sorted[0][1]) - 1) * 100 : null;
  const returnToRisk = totalReturn != null && risk.volatilityPercent && risk.volatilityPercent > 0 ? totalReturn / risk.volatilityPercent : null;

  const holdingRisks = await Promise.all(rows.map(async ({ item, quotes }) => {
    const entryDate = normalizeDate(item.entryDate);
    const active = quotes.filter(q => !entryDate || q.date >= entryDate);
    const returns = active.slice(1).map((q, i) => active[i].close > 0 ? ((q.close / active[i].close) - 1) * 100 : null).filter((x): x is number => x != null);
    const r = riskFromReturns(returns);
    return { symbol: item.symbol, name: item.name, volatilityPercent: r.volatilityPercent, downsideDeviationPercent: r.downsideDeviationPercent, maxDrawdownPercent: maxDrawdown(active.map(q => q.close)), observations: returns.length };
  }));

  return { points, volatilityPercent: risk.volatilityPercent, downsideDeviationPercent: risk.downsideDeviationPercent, maxDrawdownPercent: maxDrawdown(sorted.map(([, value]) => value)), returnToRisk, positiveDays, negativeDays, holdingRisks };
}
