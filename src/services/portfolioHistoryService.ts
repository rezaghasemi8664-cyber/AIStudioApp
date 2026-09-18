import api from '../api/apiClient';
import * as portfolioService from './portfolioService';

export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  cost: number;
  pnl: number;
  returnPercent: number;
  capitalChange: number;
  marketPnl: number;
  dailyReturnPercent: number | null;
}

interface QuotePoint { date: string; close: number; }

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
  return raw.map(row => ({
    date: normalizeDate(row.date ?? row.tradeDate ?? row.jalaliDate ?? row.timestamp),
    close: num(row.close ?? row.closePrice ?? row.closingPrice ?? row.lastPrice),
  })).filter((row): row is { date: string; close: number } => Boolean(row.date) && row.close != null && row.close > 0);
}

interface HistoricalLot {
  id: string;
  quantity: number;
  buyPrice: number;
  entryDate: string | null;
}

interface HistoricalSale {
  sellDate: string | null;
  allocations: Array<{ lotId: string; quantity: number }>;
}

function activeQuantityAtDate(lot: HistoricalLot, date: string, sales: HistoricalSale[]): number {
  if (!lot.entryDate || date < lot.entryDate) return 0;
  const sold = sales.filter(sale => sale.sellDate && sale.sellDate <= date).reduce(
    (sum, sale) => sum + sale.allocations
      .filter(allocation => allocation.lotId === lot.id)
      .reduce((lotSum, allocation) => lotSum + Math.max(0, Number(allocation.quantity) || 0), 0),
    0,
  );
  return Math.max(0, lot.quantity - sold);
}

export async function getPortfolioHistory(): Promise<PortfolioHistoryPoint[]> {
  const portfolio = await portfolioService.getPortfolio();
  if (!portfolio.length) return [];

  const soldResult = await portfolioService.getSoldTrades().catch(() => ({ trades: [], realizedPnl: 0, proceeds: 0, costBasis: 0 }));
  const sales: HistoricalSale[] = (Array.isArray(soldResult.trades) ? soldResult.trades : []).map(trade => ({
    sellDate: normalizeDate(trade.sellDate),
    allocations: Array.isArray(trade.allocations) ? trade.allocations.map(allocation => ({
      lotId: String(allocation.lotId),
      quantity: Number(allocation.quantity) || 0,
    })) : [],
  }));

  const rows = await Promise.all(portfolio.map(async item => ({
    item: {
      id: String(item.id),
      quantity: Number(item.quantity) || 0,
      buyPrice: Number(item.entryPrice) || 0,
      entryDate: normalizeDate(item.entryDate),
    } satisfies HistoricalLot,
    quotes: await getHistory(item.symbol).catch(() => []),
  })));

  const byDate = new Map<string, { value: number; cost: number }>();

  rows.forEach(({ item, quotes }) => {
    quotes.forEach(point => {
      const activeQuantity = activeQuantityAtDate(item, point.date, sales);
      if (activeQuantity <= 0) return;
      const current = byDate.get(point.date) ?? { value: 0, cost: 0 };
      byDate.set(point.date, {
        value: current.value + point.close * activeQuantity,
        cost: current.cost + item.buyPrice * activeQuantity,
      });
    });
  });

  const sorted = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  let previousValue: number | null = null;
  let previousCost: number | null = null;

  return sorted.map(([date, data]) => {
    const pnl = data.value - data.cost;
    const capitalChange = previousCost == null ? data.cost : data.cost - previousCost;
    const marketPnl = previousValue == null ? pnl : data.value - previousValue - capitalChange;
    const denominator = previousValue == null ? data.cost : previousValue + Math.max(capitalChange, 0);
    const dailyReturnPercent = denominator > 0 ? (marketPnl / denominator) * 100 : null;
    const result: PortfolioHistoryPoint = {
      date,
      value: data.value,
      cost: data.cost,
      pnl,
      returnPercent: data.cost > 0 ? (pnl / data.cost) * 100 : 0,
      capitalChange,
      marketPnl,
      dailyReturnPercent,
    };
    previousValue = data.value;
    previousCost = data.cost;
    return result;
  });
}

export interface PortfolioRealizedPerformance {
  tradeCount: number;
  proceeds: number;
  costBasis: number;
  realizedPnl: number;
  realizedPnlPercent: number;
}

export async function getPortfolioRealizedPerformance(): Promise<PortfolioRealizedPerformance> {
  const result = await portfolioService.getSoldTrades();
  const tradeCount = Array.isArray(result.trades) ? result.trades.length : 0;
  const proceeds = num(result.proceeds) ?? 0;
  const costBasis = num(result.costBasis) ?? 0;
  const realizedPnl = num(result.realizedPnl) ?? 0;
  return { tradeCount, proceeds, costBasis, realizedPnl, realizedPnlPercent: costBasis > 0 ? (realizedPnl / costBasis) * 100 : 0 };
}
