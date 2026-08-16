// src/services/gapgptService.ts
// Version: 13.0 - Backend-First + Cookie Auth + Build-Safe Regex

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

/* ==============================
   ?? GapGPT Configuration
============================== */
const GAPGPT_API_URL = 'https://api.gapapi.com/v1/chat/completions';
const GAPGPT_API_KEY = import.meta.env.VITE_GAPGPT_API_KEY;

const APP_BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:3001';

type GapGPTModel = 'gpt-4.1-mini' | 'gpt-4.1-nano';

/* ==============================
   ?? In-memory cache (ephemeral)
============================== */
let scalpingCacheMem: ScalpingCache | null = null;
let marketIndexCacheMem: MarketIndexData | null = null;

/* ==============================
   ?? Regex / JSON Helpers
============================== */
const CODE_BLOCK_REGEX = new RegExp("`{3}(?:json)?\\s*([\\s\\S]*?)\\s*`{3}", "i");


function extractJsonFromResponse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  try {
    const codeBlockMatch = text.match(CODE_BLOCK_REGEX);
    if (codeBlockMatch?.[1]) {
      return JSON.parse(codeBlockMatch[1].trim());
    }
  } catch {
    // continue
  }

  try {
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      return JSON.parse(text.substring(startIndex, endIndex + 1));
    }
  } catch {
    // continue
  }

  try {
    const startIndex = text.indexOf('[');
    const endIndex = text.lastIndexOf(']');
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      return JSON.parse(text.substring(startIndex, endIndex + 1));
    }
  } catch {
    // all failed
  }

  return null;
}

/* ==============================
   ?? Feature API Keys from Backend
============================== */
async function getApiKeysForFeature(featureKey: FeatureKey): Promise<string[]> {
  try {
    const data = await appApiFetch<any>(
      `/user-preference/feature-endpoints?feature=${encodeURIComponent(featureKey)}`,
      { method: 'GET' }
    );

    if (Array.isArray(data)) {
      return data.filter((k) => typeof k === 'string' && k.trim().length > 0);
    }

    if (Array.isArray(data?.keys)) {
      return data.keys.filter((k: any) => typeof k === 'string' && k.trim().length > 0);
    }

    if (Array.isArray(data?.apiKeyNames)) {
      return data.apiKeyNames.filter((k: any) => typeof k === 'string' && k.trim().length > 0);
    }

    return [];
  } catch (err) {
    console.warn('[gapgptService] Failed to load feature API keys from backend:', err);
    return [];
  }
}

