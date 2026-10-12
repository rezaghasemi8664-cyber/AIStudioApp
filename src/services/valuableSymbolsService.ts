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
  marketDataAgeMinutes?: number;
  marketStatus?: 'OPEN' | 'CLOSED';
  evaluatedAt: string;
}

export interface ValuableSymbolsResponse {
  signals: ValuableSymbol[];
  lastEvaluatedAt: string | null;
  stale: boolean;
  marketStatus: 'OPEN' | 'CLOSED';
}

export const valuableSymbolsService = {
  async getSignals(): Promise<ValuableSymbolsResponse> {
    const response = await apiClient.get('/valuable-symbols/signals', {
      headers: { 'Cache-Control': 'no-cache' },
      params: { t: Date.now() }
    });
    const envelope: any = response && response.data && typeof response.data === 'object'
      ? response.data
      : response;
    const nested: any = envelope?.result && typeof envelope.result === 'object'
      ? envelope.result
      : envelope;
    const rawRows = Array.isArray(nested?.data) ? nested.data
      : Array.isArray(nested?.signals) ? nested.signals
      : Array.isArray(nested?.items) ? nested.items
      : Array.isArray(nested?.results) ? nested.results
      : Array.isArray(nested) ? nested
      : [];
    const meta = nested?.meta && typeof nested.meta === 'object'
      ? nested.meta
      : envelope?.meta && typeof envelope.meta === 'object' ? envelope.meta : {};
    return {
      signals: rawRows.filter((row: any) =>
        row && typeof row.symbol === 'string' &&
        Number.isFinite(Number(row.currentPrice)) &&
        Number.isFinite(Number(row.entryPrice)) &&
        Number.isFinite(Number(row.targetPrice)) &&
        Number.isFinite(Number(row.stopLoss))
      ),
      lastEvaluatedAt: typeof meta.lastEvaluatedAt === 'string' ? meta.lastEvaluatedAt : null,
      stale: Boolean(meta.stale),
      marketStatus: meta.marketStatus === 'OPEN' ? 'OPEN' : 'CLOSED'
    };
  }
};
