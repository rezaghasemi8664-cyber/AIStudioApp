// src/services/notificationService.ts
import type { ApiResult, AppNotification } from '../types';
import { get, post, patch, del } from './apiClient';

export interface NotificationAttachment { name: string; url: string; type?: string; }
export interface Notification { id: string; message: string; createdAt: string; read: boolean; attachment?: NotificationAttachment | null; }
export interface CreateNotificationInput { message: string; attachment?: NotificationAttachment | null; userIds?: string[]; }

let userNotificationsCache: AppNotification[] = [];
let unreadCountCache = 0;

export async function getNotifications(): Promise<ApiResult<Notification[]>> { return get<Notification[]>('/notifications'); }
export async function addNotification(input: CreateNotificationInput): Promise<ApiResult<Notification>> { return post<Notification>('/notifications', input); }
export async function markAsRead(notificationId: string): Promise<ApiResult<void>> { return patch<void>(`/notifications/${encodeURIComponent(notificationId)}/read`); }
export async function markAllAsRead(): Promise<ApiResult<void>> { return patch<void>('/notifications/read-all'); }
export async function clearNotifications(): Promise<ApiResult<void>> { return del<void>('/notifications'); }
export async function getUnreadCount(): Promise<ApiResult<number>> {
  const res = await get<{ count?: number }>('/notifications/unread-count');
  if (!res.success) return { ...res, data: undefined };
  const count = Number(res.data?.count ?? 0); unreadCountCache = count; return { ...res, data: count };
}

/** Legacy synchronous compatibility used by the application shell. Refreshes the cache in the background. */
export function getUnreadCountForUser(_userId: string): number {
  void getUnreadCount().catch(() => undefined);
  return unreadCountCache;
}

/** Legacy synchronous compatibility used by the application shell. */
export function getNotificationsForUser(_userId: string): AppNotification[] {
  void getNotifications().then(res => {
    if (res.success && Array.isArray(res.data)) {
      userNotificationsCache = res.data.map(item => ({
        id: String(item.id), message: item.message, timestamp: Date.parse(item.createdAt) || Date.now(),
        recipientUserId: _userId, read: item.read,
        attachment: item.attachment ? { name: item.attachment.name, type: item.attachment.type || 'file', data: item.attachment.url } : undefined,
      }));
    }
  }).catch(() => undefined);
  return userNotificationsCache;
}

export async function checkAndSendExpiryNotification(_user: unknown): Promise<void> { return; }
export async function markSingleNotificationAsRead(notificationId: string): Promise<void> { await markAsRead(notificationId); }
