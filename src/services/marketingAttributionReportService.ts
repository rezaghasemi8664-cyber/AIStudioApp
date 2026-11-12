import { get, put, del } from './apiClient';

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

export interface MarketingAdSlot {
  slotId: string;
  name: string;
  content: string;
  link: string;
  message: string;
  createdAt: string | null;
  updatedAt: string | null;
}
export interface MarketingAdArchive {
  id: string;
  slotId: string;
  slotName: string;
  content: string;
  link: string;
  message: string;
  report: MarketingAttributionChannelReport | null;
  archivedAt: string;
}
export async function getMarketingAdSlots(): Promise<{ slots: MarketingAdSlot[]; archives: MarketingAdArchive[] }> {
  const response = await get<{ slots: MarketingAdSlot[]; archives: MarketingAdArchive[] }>('/marketing-attribution/slots');
  if (!response.success || !response.data) throw new Error(response.message || 'دریافت جایگاه‌های تبلیغاتی ناموفق بود.');
  return { slots: response.data.slots || [], archives: response.data.archives || [] };
}
export async function saveMarketingAdSlot(input: { slotId: string; name: string; link: string; message?: string }): Promise<MarketingAdSlot> {
  const response = await put<{ saved: boolean; slot: MarketingAdSlot }>('/marketing-attribution/slots', input);
  if (!response.success || !response.data?.slot) throw new Error(response.message || 'ذخیره جایگاه تبلیغاتی ناموفق بود.');
  return response.data.slot;
}
export async function deleteMarketingAdArchive(id: string): Promise<void> {
  const response = await del<{ deleted: boolean }>(`/marketing-attribution/archives/${encodeURIComponent(id)}`);
  if (!response.success) throw new Error(response.message || 'حذف آمار آرشیوشده ناموفق بود.');
}
