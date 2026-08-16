// src/services/notificationService.ts
import type { ApiResult } from '../types';
import { safeApi } from './apiResult';

export interface NotificationAttachment {
  name: string;
  url: string;
  type?: string;
}

export interface Notification {
  id: string;
  message: string;
  createdAt: string;
  read: boolean;
  attachment?: NotificationAttachment | null;
}

export interface CreateNotificationInput {
  message: string;
  attachment?: NotificationAttachment | null;
  userIds?: string[]; // optional: ????? ?? ??????? ????
}

/** ?????? ???? ????????????? */
export async function getNotifications(): Promise<ApiResult<Notification[]>> {
  return safeApi<Notification[]>('/notifications', { method: 'GET' });
}

/** ????? ?????????? (?????/?????) */
export async function addNotification(
  input: CreateNotificationInput
): Promise<ApiResult<Notification>> {
  return safeApi<Notification>('/notifications', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** ??????????? ?? ?????????? ?? ????? ?????????? */
export async function markAsRead(notificationId: string): Promise<ApiResult<void>> {
  return safeApi<void>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  });
}

/** ??????????? ??? */
export async function markAllAsRead(): Promise<ApiResult<void>> {
  return safeApi<void>('/notifications/read-all', {
    method: 'PATCH',
  });
}

/** ??? ???? ????????????? (???????: ??? ???? ?????) */
export async function clearNotifications(): Promise<ApiResult<void>> {
  return safeApi<void>('/notifications', { method: 'DELETE' });
}

/** ????? ?????????????? */
export async function getUnreadCount(): Promise<ApiResult<number>> {
  const res = await safeApi<{ count: number }>('/notifications/unread-count', {
    method: 'GET',
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data?.count ?? 0 };
}

