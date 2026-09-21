export type MarketRadarHistoryRange = '1d' | '1w' | '1m' | '3m' | '6m' | '1y';

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

export interface MarketRadarHistoryPoint {
  timestamp: string;
  index: number | null;
  equalWeightedIndex: number | null;
  totalValue: number | null;
  totalVolume: number | null;
  totalTrades: number | null;
}

export interface MarketRadarHistory {
  range: MarketRadarHistoryRange;
  available: boolean;
  points: MarketRadarHistoryPoint[];
  generatedAt: string | null;
}

export type MarketRadarDataStatus = 'LIVE' | 'CACHED' | 'UNAVAILABLE';

export interface MarketRadarSnapshot {
  fetchedAt: string;
  dataStatus: MarketRadarDataStatus;
  source?: string | null;
  stale?: boolean;
  marketOpen: boolean;
  indices: MarketRadarIndex[];
  totalValue: number | null;
  totalVolume: number | null;
  totalTrades: number | null;
  breadth: MarketRadarBreadth | null;
}
