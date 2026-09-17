import api from '../api/apiClient';

export interface CodalFinancialMetrics {
  revenue?: number;
  netProfit?: number;
  eps?: number;
  assets?: number;
  liabilities?: number;
  cash?: number;
  salesVolume?: number;
  revenueGrowthPercent?: number;
  netProfitGrowthPercent?: number;
}

export interface CodalReport {
  title: string;
  symbol: string;
  companyName: string;
  reportType: string;
  category: string;
  publishDate: string;
  period: string;
  periodEnd: string;
  url: string;
  audited: boolean;
  attachment: boolean;
  financialMetrics: CodalFinancialMetrics;
}

export interface CodalSummary {
  reports: number;
  audited: number;
  attachments: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  metricReports: number;
}

export interface CodalReportsResult {
  items: CodalReport[];
  summary: CodalSummary;
  fetchedAt: string;
  source: string;
  configured: boolean;
}

export async function getCodalReports(params: {
  symbol?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<CodalReportsResult> {
  const response = await api.get('/codal-intelligence/reports', { params });
  const data = response?.data?.data ?? response?.data;
  if (!data || !Array.isArray(data.items)) throw new Error('پاسخ اطلاعیه‌های کدال معتبر نیست.');
  return data as CodalReportsResult;
}
