import api from '../api/apiClient';
import type { WatchlistAlertRule, WatchlistAlertStatus, WatchlistAlertMetric, WatchlistAlertOperator } from '../types/watchlistAlert';

function unwrap<T>(response: any): T {
  return (response?.data?.data ?? response?.data ?? response) as T;
}

const BASE_PATH = '/watchlist-alerts';

export interface CreateWatchlistAlertInput {
  symbol: string;
  metric: WatchlistAlertMetric;
  operator: WatchlistAlertOperator;
  threshold: number;
  note?: string;
  status?: WatchlistAlertStatus;
}

export interface WatchlistAlertHistoryItem {
  id: string;
  ruleId: string;
  symbol: string;
  metric: WatchlistAlertMetric;
  operator: WatchlistAlertOperator;
  threshold: number;
  value: number;
  triggeredAt: string;
  snapshot?: {
    symbol: string;
    lastPrice: number | null;
    lastChangePercent: number | null;
    volume: number | null;
    closePrice: number | null;
    closeChangePercent: number | null;
    metric: WatchlistAlertMetric;
    value: number;
    capturedAt: string;
  };
}

export async function getAlerts(): Promise<WatchlistAlertRule[]> {
  const response = await api.get(BASE_PATH);
  const data = unwrap<{ alerts?: WatchlistAlertRule[] }>(response);
  return Array.isArray(data?.alerts) ? data.alerts : [];
}

export async function getAlertHistory(): Promise<WatchlistAlertHistoryItem[]> {
  const response = await api.get(`${BASE_PATH}/history`);
  const data = unwrap<{ history?: WatchlistAlertHistoryItem[] }>(response);
  return Array.isArray(data?.history) ? data.history : [];
}

export async function createAlert(input: CreateWatchlistAlertInput): Promise<WatchlistAlertRule> {
  const response = await api.post(BASE_PATH, input);
  return unwrap<WatchlistAlertRule>(response);
}

export async function updateAlert(id: string, input: Partial<CreateWatchlistAlertInput>): Promise<WatchlistAlertRule> {
  const response = await api.put(`${BASE_PATH}/${encodeURIComponent(id)}`, input);
  return unwrap<WatchlistAlertRule>(response);
}

export async function deleteAlert(id: string): Promise<void> {
  await api.delete(`${BASE_PATH}/${encodeURIComponent(id)}`);
}

export async function evaluateAlerts(): Promise<{ triggered: number; evaluated: number }> {
  const response = await api.post(`${BASE_PATH}/evaluate`);
  return unwrap<{ triggered: number; evaluated: number }>(response);
}
