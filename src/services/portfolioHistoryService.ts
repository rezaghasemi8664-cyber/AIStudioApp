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
  sellPrice: number;
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
    sellPrice: Math.max(0, Number(trade.sellPrice) || 0),
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
    const nextQuantities = previousQuantities.slice();

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
      nextQuantities[rowIndex] = activeQuantity;

      if (activeQuantity > 0) hasActivePosition = true;
      if ((activeQuantity > 0 || quantityChange !== 0) && (close == null || close <= 0)) {
        hasCompleteValuation = false;
        return;
      }
      if (close == null || close <= 0) return;

      // Purchases remain external capital additions at the closing valuation,
      // while sales use their recorded execution proceeds. This captures the
      // difference between the actual sale price and that day's closing price
      // instead of silently valuing every disposal at the close.
      const addedQuantity = Math.max(0, quantityChange);
      const removedQuantity = Math.max(0, -quantityChange);
      const recordedSaleProceeds = sales
        .filter(sale => sale.sellDate === date)
        .reduce((sum, sale) => sum + sale.allocations
          .filter(allocation => allocation.lotId === item.id)
          .reduce((allocationSum, allocation) => allocationSum + allocation.quantity * sale.sellPrice, 0), 0);
      const saleProceeds = recordedSaleProceeds > 0 ? recordedSaleProceeds : close * removedQuantity;
      capitalChange += close * addedQuantity - saleProceeds;
      value += close * activeQuantity;
      cost += item.buyPrice * activeQuantity;
    });

    if (!hasActivePosition) {
      for (let i = 0; i < previousQuantities.length; i += 1) previousQuantities[i] = 0;
      previousValue = null;
      return;
    }
    if (!hasCompleteValuation) return;
    for (let i = 0; i < previousQuantities.length; i += 1) previousQuantities[i] = nextQuantities[i];
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

export interface PortfolioCostBasisPerformance {
  totalPnl: number;
  costBasis: number;
  totalReturn: number | null;
  realizedPnl: number;
  additionalCostBasis: number;
}

/**
 * Measures cost-basis return for the selected interval. The opening unrealized
 * P/L is carried forward, sales after the opening valuation add realized P/L,
 * and purchases after the opening date add their original lot cost to capital.
 * Sales reduce open-position cost but do not erase the capital originally
 * deployed, so their allocated cost is deliberately not subtracted.
 */
export function buildPortfolioCostBasisPerformance(
  analytics: Awaited<ReturnType<typeof getPortfolioAnalytics>>,
  points: PortfolioHistoryPoint[],
): PortfolioCostBasisPerformance | null {
  if (!points.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const lots = new Map<string, { quantity: number; buyPrice: number; buyDate: string | null }>();

  (analytics.portfolio?.items || []).forEach(item => {
    const id = String(item.id);
    const existing = lots.get(id);
    lots.set(id, {
      quantity: (existing?.quantity || 0) + Math.max(0, Number(item.quantity) || 0),
      buyPrice: Number(item.buyPrice) || existing?.buyPrice || 0,
      buyDate: normalizeDate(item.entryDate) || existing?.buyDate || null,
    });
  });

  const sales = Array.isArray(analytics.portfolio?.soldTrades) ? analytics.portfolio.soldTrades : [];
  sales.forEach(trade => (Array.isArray(trade.allocations) ? trade.allocations : []).forEach(allocation => {
    const id = String(allocation.lotId);
    const existing = lots.get(id);
    lots.set(id, {
      quantity: (existing?.quantity || 0) + Math.max(0, Number(allocation.quantity) || 0),
      buyPrice: Number(allocation.buyPrice) || existing?.buyPrice || 0,
      buyDate: normalizeDate(allocation.buyDate) || existing?.buyDate || null,
    });
  }));

  const additionalCostBasis = Array.from(lots.values()).reduce((sum, lot) => {
    if (!lot.buyDate || lot.buyDate <= first.date || lot.buyDate > last.date) return sum;
    return sum + lot.quantity * lot.buyPrice;
  }, 0);
  const realizedPnl = sales.reduce((sum, trade) => {
    const sellDate = normalizeDate(trade.sellDate);
    if (!sellDate || sellDate <= first.date || sellDate > last.date) return sum;
    const proceeds = num(trade.proceeds) ?? ((Number(trade.soldQuantity) || 0) * (Number(trade.sellPrice) || 0));
    const costBasis = num(trade.costBasis) ?? (trade.allocations || []).reduce((total, allocation) => total + (Number(allocation.costBasis) || 0), 0);
    return sum + (num(trade.realizedPnl) ?? (proceeds - costBasis));
  }, 0);
  const totalPnl = (last.pnl - first.pnl) + realizedPnl;
  const costBasis = Math.max(0, Number(first.cost) || 0) + additionalCostBasis;
  return {
    totalPnl,
    costBasis,
    totalReturn: costBasis > 0 ? (totalPnl / costBasis) * 100 : null,
    realizedPnl,
    additionalCostBasis,
  };
}
