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

function extractSymbol(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (input && typeof input === 'object') {
    const item: any = input;
    return String(item.symbol ?? item.stockSymbol ?? item.ticker ?? item.stock?.symbol ?? item.data?.symbol ?? '').trim();
  }
  return '';
}

function normalizeAnalysis(raw: any, symbol: string): AnalysisResult {
  const data = raw && typeof raw === 'object' ? raw : {};
  const recommendationRaw = String(data.recommendation ?? '').toUpperCase();
  const recommendation = recommendationRaw.includes('BUY') || recommendationRaw.includes('خرید') ? 'BUY' : recommendationRaw.includes('SELL') || recommendationRaw.includes('فروش') ? 'SELL' : 'HOLD';
  return { ...data, symbol, recommendation, currentPrice: Number(data.currentPrice ?? data.closingPrice ?? data.marketData?.lastClosePrice ?? 0), analysisDate: data.analysisDate || new Date().toISOString() } as AnalysisResult;
}

export const analyzeStock = async (
  symbolOrItem: string | PortfolioItem | { symbol?: string; stockSymbol?: string; ticker?: string },
  dailyCount = 30,
  weeklyCount = 24,
  featureKey: FeatureKey = 'analysis'
): Promise<AnalysisResult> => {
  const normalizedSymbol = extractSymbol(symbolOrItem);
  if (!normalizedSymbol) throw new Error('نماد سهم برای تحلیل مشخص نیست. لطفاً اطلاعات سهم را بررسی کنید.');

  const response = await appApiFetch<any>('/analyze/stock', {
    method: 'POST',
    body: JSON.stringify({ symbol: normalizedSymbol, dailyCount, weeklyCount, analysisType: featureKey, featureKey }),
  });
  return normalizeAnalysis(unwrap(response), normalizedSymbol);
};

export const getPortfolioOptimization = async (portfolio: PortfolioItem[], analyses: (AnalysisResult | undefined)[]): Promise<PortfolioOptimizationResult> => {
  if (!Array.isArray(portfolio) || portfolio.length === 0) throw new Error('سبد سرمایه‌گذاری خالی است.');
  const context = portfolio.map((item, index) => ({
    symbol: extractSymbol(item),
    name: (item as any).name || extractSymbol(item),
    quantity: item.quantity,
    entryPrice: (item as any).entryPrice ?? (item as any).buyPrice ?? 0,
    purchaseDate: (item as any).entryDate ?? (item as any).purchaseDate ?? null,
    recommendation: analyses[index]?.recommendation || 'نامشخص',
    riskLevel: analyses[index]?.riskLevel || 'متوسط',
    currentPrice: analyses[index]?.currentPrice || 0,
    confidence: analyses[index]?.confidence || 0,
    summary: analyses[index]?.summary || '',
  }));
  if (context.some(item => !item.symbol)) throw new Error('یکی از سهم‌های سبد نماد معتبر ندارد.');

  // Aggregate duplicate holdings by symbol. This is calculated from the user's
  // actual lots and the current price returned by the stock analysis; no AI
  // generated number is used for the portfolio accounting section.
  const grouped = new Map<string, {
    symbol: string;
    name: string;
    totalQuantity: number;
    totalCost: number;
    currentPrice: number;
  }>();

  context.forEach((item, index) => {
    const symbol = item.symbol.trim().toUpperCase();
    const quantity = Number(item.quantity) || 0;
    const entryPrice = Number(item.entryPrice) || 0;
    const currentPrice = Number(analyses[index]?.currentPrice ?? item.currentPrice) || 0;
    const existing = grouped.get(symbol);
    if (existing) {
      existing.totalQuantity += quantity;
      existing.totalCost += entryPrice * quantity;
      if (currentPrice > 0) existing.currentPrice = currentPrice;
    } else {
      grouped.set(symbol, {
        symbol,
        name: item.name,
        totalQuantity: quantity,
        totalCost: entryPrice * quantity,
        currentPrice,
      });
    }
  });

  const holdingsSummary = Array.from(grouped.values()).map(item => {
    const averageEntryPrice = item.totalQuantity > 0 ? item.totalCost / item.totalQuantity : 0;
    const currentValue = item.currentPrice * item.totalQuantity;
    const pnl = currentValue - item.totalCost;
    const pnlPercent = item.totalCost > 0 ? (pnl / item.totalCost) * 100 : 0;
    return {
      symbol: item.symbol,
      name: item.name,
      totalQuantity: item.totalQuantity,
      averageEntryPrice,
      totalCost: item.totalCost,
      currentPrice: item.currentPrice,
      currentValue,
      pnl,
      pnlPercent,
    };
  });

  const formatMoney = (value: number) => Math.round(value || 0).toLocaleString('fa-IR');
  const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  const portfolioAccountingSection = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'خلاصه تجمیعی نمادهای همنام در سبد',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ...holdingsSummary.map(item => [
      `نماد: ${item.symbol}${item.name ? ` | ${item.name}` : ''}`,
      `تعداد کل: ${formatMoney(item.totalQuantity)} سهم | میانگین قیمت خرید: ${formatMoney(item.averageEntryPrice)} ریال`,
      `قیمت فعلی: ${formatMoney(item.currentPrice)} ریال | ارزش فعلی: ${formatMoney(item.currentValue)} ریال`,
      `مبلغ سود/زیان: ${item.pnl >= 0 ? '+' : ''}${formatMoney(item.pnl)} ریال | درصد سود/زیان: ${formatPercent(item.pnlPercent)}`,
      '────────────────────────────',
    ].join('\n')),
  ].join('\n');

  const prompt = ['سبد سرمایه‌گذاری کاربر را به صورت حرفه‌ای تحلیل و بهینه‌سازی کن.','فقط بر اساس داده‌های زیر تصمیم بگیر و عدد یا قیمت فرضی نساز.','برای هر سهم اقدام خرید، فروش یا نگهداری و دلیل ارائه کن.','خروجی فقط JSON معتبر باشد با ساختار: summary, riskScore, diversificationScore, recommendations.',JSON.stringify(context, null, 2)].join('\n\n');
  const response = await appApiFetch<any>('/analyze', { method: 'POST', body: JSON.stringify({ prompt, analysisType: 'portfolio', featureKey: 'portfolio' }) });
  const result = unwrap<any>(response);
  if (!result || typeof result !== 'object') throw new Error('پاسخ معتبر از سرویس بهینه‌سازی سبد دریافت نشد.');
  const data = result?.data && typeof result.data === 'object' ? result.data : result;
  const aiSummary = data.summary || data.content || 'تحلیل سبد دریافت شد.';

  return {
    summary: `${portfolioAccountingSection}\n\n${aiSummary}`,
    riskScore: Number(data.riskScore ?? data.risk_score ?? 50),
    diversificationScore: Number(data.diversificationScore ?? data.diversification_score ?? 50),
    recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
    holdingsSummary,
  } as PortfolioOptimizationResult;
};

