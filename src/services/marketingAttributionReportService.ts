import { get } from './apiClient';

export interface MarketingAttributionRegistration {
  userId: number | string;
  registeredAt: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
}
export interface MarketingAttributionChannelReport {
  visits: number;
  visitCount: number;
  registrationCount: number;
  conversionRatePercent: number;
  paidPurchaseCount: number;
  revenueAmount: number;
  currency: string;
  recentRegistrations: MarketingAttributionRegistration[];
  recentPurchases: Array<{ paymentId: string; userId: number | string; planId: number | null; amount: number; currency: string; refId: string | null; paidAt: string; content: string }>;
}
export interface MarketingAttributionReport {
  generatedAt: string;
  channels: Record<'bursebazaar' | 'arzonlineinfo', MarketingAttributionChannelReport>;
}
export async function getMarketingAttributionReport(): Promise<MarketingAttributionReport> {
  const response = await get<MarketingAttributionReport>('/marketing-attribution/report');
  if (!response.success || !response.data) throw new Error(response.message || 'دریافت گزارش تبلیغات ناموفق بود.');
  return response.data;
}
