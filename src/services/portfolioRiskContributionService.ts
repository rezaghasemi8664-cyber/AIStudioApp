import api from '../api/apiClient';
import * as portfolioService from './portfolioService';
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

async function getQuotes(symbol: string) {
  const paths = [
    `/brs/symbol/${encodeURIComponent(symbol)}/candles`,
    `/brs/symbol/${encodeURIComponent(symbol)}/history`,
  ];
  for (const path of paths) {
    try {
      const response = await api.get(path, { params: { limit: 365 } });
      const payload = response?.data;
      const raw = payload?.data?.candles ?? payload?.data?.items ?? payload?.data ?? payload?.candles ?? payload?.items ?? payload ?? [];
      if (!Array.isArray(raw)) continue;
      const rows = raw.map(row => ({
        date: normalizeDate(row.date ?? row.d ?? row.tradeDate ?? row.jalaliDate ?? row.timestamp),
        close: num(row.close ?? row.lastClosePrice ?? row.closePrice ?? row.closingPrice ?? row.lastPrice ?? row.last),
      })).filter((x): x is { date: string; close: number } => Boolean(x.date) && x.close != null && x.close > 0).sort((a, b) => a.date.localeCompare(b.date));
      if (rows.length >= 2) return rows;
    } catch (_) {}
  }
  return [];
}

export async function getPortfolioRiskContribution(): Promise<PortfolioRiskContributionResult> {
  const portfolio = await portfolioService.getPortfolio();
  const groupedPortfolio = portfolioService.aggregatePortfolioItems(portfolio);
  if (!groupedPortfolio.length) return { portfolioVolatilityPercent: null, totalContributionPercent: null, rows: [] };

  const loaded = await Promise.all(groupedPortfolio.map(async item => ({ item, quotes: await getQuotes(item.symbol).catch(() => []) })));
  const returns = new Map<string, Map<string, number>>();
  loaded.forEach(({ item, quotes }) => {
    const entry = normalizeDate(item.entryDate);
    const active = quotes.filter(q => !entry || q.date >= entry);
    const map = new Map<string, number>();
    for (let i = 1; i < active.length; i += 1) {
      if (active[i - 1].close > 0) map.set(active[i].date, active[i].close / active[i - 1].close - 1);
    }
    returns.set(item.symbol, map);
  });

  const values = loaded.map(({ item, quotes }) => {
    const entry = normalizeDate(item.entryDate);
    const active = quotes.filter(q => !entry || q.date >= entry);
    const latest = active.length ? active[active.length - 1].close : null;
    return { symbol: item.symbol, value: latest != null ? latest * item.quantity : 0 };
  });
  const totalValue = values.reduce((s, x) => s + x.value, 0);
  const weights = new Map(values.map(x => [x.symbol, totalValue > 0 ? x.value / totalValue : 0]));

  const dates = new Set<string>();
  returns.forEach(map => map.forEach((_, d) => dates.add(d)));
  const sortedDates = Array.from(dates).sort();
  const portfolioReturns: number[] = [];
  for (const d of sortedDates) {
    let weighted = 0;
    let weightSum = 0;
    returns.forEach((map, symbol) => {
      const r = map.get(d);
      const w = weights.get(symbol) ?? 0;
      if (r != null && w > 0) { weighted += r * w; weightSum += w; }
    });
    if (weightSum > 0) portfolioReturns.push(weighted / weightSum);
  }
  const portfolioStd = stddev(portfolioReturns);
  const rows: RiskContributionRow[] = loaded.map(({ item }) => {
    const map = returns.get(item.symbol) ?? new Map<string, number>();
    const ownReturns = Array.from(map.values());
    const ownStd = stddev(ownReturns);
    const weight = weights.get(item.symbol) ?? 0;
    const contribution = portfolioStd != null && portfolioStd > 0 && ownStd != null ? (weight * ownStd) / portfolioStd : null;
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
  const valid = rows.filter(x => x.contributionPercent != null);
  const totalContributionPercent = valid.length ? valid.reduce((s, x) => s + (x.contributionPercent ?? 0), 0) : null;
  return { portfolioVolatilityPercent: portfolioStd == null ? null : portfolioStd * 100, totalContributionPercent, rows };
}