/* ==============================
   ?? GapGPT API Call (Base)
============================== */
async function callGapGPT(
  prompt: string,
  model: GapGPTModel = 'gpt-4.1-mini',
  systemPrompt = '??? ?? ??????? ??????? ????? ?????? ????? ?????. ??????? ?? ???? ? ????? ?? ???? ????? ????? ????.',
  temperature = 0.3,
  maxTokens = 4000
): Promise<string> {
  if (!GAPGPT_API_KEY) {
    throw new Error('???? API GapGPT ????? ???? ??? (VITE_GAPGPT_API_KEY)');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(GAPGPT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GAPGPT_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GapGPT_HTTP_${response.status}: ${errorText.slice(0, 200)}`);
    }

    const json = await response.json();
    return json.choices?.[0]?.message?.content || '????? ?????? ???';
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error?.name === 'AbortError') {
      throw new Error('GapGPT_TIMEOUT: ??????? ?? ?? 45 ????? ??? ??');
    }
    throw error;
  }
}

/* ==============================
   ?? GapGPT with Retry & Fallback
============================== */
async function callGapGPTWithRetry(
  prompt: string,
  model: GapGPTModel = 'gpt-4.1-mini',
  systemPrompt?: string,
  temperature = 0.3,
  maxTokens = 4000,
  maxAttempts = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callGapGPT(prompt, model, systemPrompt, temperature, maxTokens);
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      console.warn(`?? GapGPT attempt ${attempt}/${maxAttempts} [${model}]:`, msg.slice(0, 100));

      if (msg.includes('429')) {
        await new Promise((r) => setTimeout(r, attempt * 3000));
        continue;
      }

      if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      if (msg.includes('TIMEOUT') && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      break;
    }
  }

  if (model !== 'gpt-4.1-nano') {
    console.log('?? Fallback ? gpt-4.1-nano');
    try {
      return await callGapGPT(prompt, 'gpt-4.1-nano', systemPrompt, temperature, maxTokens);
    } catch (fallbackError: any) {
      console.error('? Fallback model failed:', fallbackError?.message?.slice(0, 100));
    }
  }

  throw lastError || new Error('???? ??????? ???? ???? ?? GapGPT ?????? ???');
}

/* ==============================
   ?? BRS Data Fetch Helper (Cookie-based)
============================== */
async function fetchStockDataFromBRS(
  symbol: string,
  apiKeyName: string,
  dailyCount = 30,
  weeklyCount = 24
): Promise<any> {
  try {
    const response = await fetch(`${APP_BACKEND_URL}/data/stock`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ symbol, apiKeyName, dailyCount, weeklyCount }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.warn(`?? BRS ${symbol} [${apiKeyName}]:`, error?.message || error);
    return { error: `??? ?? ?????? ???? ?? ${apiKeyName}`, symbol };
  }
}

/* ==============================
   ?? ????? ???? (????)
============================== */
export const analyzeStock = async (
  symbol: string,
  dailyCount = 30,
  weeklyCount = 24,
  featureKey: FeatureKey = 'analysis'
): Promise<AnalysisResult> => {
  console.log(`?? ???? ????? ${symbol} ?? GapGPT...`);

  const apiKeys = await getApiKeysForFeature(featureKey);
  if (apiKeys.length === 0) {
    throw new Error('??? API Key ????? ???? ??? ?????? ???? ???. ????? ?? ??????? ????/????? ????? ????.');
  }

  const rawResults = await Promise.all(
    apiKeys.slice(0, 3).map((apiKeyName) => fetchStockDataFromBRS(symbol, apiKeyName, dailyCount, weeklyCount))
  );

  const validResults = rawResults.filter((r) => !r.error);

  const prompt = `
????: **${symbol}**
?????: ${new Date().toLocaleDateString('fa-IR')}

???????? ??????? (${rawResults.length} ????):
${rawResults
  .map((r, i) =>
    r.error
      ? `? ???? ${i + 1}: ${r.error}`
      : `? ???? ${i + 1}: ${JSON.stringify(
          {
            currentPrice: r.currentPrice,
            changePercent: r.changePercent,
            dailyCount: r.priceHistory?.daily?.length,
            weeklyCount: r.priceHistory?.weekly?.length,
          },
          null,
          2
        )}`
  )
  .join('\n\n')}

JSON ?????:
{
  "summary": "????? ?????",
  "recommendation": "????|????|???????",
  "riskLevel": "??|?????|????",
  "shortTermTrend": "?????|?????|????",
  "mediumTermTrend": "?????|?????|????",
  "targets": {},
  "stopLoss": 0,
  "confidence": 0,
  "sentiment": "????|????|????"
}
`;

  const responseText = await callGapGPTWithRetry(prompt, 'gpt-4.1-mini');
  const parsed = extractJsonFromResponse(responseText);

  const analysis: AnalysisResult = parsed || {
    summary: responseText.slice(0, 500) + (responseText.length > 500 ? '...' : ''),
    recommendation: '???????',
    riskLevel: '?????',
    shortTermTrend: '????',
    mediumTermTrend: '????',
    targets: {},
    stopLoss: 0,
    confidence: 0,
    sentiment: '????',
    priceHistory: { daily: [], weekly: [] },
  };

  analysis.currentPrice = validResults[0]?.currentPrice || 0;
  analysis.changePercent = validResults[0]?.changePercent || 0;
  analysis.priceHistory = {
    daily: validResults.flatMap((r) => r.priceHistory?.daily || []),
    weekly: validResults.flatMap((r) => r.priceHistory?.weekly || []),
  };
  analysis.rawData = rawResults;
  analysis.symbol = symbol;
  analysis.analysisDate = new Date().toISOString();

  return analysis;
};

/* ==============================
   ? Scalping ?????
============================== */
export const runAutomatedScalpingAnalysis = async (): Promise<{ newOpportunitySymbols: string[] }> => {
  const apiKeys = await getApiKeysForFeature('scalping' as FeatureKey);
  const apiKeyName = apiKeys[0];
  if (!apiKeyName) return { newOpportunitySymbols: [] };

  try {
    const stocks = await appApiFetch<{ symbol: string; changePercent: number }[]>(
      '/data/all-symbols',
      { method: 'POST', body: JSON.stringify({ apiKeyName }) }
    );

    const prompt = `
???? 20 ??? ???? ???? Scalping:
${JSON.stringify(stocks.slice(0, 20), null, 2)}

JSON ?????:
[
  {"symbol": "????", "reason": "???? ??????", "entry": 2500, "exit": 2600}
]
`;

    const resultText = await callGapGPTWithRetry(prompt, 'gpt-4.1-nano', undefined, 0.2);
    const opportunities: ScalpingOpportunity[] = extractJsonFromResponse(resultText) || [];

    await appApiFetch('/scalping/save', {
      method: 'POST',
      body: JSON.stringify({ opportunities }),
    });

    const oldCache = scalpingCacheMem?.data || [];
    const newSymbols = opportunities
      .map((o) => o.symbol)
      .filter((s) => !oldCache.some((x) => x.symbol === s));

    scalpingCacheMem = {
      data: opportunities,
      timestamp: Date.now(),
    } as ScalpingCache;

    return { newOpportunitySymbols: newSymbols };
  } catch (error) {
    console.error('Scalping Analysis Error:', error);
    return { newOpportunitySymbols: [] };
  }
};

export const getScalpingOpportunities = async (): Promise<ScalpingCache | null> => {
  if (scalpingCacheMem) return scalpingCacheMem;

  try {
    const data = await appApiFetch<ScalpingCache>('/scalping/latest', { method: 'GET' });
    scalpingCacheMem = data;
    return data;
  } catch {
    return null;
  }
};

/* ==============================
   ?? ????? ?????
============================== */
export const getMarketSummary = async (): Promise<string> => {
  let dataText = '??????? ????? ?? ????? ????';

  try {
    const market = await getFinalMarketIndexData();
    if (market) dataText = JSON.stringify(market);
  } catch {
    // ignore
  }

  const prompt = `
????? ????? ????? ????? ?? ?? ???? ??????? ??? ?????:
${dataText}
???? ????? ? ???? (2-3 ????) ????? ???.
`;

  return callGapGPTWithRetry(prompt, 'gpt-4.1-nano');
};

/* ==============================
   ?? ?????????? ???
============================== */
export const getPortfolioOptimization = async (
  portfolio: PortfolioItem[],
  analyses: (AnalysisResult | undefined)[]
): Promise<PortfolioOptimizationResult> => {
  const context = portfolio.map((p, i) => ({
    symbol: p.symbol,
    quantity: p.quantity,
    recommendation: analyses[i]?.recommendation || '??????',
    value: p.quantity * (analyses[i]?.currentPrice || 0),
    summary: analyses[i]?.summary?.slice(0, 100),
  }));

  const prompt = `
?????????? ??? ?????:
${JSON.stringify(context, null, 2)}

JSON ?????:
{
  "summary": "...",
  "riskScore": 75,
  "recommendations": [{"symbol": "????", "action": "????", "reason": "..."}]
}
`;

  const responseText = await callGapGPTWithRetry(prompt, 'gpt-4.1-mini');
  const result = extractJsonFromResponse(responseText);

  if (!result) {
    return {
      summary: '????? ????????? ?? ????? ????',
      riskScore: 50,
      recommendations: [],
    };
  }

  return result;
};

/* ==============================
   ?? ?????? ????
============================== */
export const compareStocks = async (
  symbol1: string,
  symbol2: string,
  settings: { dailyCount: number; weeklyCount: number }
): Promise<StockComparisonResult> => {
  const [analysis1, analysis2] = await Promise.all([
    analyzeStock(symbol1, settings.dailyCount, settings.weeklyCount, 'stockComparison' as FeatureKey),
    analyzeStock(symbol2, settings.dailyCount, settings.weeklyCount, 'stockComparison' as FeatureKey),
  ]);

  const prompt = `
?????? **${symbol1}** ? **${symbol2}**:
${symbol1}: ?????=${analysis1.recommendation}, ????=${analysis1.riskLevel}, ???????=${analysis1.confidence}%
${symbol2}: ?????=${analysis2.recommendation}, ????=${analysis2.riskLevel}, ???????=${analysis2.confidence}%

JSON: {"winner":"${symbol1} ?? ${symbol2}","reason":"...","score1":85,"score2":72}
`;

  const responseText = await callGapGPTWithRetry(prompt, 'gpt-4.1-mini');
  const result = extractJsonFromResponse(responseText) || {
    winner: symbol1,
    reason: '????? ????????? ?? ????? ????',
    score1: 50,
    score2: 50,
  };

  return { symbol1_analysis: analysis1, symbol2_analysis: analysis2, ...result };
};

/* ==============================
   ?? Market Data Utilities
============================== */
export const getMostTradedStocks = async (): Promise<MostTradedStock[]> => {
  const apiKeys = await getApiKeysForFeature('marketIndex' as FeatureKey);
  const apiKeyName = apiKeys[0];
  if (!apiKeyName) return [];

  return appApiFetch('/data/most-traded', {
    method: 'POST',
    body: JSON.stringify({ apiKeyName }),
  });
};

export const getTopIndustryGroups = async (): Promise<TopIndustryGroup[]> => [];
export const getRealMoneyInflow = async (): Promise<MoneyFlowStock[]> => [];
export const getRealMoneyOutflow = async (): Promise<MoneyFlowStock[]> => [];

/* ==============================
   ?? Market Index Functions
============================== */
export const getMarketIndexData = async (): Promise<MarketIndexData | null> => {
  if (marketIndexCacheMem) return marketIndexCacheMem;

  try {
    const data = await appApiFetch<MarketIndexData>('/data/market-index/latest', { method: 'GET' });
    marketIndexCacheMem = data;
    return data;
  } catch {
    return null;
  }
};

export const getFinalMarketIndexData = async (): Promise<MarketIndexData | null> => {
  return getMarketIndexData();
};

export const updateMarketIndex = async (): Promise<MarketIndexData | null> => {
  try {
    const apiKeys = await getApiKeysForFeature('marketIndex' as FeatureKey);
    const apiKeyName = apiKeys[0];
    if (!apiKeyName) return null;

    const data = await appApiFetch<any>('/data/market-index', {
      method: 'POST',
      body: JSON.stringify({ apiKeyName }),
    });

    if (!data) return null;

    const marketData: MarketIndexData = {
      isMarketOpen:
        data.isMarketOpen ??
        (typeof data.marketState === 'string' ? data.marketState === 'open' : undefined) ??
        false,
      overallIndex: data.overallIndex ?? data.index ?? data.value ?? 0,
      overallIndexChange: data.overallIndexChange ?? data.indexChange ?? data.change ?? 0,
      equalWeightIndex: data.equalWeightIndex ?? data.ewi ?? 0,
      equalWeightIndexChange: data.equalWeightIndexChange ?? data.ewiChange ?? 0,
      marketValue: data.marketValue ?? data.totalValue ?? 0,
      tradeValue: data.tradeValue ?? data.totalTradeValue ?? 0,
      tradeVolume: data.tradeVolume ?? data.totalTradeVolume ?? 0,
      timestamp: data.timestamp ?? Date.now(),
      lastUpdate: new Date().toISOString(),
      ...(data.raw ? { raw: data.raw } : {}),
    };

    marketIndexCacheMem = marketData;
    return marketData;
  } catch (error: any) {
    console.error('[MarketIndex] Update failed:', error?.message || error);
    return marketIndexCacheMem;
  }
};

/* ==============================
   ?? Test & Alias Functions
============================== */
export const testAnalyzeStock = async (symbol = '?????'): Promise<AnalysisResult> => {
  return analyzeStock(symbol, 10, 5);
};

export const runAutomatedScalping = async (): Promise<{ newOpportunitySymbols: string[] }> => {
  return runAutomatedScalpingAnalysis();
};

