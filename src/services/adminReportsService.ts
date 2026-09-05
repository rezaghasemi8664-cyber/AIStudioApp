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

export async function getSummary(): Promise<AdminReportsSummary> {
  const response = await api.get('/admin-control/reports/summary');
  const data = response?.data?.data ?? response?.data;
  if (!data) throw new Error(response?.data?.message || 'دریافت گزارش مدیریتی ناموفق بود.');
  return data;
}

export async function getTrends(days: 7 | 30 = 7): Promise<AdminReportsTrends> {
  const response = await api.get('/admin-control/reports/trends', { params: { days } });
  const data = response?.data?.data ?? response?.data;
  if (!data) throw new Error(response?.data?.message || 'دریافت روند گزارش مدیریتی ناموفق بود.');
  return data;
}

export default { getSummary, getTrends };
