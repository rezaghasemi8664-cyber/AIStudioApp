import * as apiClient from './apiClient';

export type TehranWeekday = 'Sat' | 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri';
export interface TelegramSchedule {
  enabled: boolean;
  days: TehranWeekday[];
  intervalMinutes?: number;
  maxSymbolsPerMessage?: number;
  startTime?: string;
  publishTime?: string;
}
export interface TelegramPublisherSettings {
  timezone: 'Asia/Tehran';
  valuable: TelegramSchedule & { intervalMinutes: number; maxSymbolsPerMessage: number };
  scalping: TelegramSchedule & { intervalMinutes: number; maxSymbolsPerMessage: number };
  index: TelegramSchedule & { intervalMinutes: number; startTime: string };
  summary: TelegramSchedule & { publishTime: string };
}
export interface TelegramPublisherHistoryEntry {
  id: string;
  type: 'valuable' | 'scalping' | 'index' | 'summary' | string;
  status: 'success' | 'failure';
  date: string;
  time: string;
  timestamp: string;
  messageTitle: string;
  error?: string | null;
}
export interface TelegramPublisherHistory {
  date: string;
  timezone: 'Asia/Tehran';
  entries: TelegramPublisherHistoryEntry[];
}
const BASE = '/telegram-publisher-admin';

function unwrap<T>(response: { success?: boolean; data?: T; message?: string } | null, fallback: string): T {
  if (!response?.success || response.data == null) throw new Error(response?.message || fallback);
  return response.data;
}

export async function getTelegramPublisherSettings(): Promise<TelegramPublisherSettings> {
  const response = await apiClient.get<TelegramPublisherSettings>(`${BASE}/settings`);
  return unwrap(response, 'دریافت تنظیمات انتشار تلگرام ناموفق بود.');
}

export async function saveTelegramPublisherSettings(settings: TelegramPublisherSettings): Promise<TelegramPublisherSettings> {
  const response = await apiClient.put<TelegramPublisherSettings>(`${BASE}/settings`, settings);
  return unwrap(response, 'ذخیره تنظیمات انتشار تلگرام ناموفق بود.');
}

export async function getTelegramPublisherHistory(): Promise<TelegramPublisherHistory> {
  const response = await apiClient.get<TelegramPublisherHistory>(`${BASE}/history`);
  return unwrap(response, 'دریافت تاریخچه انتشار تلگرام ناموفق بود.');
}


export interface TelegramAdMessageSettings {
  enabled: boolean;
  text: string;
  imageDataUrl: string;
  days: TehranWeekday[];
  times: string[];
  timezone: 'Asia/Tehran';
}
export const DEFAULT_TELEGRAM_AD_MESSAGE: TelegramAdMessageSettings = {
  enabled: false, text: '', imageDataUrl: '',
  days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'], times: ['10:00'], timezone: 'Asia/Tehran'
};
export async function getTelegramAdMessageSettings(): Promise<TelegramAdMessageSettings> {
  const response = await apiClient.get<TelegramAdMessageSettings>(`${BASE}/ad-message`);
  return unwrap(response, 'دریافت پیام تبلیغاتی ناموفق بود.');
}
export async function saveTelegramAdMessageSettings(settings: TelegramAdMessageSettings): Promise<TelegramAdMessageSettings> {
  const response = await apiClient.put<TelegramAdMessageSettings>(`${BASE}/ad-message`, settings);
  return unwrap(response, 'ذخیره پیام تبلیغاتی ناموفق بود.');
}
export async function publishTelegramAdMessageNow(settings: TelegramAdMessageSettings): Promise<{ message: string; messageId?: number | null }> {
  const response = await apiClient.post<{ message: string; messageId?: number | null }>(`${BASE}/ad-message/publish-now`, settings);
  return unwrap(response, 'انتشار فوری پیام تبلیغاتی ناموفق بود.');
}
