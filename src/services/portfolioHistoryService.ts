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

export function buildPortfolioHistory(analytics: Awaited<ReturnType<typeof getPortfolioAnalytics>>): PortfolioHistoryPoint[] {
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

  // Build a shared calendar from every symbol's available history. A symbol
  // without a quote on a particular day must retain its last known close;
  // dropping it from that day's total creates an artificially small portfolio
  // value and can massively inflate the period return.
  const dates = Array.from(new Set(rows.flatMap(({ quotes }) => quotes.map(point => point.date))))
    .sort((a, b) => a.localeCompare(b));
  const quoteIndexes = rows.map(() => -1);
  const latestQuotes: Array<number | null> = rows.map(() => null);
  const byDate = new Map<string, { value: number; cost: number; capitalChange: number; marketPnl: number; dailyReturnPercent: number | null }>();
  const previousQuantities = rows.map(() => 0);
  let previousValue: number | null = null;

  dates.forEach(date => {
    let value = 0;
    let cost = 0;
    let capitalChange = 0;
    let hasActivePosition = false;
    let hasCompleteValuation = true;

    rows.forEach(({ item, quotes }, rowIndex) => {
      const activeQuantity = activeQuantityAtDate(item, date, sales);
      let quoteIndex = quoteIndexes[rowIndex];
      while (quoteIndex + 1 < quotes.length && quotes[quoteIndex + 1].date <= date) {
        quoteIndex += 1;
        latestQuotes[rowIndex] = quotes[quoteIndex].close;
      }
      quoteIndexes[rowIndex] = quoteIndex;

      const close = latestQuotes[rowIndex];
      const quantityChange = activeQuantity - previousQuantities[rowIndex];
      previousQuantities[rowIndex] = activeQuantity;

      if (activeQuantity > 0) hasActivePosition = true;
      if ((activeQuantity > 0 || quantityChange !== 0) && (close == null || close <= 0)) {
        hasCompleteValuation = false;
        return;
      }
      if (close == null || close <= 0) return;

      // Treat additions and disposals as cash flows at that day's closing
      // market price, not at historical cost basis. This prevents a purchase
      // or sale from being mistaken for investment performance.
      capitalChange += close * quantityChange;
      value += close * activeQuantity;
      cost += item.buyPrice * activeQuantity;
    });

    if (!hasActivePosition || !hasCompleteValuation) return;
    const marketPnl = previousValue == null ? 0 : value - previousValue - capitalChange;
    const dailyReturnPercent = previousValue != null && previousValue > 0
      ? (marketPnl / previousValue) * 100
      : null;
    byDate.set(date, { value, cost, capitalChange, marketPnl, dailyReturnPercent });
    previousValue = value;
  });

  const sorted = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([date, data]) => ({
    date,
    value: data.value,
    cost: data.cost,
    pnl: data.value - data.cost,
    returnPercent: data.cost > 0 ? ((data.value - data.cost) / data.cost) * 100 : 0,
    capitalChange: data.capitalChange,
    marketPnl: data.marketPnl,
    dailyReturnPercent: data.dailyReturnPercent,
  }));
}

export interface PortfolioRealizedPerformance {
  tradeCount: number;
  proceeds: number;
  costBasis: number;
  realizedPnl: number;
  realizedPnlPercent: number;
}

export function buildPortfolioRealizedPerformance(analytics: Awaited<ReturnType<typeof getPortfolioAnalytics>>): PortfolioRealizedPerformance {
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

export async function getPortfolioHistory(): Promise<PortfolioHistoryPoint[]> {
  return buildPortfolioHistory(await getPortfolioAnalytics());
}

export async function getPortfolioRealizedPerformance(): Promise<PortfolioRealizedPerformance> {
  return buildPortfolioRealizedPerformance(await getPortfolioAnalytics());
}
