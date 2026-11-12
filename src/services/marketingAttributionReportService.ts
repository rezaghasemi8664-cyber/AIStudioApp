import { get, put } from './apiClient';

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
  landingPageViewCount: number;
  ctaClickCount: number;
  loginPageViewCount: number;
  signupClickCount: number;
  registrationCount: number;
  conversionRatePercent: number;
  paidPurchaseCount: number;
  revenueAmount: number;
  currency: string;
  recentRegistrations: MarketingAttributionRegistration[];
  recentClicks: Array<{ id: string; clickedAt: string; source: string; medium: string; campaign: string; content: string }>;
  recentLandingPageViews: Array<{ id: string; occurredAt: string; source: string; medium: string; campaign: string; content: string }>;
  recentCtaClicks: Array<{ id: string; occurredAt: string; source: string; medium: string; campaign: string; content: string }>;
  recentLoginPageViews: Array<{ id: string; occurredAt: string; source: string; medium: string; campaign: string; content: string }>;
  recentSignupClicks: Array<{ id: string; occurredAt: string; source: string; medium: string; campaign: string; content: string }>;
  recentPurchases: Array<{ paymentId: string; userId: number | string; planId: number | null; amount: number; currency: string; refId: string | null; paidAt: string; content: string }>;
}
export interface MarketingAttributionReport {
  generatedAt: string;
  channels: Record<string, MarketingAttributionChannelReport>;
}
export async function getMarketingAttributionReport(): Promise<MarketingAttributionReport> {
  const response = await get<MarketingAttributionReport>('/marketing-attribution/report');
  if (!response.success || !response.data) throw new Error(response.message || 'دریافت گزارش تبلیغات ناموفق بود.');
  return response.data;
}

export interface MarketingAdCampaign {
  id: string;
  name: string;
  message: string;
  createdAt: string | null;
  updatedAt: string | null;
}
export async function getMarketingAdCampaigns(): Promise<MarketingAdCampaign[]> {
  const response = await get<{ campaigns: MarketingAdCampaign[] }>('/marketing-attribution/settings');
  if (!response.success || !response.data) throw new Error(response.message || 'دریافت تنظیمات پیام تبلیغات ناموفق بود.');
  return Array.isArray(response.data.campaigns) ? response.data.campaigns : [];
}
export async function saveMarketingAdCampaign(input: { id?: string; name: string; message: string }): Promise<MarketingAdCampaign> {
  const response = await put<{ saved: boolean; campaign: MarketingAdCampaign }>('/marketing-attribution/settings', input);
  if (!response.success || !response.data?.campaign) throw new Error(response.message || 'ذخیره پیام تبلیغاتی ناموفق بود.');
  return response.data.campaign;
}
