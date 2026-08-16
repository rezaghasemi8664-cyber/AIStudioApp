import type { MarketSummaryHistoryItem } from '../types';
import { appApiFetch } from './apiConfigService';

/**
 * ?????? ??????? ????? ????? ?? ??????
 * GET /market-summary/history
 */
export const getMarketHistory = async (): Promise<MarketSummaryHistoryItem[]> => {
  try {
    const data = await appApiFetch<MarketSummaryHistoryItem[]>('/market-summary/history', {
      method: 'GET',
    });

    if (!Array.isArray(data)) return [];

    return [...data].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  } catch (error) {
    console.error('Failed to fetch market analysis history', error);
    return [];
  }
};

/**
 * ??? ?? ???? ??????? ?? ???? id
 * DELETE /market-summary/history/:id
 */
export const deleteMarketHistoryItem = async (id: string): Promise<MarketSummaryHistoryItem[]> => {
  try {
    await appApiFetch(`/market-summary/history/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error('Failed to delete market history item', error);
  }

  // ???? ????? ????? = ????
  return getMarketHistory();
};

