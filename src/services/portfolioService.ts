import api from '../api/apiClient';
import type { PortfolioItem } from '../types';

export interface PortfolioApiItem extends PortfolioItem { name?: string; }

type ApiPortfolioItem = { id: string | number; symbol?: string; stockSymbol?: string; ticker?: string; name?: string; quantity: number; buyPrice: number; entryDate: string; };

function resolveSymbol(item: ApiPortfolioItem): string {
  return String(item.symbol ?? item.stockSymbol ?? item.ticker ?? '').trim().toUpperCase();
}

function normalize(item: ApiPortfolioItem): PortfolioApiItem {
  const symbol = resolveSymbol(item);
  return { id: String(item.id), symbol, name: item.name || symbol, quantity: Number(item.quantity), entryPrice: Number(item.buyPrice), entryDate: item.entryDate };
}

function unwrap<T>(response: any): T { return (response?.data?.data ?? response?.data ?? response) as T; }

export async function getPortfolio(): Promise<PortfolioApiItem[]> {
  const response = await api.get('/portfolio');
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
  const symbol = item.symbol !== undefined ? resolveSymbol(item as ApiPortfolioItem) : undefined;
  const response = await api.put(`/portfolio/${encodeURIComponent(id)}`, {
    ...(symbol !== undefined ? { symbol } : {}),
    ...(item.name !== undefined ? { name: item.name } : {}),
    ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
    ...(item.entryPrice !== undefined ? { buyPrice: item.entryPrice } : {}),
    ...(item.entryDate !== undefined ? { entryDate: item.entryDate } : {}),
  });
  return normalize(unwrap<ApiPortfolioItem>(response));
}

export async function deletePortfolioItem(id: string): Promise<void> { await api.delete(`/portfolio/${encodeURIComponent(id)}`); }
