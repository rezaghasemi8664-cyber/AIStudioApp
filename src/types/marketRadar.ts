export interface MarketRadarIndex {
  name: string;
  value: number | null;
  changeValue: number;
  changePercent: number;
}

export interface MarketRadarMover {
  symbol: string;
  changePercent: number | null;
  volume: number;
  value: number;
}

export interface MarketRadarSector {
  name: string;
  symbols: number;
  changePercent: number;
  value: number;
}

export interface MarketRadarBreadth {
  available: boolean;
  positive: number;
  negative: number;
  neutral: number;
  total: number;
  positivePercent: number;
  negativePercent: number;
  neutralPercent: number;
  advanceDeclineRatio: number | null;
  source: string | null;
  coveragePercent: number;
  topGainers: MarketRadarMover[];
  topLosers: MarketRadarMover[];
  topVolumes: MarketRadarMover[];
  sectors: {
    available: boolean;
    leaders: MarketRadarSector[];
    laggards: MarketRadarSector[];
    rows: MarketRadarSector[];
  };
  generatedAt: string | null;
}

export interface MarketRadarSnapshot {
  fetchedAt: string;
  marketOpen: boolean;
  indices: MarketRadarIndex[];
  totalValue: number | null;
  totalVolume: number | null;
  totalTrades: number | null;
  breadth: MarketRadarBreadth | null;
}
