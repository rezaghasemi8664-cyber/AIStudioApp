import api from '../api/apiClient';
import type { PortfolioItem } from '../types';

export interface PortfolioApiItem extends PortfolioItem { name?: string; currentPrice?: number | null; dataStatus?: 'LIVE' | 'CACHED' | 'UNAVAILABLE'; source?: string | null; fetchedAt?: string | null; stale?: boolean; }
export interface PortfolioLot extends PortfolioApiItem { availableQuantity: number; }
export interface SoldTradeAllocation { lotId: string; quantity: number; buyPrice: number; buyDate: string; costBasis: number; holdingDays: number | null; }
export interface SoldTrade { id: string; symbol: string; name?: string; soldQuantity: number; sellPrice: number; sellDate: string; allocationMethod: 'MANUAL'; allocations: SoldTradeAllocation[]; proceeds: number; costBasis: number; realizedPnl: number; realizedPnlPercent: number; createdAt: string; }
export interface SoldTradesResult { trades: SoldTrade[]; realizedPnl: number; proceeds: number; costBasis: number; }

type ApiPortfolioItem = { id: string | number; symbol?: string; stockSymbol?: string; ticker?: string; name?: string; quantity: number; buyPrice: number; entryDate: string; currentPrice?: number | null; dataStatus?: 'LIVE' | 'CACHED' | 'UNAVAILABLE'; source?: string | null; fetchedAt?: string | null; stale?: boolean; };
function resolveSymbol(item: { symbol?: string; stockSymbol?: string; ticker?: string }): string { return String(item.symbol ?? item.stockSymbol ?? item.ticker ?? '').trim().toUpperCase(); }
function normalize(item: ApiPortfolioItem): PortfolioApiItem { const symbol = resolveSymbol(item); return { id: String(item.id), symbol, name: item.name || symbol, quantity: Number(item.quantity), entryPrice: Number(item.buyPrice), entryDate: item.entryDate, currentPrice: item.currentPrice == null ? null : Number(item.currentPrice), dataStatus: item.dataStatus, source: item.source, fetchedAt: item.fetchedAt, stale: item.stale === true }; }
function unwrap<T>(response: any): T { return (response?.data?.data ?? response?.data ?? response) as T; }

export async function getPortfolio(): Promise<PortfolioApiItem[]> {
  const response = await api.get('/portfolio');
  const data = unwrap<{ items?: ApiPortfolioItem[] }>(response);
  return Array.isArray(data?.items) ? data.items.map(normalize).filter(item => Boolean(item.symbol)) : [];
}

export async function refreshPortfolioQuotes(): Promise<PortfolioApiItem[]> {
  const response = await api.get('/portfolio/quotes', { timeout: 12000 });
  const data = unwrap<{ items?: ApiPortfolioItem[] }>(response);
  return Array.isArray(data?.items) ? data.items.map(normalize).filter(item => Boolean(item.symbol)) : [];
}

export async function addPortfolioItem(item: Omit<PortfolioApiItem, 'id'>): Promise<PortfolioApiItem> {
  const symbol = resolveSymbol(item);
  if (!symbol) throw new Error('نماد سهم برای ذخیره مشخص نشده است.');
  const response = await api.post('/portfolio', { symbol, name: item.name || symbol, quantity: item.quantity, buyPrice: item.entryPrice, entryDate: item.entryDate });
  return normalize(unwrap<ApiPortfolioItem>(response));
}

export async function updatePortfolioItem(id: string, item: Partial<Omit<PortfolioApiItem, 'id'>>): Promise<PortfolioApiItem> {
  const symbol = item.symbol !== undefined ? resolveSymbol(item) : undefined;
  const response = await api.put(`/portfolio/${encodeURIComponent(id)}`, { ...(symbol !== undefined ? { symbol } : {}), ...(item.name !== undefined ? { name: item.name } : {}), ...(item.quantity !== undefined ? { quantity: item.quantity } : {}), ...(item.entryPrice !== undefined ? { buyPrice: item.entryPrice } : {}), ...(item.entryDate !== undefined ? { entryDate: item.entryDate } : {}) });
  return normalize(unwrap<ApiPortfolioItem>(response));
}

export async function deletePortfolioItem(id: string): Promise<void> { await api.delete(`/portfolio/${encodeURIComponent(id)}`); }

export async function getSoldTrades(): Promise<SoldTradesResult> {
  const response = await api.get('/portfolio/trades');
  return unwrap<SoldTradesResult>(response);
}

export async function recordSale(input: {
  symbol: string;
  name?: string;
  soldQuantity: number;
  sellPrice: number;
  sellDate: string;
  allocations: Array<{ lotId: string; quantity: number }>;
}): Promise<SoldTrade> {
  const response = await api.post('/portfolio/sales', { ...input, allocationMethod: 'MANUAL' });
  return unwrap<SoldTrade>(response);
}

export async function deleteSoldTrade(id: string): Promise<void> { await api.delete(`/portfolio/sales/${encodeURIComponent(id)}`); }
