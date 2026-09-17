import api from '../api/apiClient';
import * as portfolioService from './portfolioService';

export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  cost: number;
  pnl: number;
  returnPercent: number;
}

interface QuotePoint {
  date: string;
  close: number;
}

const num = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function normalizeDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

async function getHistory(symbol: string): Promise<QuotePoint[]> {
  const response = await api.get(`/brs/symbol/${encodeURIComponent(symbol)}/history`, { params: { limit: 365 } });
  const raw = response?.data?.data ?? response?.data ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(row => ({
      date: normalizeDate(row.date ?? row.tradeDate ?? row.jalaliDate ?? row.timestamp),
      close: num(row.close ?? row.closePrice ?? row.closingPrice ?? row.lastPrice),
    }))
    .filter((row): row is { date: string; close: number } => Boolean(row.date) && row.close != null && row.close > 0);
}

export async function getPortfolioHistory(): Promise<PortfolioHistoryPoint[]> {
  const portfolio = await portfolioService.getPortfolio();
  if (!portfolio.length) return [];

  const rows = await Promise.all(
    portfolio.map(async item => ({
      item,
      quotes: await getHistory(item.symbol).catch(() => []),
      entryDate: normalizeDate(item.entryDate),
      cost: item.entryPrice * item.quantity,
    })),
  );

  const byDate = new Map<string, { value: number; cost: number }>();

  rows.forEach(({ item, quotes, entryDate, cost }) => {
    quotes.forEach(point => {
      if (entryDate && point.date < entryDate) return;
      const current = byDate.get(point.date) ?? { value: 0, cost: 0 };
      byDate.set(point.date, {
        value: current.value + point.close * item.quantity,
        cost: current.cost + cost,
      });
    });
  });

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      value: data.value,
      cost: data.cost,
      pnl: data.value - data.cost,
      returnPercent: data.cost > 0 ? ((data.value - data.cost) / data.cost) * 100 : 0,
    }));
}
