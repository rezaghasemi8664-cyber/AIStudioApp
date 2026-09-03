// src/services/profileService.ts
import type { StoredUser, SubscriptionInfo, DirectMessage } from '../types';
import type { ApiResult } from '../types';
import { get, put, post } from './apiClient';

export interface ProfileUpdateData {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  profileImage?: string;
}

export interface SendMessageInput {
  subject: string;
  body: string;
  attachment?: { name: string; data: string; type?: string };
}

/** دریافت وضعیت اشتراک از رکورد واقعی کاربر در دیتابیس */
export async function getSubscriptionStatus(): Promise<SubscriptionInfo> {
  const res = await get<any>('/auth/subscription');
  if (!res?.success) {
    throw new Error(res?.message || 'دریافت وضعیت اشتراک ناموفق بود');
  }
  return (res.data || {}) as SubscriptionInfo;
}

/** alias */
export const getSubscriptionInfo = getSubscriptionStatus;

/** دریافت پروفایل */
export async function getProfile(): Promise<ApiResult<StoredUser>> {
  try {
    const res = await get<any>('/profile');
    if (!res?.success) return { success: false, error: res?.message || 'دریافت پروفایل ناموفق بود' };
    return { success: true, data: (res.data || {}) as StoredUser };
  } catch (err: any) {
    return { success: false, error: err?.message || 'دریافت پروفایل ناموفق بود' };
  }
}

/** به‌روزرسانی پروفایل */
export async function updateProfile(updates: ProfileUpdateData): Promise<ApiResult<StoredUser>> {
  try {
    const res = await put<any>('/profile', updates);
    if (!res?.success) return { success: false, error: res?.message || 'به‌روزرسانی پروفایل ناموفق بود' };
    return { success: true, data: (res.data || {}) as StoredUser };
  } catch (err: any) {
    return { success: false, error: err?.message || 'به‌روزرسانی پروفایل ناموفق بود' };
  }
}

/** آپلود تصویر پروفایل */
export async function uploadProfileImage(imageBase64: string): Promise<ApiResult<{ url: string }>> {
  try {
    const res = await post<any>('/profile/image', { image: imageBase64 });
    if (!res?.success) return { success: false, error: res?.message || 'آپلود تصویر ناموفق بود' };
    return { success: true, data: res.data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'آپلود تصویر ناموفق بود' };
  }
}

/** تغییر رمز عبور */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<ApiResult<{ success: true }>> {
  try {
    const res = await post<any>('/profile/change-password', { currentPassword, newPassword });
    if (!res?.success) return { success: false, error: res?.message || 'تغییر رمز عبور ناموفق بود' };
    return { success: true, data: { success: true } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'تغییر رمز عبور ناموفق بود' };
  }
}

/** ارسال پیام */
export async function sendMessage(message: SendMessageInput): Promise<ApiResult<{ success: true }>> {
  try {
    const res = await post<any>('/profile/messages', message);
    if (!res?.success) return { success: false, error: res?.message || 'ارسال پیام ناموفق بود' };
    return { success: true, data: { success: true } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'ارسال پیام ناموفق بود' };
  }
}

/** دریافت پیام‌ها */
export async function getMessages(userId?: string): Promise<ApiResult<DirectMessage[]>> {
  try {
    const endpoint = userId ? `/profile/messages/${encodeURIComponent(userId)}` : '/profile/messages';
    const res = await get<any>(endpoint);
    if (!res?.success) return { success: false, error: res?.message || 'دریافت پیام‌ها ناموفق بود' };
    const rows = Array.isArray(res.data) ? res.data : res.data?.messages || [];
    return { success: true, data: rows as DirectMessage[] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'دریافت پیام‌ها ناموفق بود' };
  }
}

/** درخواست تمدید اشتراک */
export async function requestSubscriptionExtension(message?: string): Promise<ApiResult<{ success: true }>> {
  try {
    const res = await post<any>('/profile/subscription/extend-request', {
      message: message || 'درخواست تمدید اشتراک',
    });
    if (!res?.success) return { success: false, error: res?.message || 'ثبت درخواست ناموفق بود' };
    return { success: true, data: { success: true } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'ثبت درخواست ناموفق بود' };
  }
}

export default {
  getSubscriptionStatus,
  getSubscriptionInfo,
  getProfile,
  updateProfile,
  uploadProfileImage,
  changePassword,
  sendMessage,
  getMessages,
  requestSubscriptionExtension,
};
