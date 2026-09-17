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

export interface DashboardData {
  market: DashboardMarketSnapshot | null;
  gainers: DashboardMover[];
  losers: DashboardMover[];
  fetchedAt: string;
}
