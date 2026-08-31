import type {
  AnalysisResult,
  ScalpingOpportunity,
  ScalpingCache,
  PortfolioItem,
  PortfolioOptimizationResult,
  StockComparisonResult,
  MostTradedStock,
  TopIndustryGroup,
  MoneyFlowStock,
  FeatureKey,
  MarketIndexData,
} from '../types';

import { appApiFetch } from './apiConfigService';

let scalpingCacheMem: ScalpingCache | null = null;
let marketIndexCacheMem: MarketIndexData | null = null;

function unwrap<T = any>(response: any): T {
  const root = response?.data ?? response;
  return (root?.data ?? root) as T;
}

function normalizeAnalysis(raw: any, symbol: string): AnalysisResult {
  const data = raw && typeof raw === 'object' ? raw : {};
  const recommendationRaw = String(data.recommendation ?? '').toUpperCase();
  const recommendation = recommendationRaw.includes('BUY') || recommendationRaw.includes('خرید')
    ? 'BUY'
    : recommendationRaw.includes('SELL') || recommendationRaw.includes('فروش')
      ? 'SELL'
      : 'HOLD';

  return {
    ...data,
    symbol,
    recommendation,
    currentPrice: Number(data.currentPrice ?? data.closingPrice ?? data.marketData?.lastClosePrice ?? 0),
    analysisDate: data.analysisDate || new Date().toISOString(),
  } as AnalysisResult;
}

export const analyzeStock = async (
  symbol: string,
  dailyCount = 30,
  weeklyCount = 24,
  featureKey: FeatureKey = 'analysis'
): Promise<AnalysisResult> => {
  const normalizedSymbol = String(symbol || '').trim();
  if (!normalizedSymbol) throw new Error('نماد سهام الزامی است.');

  const response = await appApiFetch<any>('/analyze/stock', {
    method: 'POST',
    body: JSON.stringify({ symbol: normalizedSymbol, dailyCount, weeklyCount, analysisType: featureKey, featureKey }),
  });

  return normalizeAnalysis(unwrap(response), normalizedSymbol);
};

export const getPortfolioOptimization = async (
  portfolio: PortfolioItem[],
  analyses: (AnalysisResult | undefined)[]
): Promise<PortfolioOptimizationResult> => {
  if (!Array.isArray(portfolio) || portfolio.length === 0) throw new Error('سبد سرمایه‌گذاری خالی است.');

  const context = portfolio.map((item, index) => ({
    symbol: item.symbol,
    name: (item as any).name || item.symbol,
    quantity: item.quantity,
    entryPrice: (item as any).entryPrice ?? (item as any).buyPrice ?? 0,
    purchaseDate: (item as any).entryDate ?? (item as any).purchaseDate ?? null,
    recommendation: analyses[index]?.recommendation || 'نامشخص',
    riskLevel: analyses[index]?.riskLevel || 'متوسط',
    currentPrice: analyses[index]?.currentPrice || 0,
    confidence: analyses[index]?.confidence || 0,
    summary: analyses[index]?.summary || '',
  }));

  const prompt = [
    'سبد سرمایه‌گذاری کاربر را به صورت حرفه‌ای تحلیل و بهینه‌سازی کن.',
    'فقط بر اساس داده‌های زیر تصمیم بگیر و عدد یا قیمت فرضی نساز.',
    'برای هر سهم اقدام خرید، فروش یا نگهداری و دلیل ارائه کن.',
    'خروجی فقط JSON معتبر باشد با ساختار: summary, riskScore, diversificationScore, recommendations.',
    JSON.stringify(context, null, 2),
  ].join('\n\n');

  const response = await appApiFetch<any>('/analyze', {
    method: 'POST',
    body: JSON.stringify({ prompt, analysisType: 'portfolio', featureKey: 'portfolio' }),
  });

  const result = unwrap<any>(response);
  if (!result || typeof result !== 'object') throw new Error('پاسخ معتبر از سرویس بهینه‌سازی سبد دریافت نشد.');

  const data = result?.data && typeof result.data === 'object' ? result.data : result;
  return {
    summary: data.summary || data.content || 'تحلیل سبد دریافت شد.',
    riskScore: Number(data.riskScore ?? data.risk_score ?? 50),
    diversificationScore: Number(data.diversificationScore ?? data.diversification_score ?? 50),
    recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
  } as PortfolioOptimizationResult;
};

