export interface DashboardMarketIndex {
  name: string;
  value: number | null;
  changeValue: number;
  changePercent: number;
  isMarketOpen: boolean;
}

export interface DashboardMarketSnapshot {
  updatedAt: string;
  indices: DashboardMarketIndex[];
  totalValue: number | null;
  totalVolume: number | null;
  totalTrades: number | null;
}

export interface DashboardMover {
  symbol: string;
  name?: string;
  price: number | null;
  changePercent: number;
  volume?: number | null;
}

export interface DashboardIndustry {
  name: string;
  changePercent: number;
  value?: number | null;
  symbolCount?: number | null;
}

export interface DashboardAlert {
  id: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface DashboardCodalEvent {
  id: string;
  title: string;
  symbol?: string;
  publishedAt?: string | null;
  url?: string | null;
}

export interface DashboardPersonalSummary {
  watchlistCount: number;
  watchlistSymbolCount: number;
  portfolioCount: number;
  portfolioInvestedValue: number;
  unreadAlertCount: number;
  subscriptionDaysRemaining: number | null;
  subscriptionExpired: boolean;
}

export interface DashboardData {
  market: DashboardMarketSnapshot | null;
  gainers: DashboardMover[];
  losers: DashboardMover[];
  highVolume: DashboardMover[];
  industries: DashboardIndustry[];
  alerts: DashboardAlert[];
  codalEvents: DashboardCodalEvent[];
  personal: DashboardPersonalSummary;
  fetchedAt: string;
}
