// src/services/notificationService.ts
import type { ApiResult } from '../types';
import { get, post, patch, del } from './apiClient';

export interface NotificationAttachment { name: string; url: string; type?: string; }
export interface Notification { id: string; message: string; createdAt: string; read: boolean; attachment?: NotificationAttachment | null; }
export interface CreateNotificationInput { message: string; attachment?: NotificationAttachment | null; userIds?: string[]; }

export async function getNotifications(): Promise<ApiResult<Notification[]>> {
  return get<Notification[]>('/notifications');
}

export async function addNotification(input: CreateNotificationInput): Promise<ApiResult<Notification>> {
  return post<Notification>('/notifications', input);
}

export async function markAsRead(notificationId: string): Promise<ApiResult<void>> {
  return patch<void>(`/notifications/${encodeURIComponent(notificationId)}/read`);
}

export async function markAllAsRead(): Promise<ApiResult<void>> {
  return patch<void>('/notifications/read-all');
}

export async function clearNotifications(): Promise<ApiResult<void>> {
  return del<void>('/notifications');
}

export async function getUnreadCount(): Promise<ApiResult<number>> {
  const res = await get<{ count?: number }>('/notifications/unread-count');
  if (!res.success) return { ...res, data: undefined };
  return { ...res, data: Number(res.data?.count ?? 0) };
}

/** Legacy synchronous-style helper retained for App.tsx compatibility. */
export function getUnreadCountForUser(_userId: string): number {
  return 0;
}
