import api from '../api/apiClient';
import type { PortfolioItem } from '../types';

export interface PortfolioApiItem extends PortfolioItem {
  name?: string;
}

type ApiPortfolioItem = {
  id: string | number;
  symbol: string;
  name?: string;
  quantity: number;
  buyPrice: number;
  entryDate: string;
};

function normalize(item: ApiPortfolioItem): PortfolioApiItem {
  return {
    id: String(item.id),
    symbol: item.symbol,
    name: item.name || item.symbol,
    quantity: Number(item.quantity),
    entryPrice: Number(item.buyPrice),
    entryDate: item.entryDate,
  };
}

function unwrap<T>(response: any): T {
  return (response?.data?.data ?? response?.data ?? response) as T;
}

export async function getPortfolio(): Promise<PortfolioApiItem[]> {
  const response = await api.get('/portfolio');
  const data = unwrap<{ items?: ApiPortfolioItem[] }>(response);
  return Array.isArray(data?.items) ? data.items.map(normalize) : [];
}

export async function addPortfolioItem(item: Omit<PortfolioApiItem, 'id'>): Promise<PortfolioApiItem> {
  const response = await api.post('/portfolio', {
    symbol: item.symbol,
    name: item.name || item.symbol,
    quantity: item.quantity,
    buyPrice: item.entryPrice,
    entryDate: item.entryDate,
  });
  return normalize(unwrap<ApiPortfolioItem>(response));
}

export async function updatePortfolioItem(id: string, item: Partial<Omit<PortfolioApiItem, 'id'>>): Promise<PortfolioApiItem> {
  const response = await api.put(`/portfolio/${encodeURIComponent(id)}`, {
    ...(item.symbol !== undefined ? { symbol: item.symbol } : {}),
    ...(item.name !== undefined ? { name: item.name } : {}),
    ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
    ...(item.entryPrice !== undefined ? { buyPrice: item.entryPrice } : {}),
    ...(item.entryDate !== undefined ? { entryDate: item.entryDate } : {}),
  });
  return normalize(unwrap<ApiPortfolioItem>(response));
}

export async function deletePortfolioItem(id: string): Promise<void> {
  await api.delete(`/portfolio/${encodeURIComponent(id)}`);
}