export const compareStocks = async (symbol1: string, symbol2: string, settings: { dailyCount: number; weeklyCount: number }): Promise<StockComparisonResult> => {
  const response = await appApiFetch<any>('/analyze/compare', { method: 'POST', body: JSON.stringify({ symbols: [symbol1, symbol2], dailyCount: settings.dailyCount, weeklyCount: settings.weeklyCount }) });
  return unwrap<StockComparisonResult>(response);
};

export const runAutomatedScalpingAnalysis = async (): Promise<{ newOpportunitySymbols: string[] }> => {
  try { const response = await appApiFetch<any>('/scalping/run', { method: 'POST' }); const data = unwrap<any>(response); const opportunities = Array.isArray(data?.opportunities) ? data.opportunities : []; scalpingCacheMem = { data: opportunities as ScalpingOpportunity[], timestamp: Date.now() }; return { newOpportunitySymbols: opportunities.map((x: any) => x.symbol).filter(Boolean) }; }
  catch (error) { console.error('[Scalping] automated analysis failed:', error); return { newOpportunitySymbols: [] }; }
};
export const runAutomatedScalping = async (): Promise<{ newOpportunitySymbols: string[] }> => runAutomatedScalpingAnalysis();
export const getScalpingOpportunities = async (): Promise<ScalpingCache | null> => { if (scalpingCacheMem) return scalpingCacheMem; try { const response = await appApiFetch<any>('/scalping/latest', { method: 'GET' }); const data = unwrap<any>(response); scalpingCacheMem = data?.data ? data : { data: Array.isArray(data) ? data : [], timestamp: Date.now() }; return scalpingCacheMem; } catch { return null; } };
export const getMarketSummary = async (): Promise<string> => { try { const response = await appApiFetch<any>('/market-summary/latest', { method: 'GET' }); const data = unwrap<any>(response); return typeof data === 'string' ? data : String(data?.summary ?? data?.content ?? data?.text ?? ''); } catch { return ''; } };
export const getMostTradedStocks = async (): Promise<MostTradedStock[]> => { try { const response = await appApiFetch<any>('/most-traded', { method: 'GET' }); const data = unwrap<any>(response); return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []; } catch { return []; } };
export const getTopIndustryGroups = async (): Promise<TopIndustryGroup[]> => [];
export const getRealMoneyInflow = async (): Promise<MoneyFlowStock[]> => [];
export const getRealMoneyOutflow = async (): Promise<MoneyFlowStock[]> => [];
export const getMarketIndexData = async (): Promise<MarketIndexData | null> => { if (marketIndexCacheMem) return marketIndexCacheMem; try { const response = await appApiFetch<any>('/data/market-index/latest', { method: 'GET' }); const data = unwrap<any>(response); if (!data) return null; marketIndexCacheMem = data as MarketIndexData; return marketIndexCacheMem; } catch { return null; } };
export const getFinalMarketIndexData = async (): Promise<MarketIndexData | null> => getMarketIndexData();
export const updateMarketIndex = async (): Promise<MarketIndexData | null> => { marketIndexCacheMem = null; return getMarketIndexData(); };
export const testAnalyzeStock = async (symbol = 'فملی'): Promise<AnalysisResult> => analyzeStock(symbol, 10, 5);