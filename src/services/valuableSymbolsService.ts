import apiClient from '../api/apiClient';

export interface ValuableSymbol {
  symbol: string;
  name: string;
  sector?: string | null;
  score: number;
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  sma20: number;
  rsi14: number;
  support: number;
  resistance: number;
  fundamental: {
    score: number;
    eps: number | null;
    netProfit: number | null;
    revenue: number | null;
    reportTitle?: string | null;
    reportDate?: string | null;
    source: string;
  };
  marketUpdatedAt?: string | null;
  evaluatedAt: string;
}

export interface ValuableSymbolsResponse {
  signals: ValuableSymbol[];
  lastEvaluatedAt: string | null;
  stale: boolean;
}

export const valuableSymbolsService = {
  async getSignals(): Promise<ValuableSymbolsResponse> {
    const response = await apiClient.get('/valuable-symbols/signals', {
      headers: { 'Cache-Control': 'no-cache' },
      params: { t: Date.now() }
    });
    let payload: any = response;
    for (let i = 0; i < 5 && payload && typeof payload === 'object'; i += 1) {
      if (payload.data !== undefined && payload.data !== payload) {
        payload = payload.data;
        continue;
      }
      if (payload.result !== undefined && payload.result !== payload) {
        payload = payload.result;
        continue;
      }
      break;
    }
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    return {
      signals: rows.filter((row: any) =>
        row && typeof row.symbol === 'string' &&
        Number.isFinite(Number(row.currentPrice)) &&
        Number.isFinite(Number(row.entryPrice)) &&
        Number.isFinite(Number(row.targetPrice)) &&
        Number.isFinite(Number(row.stopLoss))
      ),
      lastEvaluatedAt: typeof payload?.meta?.lastEvaluatedAt === 'string'
        ? payload.meta.lastEvaluatedAt
        : null,
      stale: Boolean(payload?.meta?.stale)
    };
  }
};
