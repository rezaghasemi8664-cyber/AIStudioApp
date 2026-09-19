export type WatchlistAlertMetric =
  | 'lastPrice'
  | 'lastChangePercent'
  | 'volume'
  | 'closePrice'
  | 'closeChangePercent';

export type WatchlistAlertOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
export type WatchlistAlertStatus = 'armed' | 'triggered' | 'disabled';
export type WatchlistAlertLogic = 'AND' | 'OR';

export interface WatchlistAlertCondition {
  metric: WatchlistAlertMetric;
  operator: WatchlistAlertOperator;
  threshold: number;
}

export interface WatchlistAlertRule {
  id: string;
  symbol: string;
  metric: WatchlistAlertMetric;
  operator: WatchlistAlertOperator;
  threshold: number;
  conditions?: WatchlistAlertCondition[];
  logic?: WatchlistAlertLogic;
  status: WatchlistAlertStatus;
  createdAt: string;
  updatedAt: string;
  triggeredAt?: string | null;
  note?: string | null;
}

export interface WatchlistAlertSnapshot {
  symbol: string;
  metric: WatchlistAlertMetric;
  value: number | null;
  capturedAt: string;
}

export const WATCHLIST_ALERT_METRICS: ReadonlyArray<{ value: WatchlistAlertMetric; label: string }> = [
  { value: 'lastPrice', label: 'قیمت لحظه‌ای' },
  { value: 'lastChangePercent', label: 'درصد تغییر لحظه‌ای' },
  { value: 'volume', label: 'حجم معامله' },
  { value: 'closePrice', label: 'قیمت پایانی' },
  { value: 'closeChangePercent', label: 'درصد تغییر پایانی' },
];

export const WATCHLIST_ALERT_OPERATORS: ReadonlyArray<{ value: WatchlistAlertOperator; label: string }> = [
  { value: 'gt', label: 'بزرگ‌تر از' },
  { value: 'gte', label: 'بزرگ‌تر یا مساوی' },
  { value: 'lt', label: 'کوچک‌تر از' },
  { value: 'lte', label: 'کوچک‌تر یا مساوی' },
  { value: 'eq', label: 'برابر با' },
];

export function evaluateWatchlistAlert(value: number | null | undefined, operator: WatchlistAlertOperator, threshold: number): boolean {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(threshold)) return false;
  switch (operator) {
    case 'gt': return value > threshold;
    case 'gte': return value >= threshold;
    case 'lt': return value < threshold;
    case 'lte': return value <= threshold;
    case 'eq': return value === threshold;
    default: return false;
  }
}
