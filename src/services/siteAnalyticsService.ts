import { get, post } from './apiClient';

export interface SiteVisit {
  id: string;
  username: string | null;
  userId: string | number | null;
  lastVisitAt: string;
  visits: number;
}

export interface OnlineUser {
  userId: string | number;
  username: string;
  lastSeenAt: string;
}

export interface SiteAnalyticsToday {
  date: string;
  totalVisits: number;
  uniqueVisitors: number;
  onlineCount: number;
  onlineUsers: OnlineUser[];
  visits: SiteVisit[];
}

export async function recordSiteVisit(): Promise<void> {
  await post('/site-analytics/visit', {});
}

export async function sendSiteHeartbeat(): Promise<void> {
  await post('/site-analytics/heartbeat', {});
}

export async function getTodaySiteAnalytics(): Promise<SiteAnalyticsToday> {
  const response = await get<any>('/site-analytics/today');
  if (!response?.success) throw new Error(response?.message || 'دریافت آمار بازدید ناموفق بود.');
  return response.data as SiteAnalyticsToday;
}