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

export async function getSummary(): Promise<AdminReportsSummary> {
  const response = await api.get('/admin-control/reports/summary');
  const data = response?.data?.data ?? response?.data;
  if (!data) throw new Error(response?.data?.message || 'دریافت گزارش مدیریتی ناموفق بود.');
  return data;
}

export default { getSummary };
