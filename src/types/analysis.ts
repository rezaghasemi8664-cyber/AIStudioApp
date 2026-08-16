export type AnalysisRecommendation = 'buy' | 'hold' | 'sell';
export type AnalysisRiskLevel = 'low' | 'medium' | 'high';
export type AnalysisTrend = 'bullish' | 'neutral' | 'bearish';
export type AnalysisSentiment = 'positive' | 'neutral' | 'negative';

export interface AnalysisPoint {
  price: number;
  reason?: string;
}

export interface MoneyFlowBreakdown {
  inflow: number;
  outflow: number;
  net: number;
}

/**
 * UnifiedMoneyFlow باید با مصرف واقعی UI همخوان باشد:
 * - بعضی جاها ساختار breakdown (real/legal) می‌آید
 * - بعضی جاها net/inflow/outflow/buy/sell
 */
export interface UnifiedMoneyFlow {
  // compact shape
  inflow?: number | null;
  outflow?: number | null;
  net?: number | null;
  buy?: number | null;
  sell?: number | null;

  // expanded shape
  real?: MoneyFlowBreakdown | null;
  legal?: MoneyFlowBreakdown | null;

  [key: string]: unknown;
}

export type MoneyFlowValue =
  | MoneyFlowBreakdown
  | number
  | null
  | {
      inflow?: number | null;
      outflow?: number | null;
      net?: number | null;
      buy?: number | null;
      sell?: number | null;
      [key: string]: unknown;
    };

export interface OHLCPoint {
  date: string;
  time?: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume?: number | null;
  value?: number | null;
  count?: number | null;
  [key: string]: unknown;
}

export interface ExtendedCandlePoint {
  date: string;
  time?: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  last?: number | null;
  volume?: number | null;
  value?: number | null;
  count?: number | null;
  [key: string]: unknown;
}

export interface DailySummary {
  closingPrice?: number | null;
  lastTradedPrice?: number | null;
  priceChangePercent?: number | null;
  pe?: number | null;
  eps?: number | null;
  marketCap?: number | null;
  tradedVolume?: number | null;
  tradedValue?: number | null;
  value?: number | null;
  high?: number | null;
  low?: number | null;
  average?: number | null;
  moneyFlow?: number | null;
  realMoneyFlow?: number | null;
  legalMoneyFlow?: number | null;

  // aliases متداول
  closePrice?: number | null;
  lastPrice?: number | null;
  changePercent?: number | null;
  tradeValue?: number | null;
  volume?: number | null;
  avgPrice?: number | null;
  max?: number | null;
  min?: number | null;

  [key: string]: unknown;
}

export interface AnalysisMarketMetrics {
  closingPrice?: number | null;
  lastTradedPrice?: number | null;
  priceChangePercent?: number | null;
  pe?: number | null;
  eps?: number | null;
  marketCap?: number | null;
  tradedVolume?: number | null;
  tradedValue?: number | null;
  highPrice?: number | null;
  lowPrice?: number | null;
  averagePrice?: number | null;
  lastPrice?: number | null;
  moneyFlow?: number | null;
  realMoneyFlow?: number | null;
  legalMoneyFlow?: number | null;
  realMoneyFlowBreakdown?: MoneyFlowBreakdown | null;
  legalMoneyFlowBreakdown?: MoneyFlowBreakdown | null;

  // aliases متداول BRS/API
  closePrice?: number | null;
  changePercent?: number | null;
  tradeValue?: number | null;
  volume?: number | null;
  avgPrice?: number | null;

  [key: string]: unknown;
}

export interface AnalysisMarketData {
  closingPrice?: number | null;
  lastTradedPrice?: number | null;
  priceChangePercent?: number | null;
  pe?: number | null;
  eps?: number | null;
  marketCap?: number | null;
  tradedVolume?: number | null;
  tradedValue?: number | null;

  moneyFlow?: UnifiedMoneyFlow | number | null;
  realMoneyFlow?: MoneyFlowValue;
  legalMoneyFlow?: MoneyFlowValue;

