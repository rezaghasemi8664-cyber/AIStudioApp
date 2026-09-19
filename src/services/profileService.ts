// src/services/profileService.ts
import type { StoredUser, SubscriptionInfo, DirectMessage } from '../types';
import type { ApiResult } from '../types';
import { get, put, post } from './apiClient';
import { getMySubscription, getSubscriptionPlans, type SubscriptionPlan } from './subscriptionService';

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

/**
 * Backward-compatible profile subscription adapter.
 * The new Subscription table/API is the source of truth; the legacy endpoint
 * remains only as a fallback while older deployments are being migrated.
 */
export async function getSubscriptionStatus(): Promise<SubscriptionInfo> {
  try {
    const state = await getMySubscription();
    const subscription = state.subscription;
    const start = subscription?.startsAt || null;
    const end = subscription?.expiresAt || null;
    const durationDays = start && end
      ? Math.max(0, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000))
      : 0;

    return {
      isSubscriptionActive: Boolean(state.isActive),
      subscriptionStart: start,
      subscriptionEnd: end,
      subscriptionDays: durationDays,
      subscriptionMonths: Number(subscription?.plan?.durationMonths || 0),
      analysisLimit: 0,
      remainingDays: Math.max(0, Number(state.daysRemaining) || 0),
      analysisCount: 0,
    } as SubscriptionInfo;
  } catch (newApiError) {
    console.warn('[profileService] New subscription API unavailable; using legacy fallback.', newApiError);

    const res = await get<any>('/auth/subscription');
    if (!res?.success) {
      throw new Error(res?.message || 'دریافت وضعیت اشتراک ناموفق بود');
    }

    return { ...(res.data || {}) } as SubscriptionInfo;
  }
}

/** دریافت پلن‌های فعال اشتراک از دیتابیس */
export async function getActiveSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  return getSubscriptionPlans();
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

/** درخواست تمدید اشتراک — فعلاً برای سازگاری نگه داشته شده است */
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
  getActiveSubscriptionPlans,
  getProfile,
  updateProfile,
  uploadProfileImage,
  changePassword,
  sendMessage,
  getMessages,
  requestSubscriptionExtension,
};