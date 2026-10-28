export type MarketRadarHistoryRange = '1d' | '1w' | '1m' | '3m' | '6m' | '1y';

export interface MarketRadarIndex {
  name: string;
  value: number | null;
  changeValue: number | null;
  changePercent: number | null;
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
  positive: number;
  negative: number;
  neutral: number;
  changePercent: number;
  value: number;
  realMoneyFlow?: number | null;
  moneyFlowRows?: number;
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
  realFlow?: {
    available: boolean;
    rowsWithRealFlow: number;
    totalRealBuyVolume: number | null;
    totalRealSellVolume: number | null;
    netRealBuyVolume: number | null;
    moneyFlowAvailable?: boolean;
    moneyFlowRows?: number;
    totalRealBuyValue?: number | null;
    totalRealSellValue?: number | null;
    netRealMoneyFlow?: number | null;
    realBuyerCount?: number | null;
    realSellerCount?: number | null;
    averageRealBuyPerBuyer?: number | null;
    averageRealSellPerSeller?: number | null;
    perCapitaRatio?: number | null;
    legalFlowAvailable?: boolean;
    legalFlowRows?: number;
    totalLegalBuyValue?: number | null;
    totalLegalSellValue?: number | null;
    netLegalMoneyFlow?: number | null;
    legalVolumeAvailable?: boolean;
    totalLegalBuyVolume?: number | null;
    totalLegalSellVolume?: number | null;
    unit: 'volume' | 'rial' | null;
  };
  abnormalVolume?: { available: boolean; count: number; multiplier: number; baseline: string };
  queues?: { available: boolean; classifiedSymbols: number; buy: number; sell: number };
  marketValueVsAverage?: { available: boolean; currentValue: number; historicalAverage: number | null; changePercent: number | null; sampleDays: number; baseline: string };
}

export interface MarketRadarSymbol {
  symbol: string;
  name: string | null;
  sector: string | null;
  lastPrice: number | null;
  closePrice: number | null;
  lastChangePercent: number | null;
  closeChangePercent: number | null;
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
  granularity?: 'intraday' | 'daily';
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
