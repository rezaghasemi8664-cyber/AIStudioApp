import { getPortfolioAnalytics } from './portfolioAnalyticsService';
import { normalizePortfolioDate } from '../utils/portfolioDate';

export interface RiskContributionRow {
  symbol: string;
  weightPercent: number;
  volatilityPercent: number | null;
  contributionPercent: number | null;
  standaloneRiskPercent: number | null;
  observations: number;
}

export interface PortfolioRiskContributionResult {
  portfolioVolatilityPercent: number | null;
  totalContributionPercent: number | null;
  rows: RiskContributionRow[];
}

const num = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const normalizeDate = normalizePortfolioDate;
const stddev = (values: number[]) => {
  if (values.length < 2) return null;
  const mean = values.reduce((s, x) => s + x, 0) / values.length;
  return Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1));
};

export async function getPortfolioRiskContribution(): Promise<PortfolioRiskContributionResult> {
  const analytics = await getPortfolioAnalytics();
  const portfolio = Array.isArray(analytics.portfolio?.items) ? analytics.portfolio.items : [];
  const historyBySymbol = analytics.historyBySymbol || {};
  const grouped = new Map<string, { symbol: string; name?: string; quantity: number; firstEntryDate: string }>();

  portfolio.forEach(item => {
    const symbol = String(item.symbol || '').trim().toUpperCase();
    const quantity = Number(item.quantity);
    if (!symbol || !Number.isFinite(quantity) || quantity <= 0) return;
    const entryDate = normalizeDate(item.entryDate);
    const existing = grouped.get(symbol);
    if (existing) {
      existing.quantity += quantity;
      if (entryDate && (!existing.firstEntryDate || entryDate < existing.firstEntryDate)) existing.firstEntryDate = entryDate;
      if (!existing.name && item.name) existing.name = item.name;
    } else {
      grouped.set(symbol, { symbol, name: item.name, quantity, firstEntryDate: entryDate });
    }
  });

  const holdings = Array.from(grouped.values());
  if (!holdings.length) return { portfolioVolatilityPercent: null, totalContributionPercent: null, rows: [] };

  const loaded = holdings.map(item => {
    const quotes = (historyBySymbol[item.symbol] || [])
      .map(row => ({ date: normalizeDate(row.date), close: num(row.close) }))
      .filter((row): row is { date: string; close: number } => Boolean(row.date) && row.close != null && row.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const active = quotes.filter(q => !item.firstEntryDate || q.date >= item.firstEntryDate);
    const returns = new Map<string, number>();
    for (let i = 1; i < active.length; i += 1) {
      if (active[i - 1].close > 0) returns.set(active[i].date, active[i].close / active[i - 1].close - 1);
    }
    const latest = active.length ? active[active.length - 1].close : null;
    return { item, active, returns, value: latest != null ? latest * item.quantity : 0 };
  });

  const totalValue = loaded.reduce((sum, row) => sum + row.value, 0);
  const weights = new Map(loaded.map(row => [row.item.symbol, totalValue > 0 ? row.value / totalValue : 0]));
  const dates = new Set<string>();
  loaded.forEach(row => row.returns.forEach((_, day) => dates.add(day)));

  const portfolioReturns: number[] = [];
  Array.from(dates).sort().forEach(day => {
    let weighted = 0;
    let weightSum = 0;
    loaded.forEach(row => {
      const dailyReturn = row.returns.get(day);
      const weight = weights.get(row.item.symbol) ?? 0;
      if (dailyReturn != null && weight > 0) {
        weighted += dailyReturn * weight;
        weightSum += weight;
      }
    });
    if (weightSum > 0) portfolioReturns.push(weighted / weightSum);
  });

  const portfolioStd = stddev(portfolioReturns);
  const rows: RiskContributionRow[] = loaded.map(({ item, returns }) => {
    const ownReturns = Array.from(returns.values());
    const ownStd = stddev(ownReturns);
    const weight = weights.get(item.symbol) ?? 0;
    const contribution = portfolioStd != null && portfolioStd > 0 && ownStd != null
      ? (weight * ownStd) / portfolioStd
      : null;
    return {
      symbol: item.symbol,
      weightPercent: weight * 100,
      volatilityPercent: ownStd == null ? null : ownStd * 100,
      contributionPercent: contribution == null ? null : contribution * 100,
      standaloneRiskPercent: ownStd == null ? null : ownStd * 100,
      observations: ownReturns.length,
    };
  });

  rows.sort((a, b) => (b.contributionPercent ?? -1) - (a.contributionPercent ?? -1));
  const valid = rows.filter(row => row.contributionPercent != null);
  const totalContributionPercent = valid.length
    ? valid.reduce((sum, row) => sum + (row.contributionPercent ?? 0), 0)
    : null;
  return {
    portfolioVolatilityPercent: portfolioStd == null ? null : portfolioStd * 100,
    totalContributionPercent,
    rows,
  };
}
