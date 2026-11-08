import { getPortfolioAnalytics } from './portfolioAnalyticsService';
import { normalizePortfolioDate } from '../utils/portfolioDate';

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

interface HistoricalLot {
  id: string;
  symbol: string;
  quantity: number;
  buyPrice: number;
  entryDate: string | null;
}

interface HistoricalSale {
  sellDate: string | null;
  allocations: Array<{ lotId: string; quantity: number }>;
}

const normalizeDate = normalizePortfolioDate;
const num = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function activeQuantityAtDate(lot: HistoricalLot, date: string, sales: HistoricalSale[]): number {
  if (!lot.entryDate || date < lot.entryDate) return 0;
  const sold = sales
    .filter(sale => sale.sellDate && sale.sellDate <= date)
    .reduce((sum, sale) => sum + sale.allocations
      .filter(allocation => allocation.lotId === lot.id)
      .reduce((lotSum, allocation) => lotSum + Math.max(0, Number(allocation.quantity) || 0), 0), 0);
  return Math.max(0, lot.quantity - sold);
}

export async function getPortfolioHistory(): Promise<PortfolioHistoryPoint[]> {
  const analytics = await getPortfolioAnalytics();
  const portfolio = analytics.portfolio;
  const currentItems = Array.isArray(portfolio?.items) ? portfolio.items : [];
  const trades = Array.isArray(portfolio?.soldTrades) ? portfolio.soldTrades : [];
  if (!currentItems.length && !trades.length) return [];

  const sales: HistoricalSale[] = trades.map(trade => ({
    sellDate: normalizeDate(trade.sellDate),
    allocations: Array.isArray(trade.allocations) ? trade.allocations.map(allocation => ({
      lotId: String(allocation.lotId),
      quantity: Number(allocation.quantity) || 0,
    })) : [],
  }));

  const lotMap = new Map<string, HistoricalLot>();
  currentItems.forEach(item => {
    const id = String(item.id);
    lotMap.set(id, {
      id,
      symbol: String(item.symbol || '').trim().toUpperCase(),
      quantity: Number(item.quantity) || 0,
      buyPrice: Number(item.buyPrice) || 0,
      entryDate: normalizeDate(item.entryDate),
    });
  });

  trades.forEach(trade => (Array.isArray(trade.allocations) ? trade.allocations : []).forEach(allocation => {
    const lotId = String(allocation.lotId);
    const quantity = Math.max(0, Number(allocation.quantity) || 0);
    if (lotMap.has(lotId)) {
      lotMap.get(lotId)!.quantity += quantity;
      return;
    }
    lotMap.set(lotId, {
      id: lotId,
      symbol: String(trade.symbol || '').trim().toUpperCase(),
      quantity,
      buyPrice: Number(allocation.buyPrice) || 0,
      entryDate: normalizeDate(allocation.buyDate),
    });
  }));

  const historyBySymbol = analytics.historyBySymbol || {};
  const rows = Array.from(lotMap.values()).map(item => ({
    item,
    quotes: (historyBySymbol[item.symbol] || [])
      .map(point => ({
        date: normalizeDate(point.date),
        close: num(point.close),
      }))
      .filter((point): point is { date: string; close: number } =>
        Boolean(point.date) && point.close != null && point.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
  }));

  const byDate = new Map<string, { value: number; cost: number }>();
  rows.forEach(({ item, quotes }) => quotes.forEach(point => {
    const activeQuantity = activeQuantityAtDate(item, point.date, sales);
    if (activeQuantity <= 0) return;
    const current = byDate.get(point.date) ?? { value: 0, cost: 0 };
    byDate.set(point.date, {
      value: current.value + point.close * activeQuantity,
      cost: current.cost + item.buyPrice * activeQuantity,
    });
  }));

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
  const analytics = await getPortfolioAnalytics();
  const trades = Array.isArray(analytics.portfolio?.soldTrades) ? analytics.portfolio.soldTrades : [];
  const proceeds = trades.reduce((sum, trade) => sum + (num(trade.proceeds) ?? 0), 0);
  const costBasis = trades.reduce((sum, trade) => sum + (num(trade.costBasis) ?? 0), 0);
  const realizedPnl = trades.reduce((sum, trade) => sum + (num(trade.realizedPnl) ?? 0), 0);
  return {
    tradeCount: trades.length,
    proceeds,
    costBasis,
    realizedPnl,
    realizedPnlPercent: costBasis > 0 ? (realizedPnl / costBasis) * 100 : 0,
  };
}
