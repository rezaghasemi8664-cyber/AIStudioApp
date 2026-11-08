import api from '../api/apiClient';

export interface PortfolioAnalyticsPoint {
  date: string;
  close: number;
}

export interface PortfolioAnalyticsLot {
  id: string;
  symbol: string;
  name?: string;
  quantity: number;
  buyPrice: number;
  entryDate: string;
}

export interface PortfolioAnalyticsAllocation {
  lotId: string;
  quantity: number;
  buyPrice: number;
  buyDate: string;
  costBasis: number;
  holdingDays: number | null;
}

export interface PortfolioAnalyticsSale {
  id: string;
  symbol: string;
  name?: string;
  soldQuantity: number;
  sellPrice: number;
  sellDate: string;
  allocations: PortfolioAnalyticsAllocation[];
  proceeds: number;
  costBasis: number;
  realizedPnl: number;
  realizedPnlPercent: number;
}

export interface PortfolioAnalyticsPayload {
  portfolio: {
    items: PortfolioAnalyticsLot[];
    soldTrades: PortfolioAnalyticsSale[];
    totalValue?: number;
  };
  quoteData: {
    items: Array<PortfolioAnalyticsLot & {
      currentPrice?: number | null;
      changePercent?: number | null;
      dataStatus?: 'LIVE' | 'CACHED' | 'UNAVAILABLE';
      source?: string | null;
      fetchedAt?: string | null;
      stale?: boolean;
    }>;
    currentValue: number;
    costBasis: number;
    unrealizedPnl: number;
    snapshotId: string | number | null;
    snapshotUpdatedAt: string | null;
  };
  historyBySymbol: Record<string, PortfolioAnalyticsPoint[]>;
  snapshotId: string | number | null;
  snapshotUpdatedAt: string | null;
  historyUpdatedAt: string;
}

let inFlight: Promise<PortfolioAnalyticsPayload> | null = null;

// All portfolio analytics surfaces share one request. The server owns the
// durable-in-process per-user cache and coalesces concurrent card refreshes.
export async function getPortfolioAnalytics(): Promise<PortfolioAnalyticsPayload> {
  if (inFlight) return inFlight;

  const request = api.get('/portfolio/analytics').then(response => {
    const payload = response?.data?.data ?? response?.data ?? response;
    if (!payload || typeof payload !== 'object') {
      throw new Error('پاسخ داده تحلیلی سبد معتبر نیست.');
    }
    return payload as PortfolioAnalyticsPayload;
  });
  inFlight = request;

  try {
    return await request;
  } finally {
    if (inFlight === request) inFlight = null;
  }
}
