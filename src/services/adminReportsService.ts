import api from '../api/apiClient';

export interface AdminReportsSummary {
  generatedAt: string;
  users: { total: number; active: number; inactive: number };
  analyses: { total: number };
  notifications: { total: number };
  sessions: { total: number };
  apiKeys: { active: number };
  market: { history: number; daily: number; summaries: number };
  audit: { events: number };
  payments: { transactionCount: number; paidCount: number; pendingCount: number; paidIrr: number; paidIrt: number };
}

export interface AdminReportTrendPoint {
  day: string;
  label: string;
  users: number;
  analyses: number;
  sessions: number;
  paidIrr: number;
  paidIrt: number;
  paidIrrCount: number;
  paidIrtCount: number;
}

export interface AdminReportsTrends {
  days: 7 | 30;
  start: string;
  end: string;
  series: AdminReportTrendPoint[];
}

export interface AdminReportsInsights {
  days: 7 | 30;
  start: string;
  end: string;
  growth: { users: number; analyses: number; sessions: number };
  totals: { users: number; analyses: number; sessions: number };
  previous: { users: number; analyses: number; sessions: number };
  topUsers: { userId: number; username: string; analysisCount: number }[];
  topSymbols: { symbol: string; analysisCount: number }[];
}

async function unwrap<T>(response: any, fallback: string): Promise<T> {
  const data = response?.data?.data ?? response?.data;
  if (!data) throw new Error(response?.data?.message || fallback);
  return data as T;
}

export async function getSummary(): Promise<AdminReportsSummary> {
  return unwrap<AdminReportsSummary>(await api.get('/admin-control/reports/summary'), 'دریافت گزارش مدیریتی ناموفق بود.');
}

export async function getTrends(days: 7 | 30 = 7): Promise<AdminReportsTrends> {
  return unwrap<AdminReportsTrends>(await api.get('/admin-control/reports/trends', { params: { days } }), 'دریافت روند گزارش مدیریتی ناموفق بود.');
}

export async function getInsights(days: 7 | 30 = 7): Promise<AdminReportsInsights> {
  return unwrap<AdminReportsInsights>(await api.get('/admin-control/reports/insights', { params: { days } }), 'دریافت بینش گزارش مدیریتی ناموفق بود.');
}

export default { getSummary, getTrends, getInsights };