  dailyCandles?: OHLCPoint[];
  adjustedDailyCandles?: OHLCPoint[];
  dailySummary?: DailySummary | null;
  marketMetrics?: AnalysisMarketMetrics | null;

  // backward compatibility
  lastClosePrice?: number | null;
  volume?: number | null;
  value?: number | null;
  dailyCandle?: OHLCPoint | OHLCPoint[] | null;
  adjustedDailyCandle?: OHLCPoint | OHLCPoint[] | null;

  // priceHistory container (برای fallback کندل تعدیل‌شده)
  priceHistory?: AnalysisPriceHistory | null;

  [key: string]: unknown;
}

export interface PriceHistoryPoint {
  date: string;
  time?: string | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  last?: number | null;
  volume?: number | null;
  value?: number | null;
  count?: number | null;
  [key: string]: unknown;
}

export interface AnalysisPriceHistory {
  daily?: PriceHistoryPoint[];
  adjustedDaily?: PriceHistoryPoint[];
  weekly?: PriceHistoryPoint[];
  monthly?: PriceHistoryPoint[];
  [key: string]: unknown;
}

export interface AnalysisScores {
  fundamentalScore?: number | null;
  technicalScore?: number | null;
  [key: string]: unknown;
}

export interface AnalysisSignals {
  entryPoints?: AnalysisPoint[];
  exitPoints?: AnalysisPoint[];
  stopLoss?: number | null;

  // UI شما targets را object هم می‌خواند (Object.entries)
  targets?: number[] | Record<string, number>;

  timeframe?: string;
  [key: string]: unknown;
}

export interface AnalysisExplanations {
  fundamental?: string;
  technical?: string;
  additional?: string;
  [key: string]: unknown;
}

export interface AnalysisUsage {
  // camelCase
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;

  // snake_case (برای UI فعلی)
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;

  cost?: number | null;
  [key: string]: unknown;
}

export interface AnalysisResult {
  recommendation: AnalysisRecommendation;
  riskLevel: AnalysisRiskLevel;
  shortTermTrend: AnalysisTrend;
  mediumTermTrend: AnalysisTrend;
  sentiment: AnalysisSentiment;
  confidence: number;
  marketData: AnalysisMarketData;
  scores: AnalysisScores;
  signals: AnalysisSignals;
  explanations: AnalysisExplanations;

  symbol?: string;
  summary?: string;
  analysisDate?: string;
  model?: string;
  usage?: AnalysisUsage | null;
  priceHistory?: AnalysisPriceHistory;
  rawData?: unknown;

  // top-level aliases for compatibility with backend/UI variants
  closingPrice?: number | null;
  lastTradedPrice?: number | null;
  lastClosePrice?: number | null;
  priceChangePercent?: number | null;
  pe?: number | null;
  eps?: number | null;
  marketCap?: number | null;
  tradedVolume?: number | null;
  tradedValue?: number | null;
  volume?: number | null;
  value?: number | null;
  moneyFlow?: number | null;
  realMoneyFlow?: number | null;
  legalMoneyFlow?: number | null;
  realMoneyFlowBuy?: number | null;
  realMoneyFlowSell?: number | null;
  legalMoneyFlowBuy?: number | null;
  legalMoneyFlowSell?: number | null;
  fundamentalScore?: number | null;
  technicalScore?: number | null;
  dailyCandles?: OHLCPoint[];
  adjustedDailyCandles?: OHLCPoint[];
  dailyCandle?: OHLCPoint | OHLCPoint[] | null;
  adjustedDailyCandle?: OHLCPoint | OHLCPoint[] | null;
  dailySummary?: DailySummary | null;
  marketMetrics?: AnalysisMarketMetrics | null;

  // snake_case aliases
  price_change_percent?: number | null;
  market_cap?: number | null;
  traded_volume?: number | null;
  traded_value?: number | null;
  money_flow?: number | null;
  real_money_flow?: number | null;
  legal_money_flow?: number | null;
  fundamental_score?: number | null;
  technical_score?: number | null;

  // common API wrappers
  data?: unknown;
  result?: unknown;
  analysis?: unknown;
  message?: unknown;

  [key: string]: unknown;
}