export const compareStocks = async (
  symbol1: string,
  symbol2: string,
  settings: { dailyCount: number; weeklyCount: number }
): Promise<StockComparisonResult> => {
  const response = await appApiFetch<any>('/analyze/compare', {
    method: 'POST',
    body: JSON.stringify({ symbols: [symbol1, symbol2], dailyCount: settings.dailyCount, weeklyCount: settings.weeklyCount }),
  });
  return unwrap<StockComparisonResult>(response);
};

export const runAutomatedScalpingAnalysis = async (): Promise<{ newOpportunitySymbols: string[] }> => {
  try {
    const response = await appApiFetch<any>('/scalping/run', { method: 'POST' });
    const data = unwrap<any>(response);
    const opportunities = Array.isArray(data?.opportunities) ? data.opportunities : [];
    scalpingCacheMem = { data: opportunities as ScalpingOpportunity[], timestamp: Date.now() };
    return { newOpportunitySymbols: opportunities.map((x: any) => x.symbol).filter(Boolean) };
  } catch (error) {
    console.error('[Scalping] automated analysis failed:', error);
    return { newOpportunitySymbols: [] };
  }
};

export const runAutomatedScalping = async (): Promise<{ newOpportunitySymbols: string[] }> => runAutomatedScalpingAnalysis();

export const getScalpingOpportunities = async (): Promise<ScalpingCache | null> => {
  if (scalpingCacheMem) return scalpingCacheMem;
  try {
    const response = await appApiFetch<any>('/scalping/latest', { method: 'GET' });
    const data = unwrap<any>(response);
    scalpingCacheMem = data?.data ? data : { data: Array.isArray(data) ? data : [], timestamp: Date.now() };
    return scalpingCacheMem;
  } catch { return null; }
};

export const getMarketSummary = async (): Promise<string> => {
  try {
    const response = await appApiFetch<any>('/market-summary/latest', { method: 'GET' });
    const data = unwrap<any>(response);
    return typeof data === 'string' ? data : String(data?.summary ?? data?.content ?? data?.text ?? '');
  } catch { return ''; }
};

export const getMostTradedStocks = async (): Promise<MostTradedStock[]> => {
  try {
    const response = await appApiFetch<any>('/most-traded', { method: 'GET' });
    const data = unwrap<any>(response);
    return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  } catch { return []; }
};

export const getTopIndustryGroups = async (): Promise<TopIndustryGroup[]> => [];
export const getRealMoneyInflow = async (): Promise<MoneyFlowStock[]> => [];
export const getRealMoneyOutflow = async (): Promise<MoneyFlowStock[]> => [];

export const getMarketIndexData = async (): Promise<MarketIndexData | null> => {
  if (marketIndexCacheMem) return marketIndexCacheMem;
  try {
    const response = await appApiFetch<any>('/data/market-index/latest', { method: 'GET' });
    const data = unwrap<any>(response);
    if (!data) return null;
    marketIndexCacheMem = data as MarketIndexData;
    return marketIndexCacheMem;
  } catch { return null; }
};

export const getFinalMarketIndexData = async (): Promise<MarketIndexData | null> => getMarketIndexData();
export const updateMarketIndex = async (): Promise<MarketIndexData | null> => { marketIndexCacheMem = null; return getMarketIndexData(); };
export const testAnalyzeStock = async (symbol = 'فملی'): Promise<AnalysisResult> => analyzeStock(symbol, 10, 5);
