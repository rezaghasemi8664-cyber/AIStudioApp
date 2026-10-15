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
  clickCount: number;
  registrationCount: number;
  conversionRatePercent: number;
  paidPurchaseCount: number;
  revenueAmount: number;
  currency: string;
  recentRegistrations: MarketingAttributionRegistration[];
  recentClicks: Array<{ id: string; clickedAt: string; source: string; medium: string; campaign: string; content: string }>;
  recentPurchases: Array<{ paymentId: string; userId: number | string; planId: number | null; amount: number; currency: string; refId: string | null; paidAt: string; content: string }>;
}
export interface MarketingAttributionReport {
  generatedAt: string;
  channels: Record<'bursebazaar' | 'arzonlineinfo' | 'roniya', MarketingAttributionChannelReport>;
}
export async function getMarketingAttributionReport(): Promise<MarketingAttributionReport> {
  const response = await get<MarketingAttributionReport>('/marketing-attribution/report');
  if (!response.success || !response.data) throw new Error(response.message || 'دریافت گزارش تبلیغات ناموفق بود.');
  return response.data;
}
