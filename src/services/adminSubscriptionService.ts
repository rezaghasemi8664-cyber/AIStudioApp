import * as apiClient from './apiClient';

export interface AdminSubscriptionSummary {
  total: number;
  active: number;
  expiring: number;
  expired: number;
}

export async function getSummary(): Promise<AdminSubscriptionSummary> {
  const response = await apiClient.get<AdminSubscriptionSummary>('/admin/subscriptions/summary');
  if (!response?.success || !response.data) {
    throw new Error(response?.message || 'دریافت آمار اشتراک‌ها ناموفق بود.');
  }
  return {
    total: Number(response.data.total) || 0,
    active: Number(response.data.active) || 0,
    expiring: Number(response.data.expiring) || 0,
    expired: Number(response.data.expired) || 0,
  };
}


export interface AdminSubscriptionPlan {
  id: number;
  name: string;
  code: string;
  durationMonths: number;
  price: string | number;
  currency: string;
  isActive: boolean;
}

export interface AdminSubscriptionPlanPayload {
  name: string;
  code: string;
  durationMonths: number;
  price: number;
  currency: string;
  isActive: boolean;
}

export async function getPlans(): Promise<AdminSubscriptionPlan[]> {
  const response = await apiClient.get<AdminSubscriptionPlan[]>('/admin-subscriptions/plans');
  if (!response?.success || !Array.isArray(response.data)) {
    throw new Error(response?.message || 'دریافت پلن‌ها ناموفق بود.');
  }
  return response.data;
}

export async function createPlan(payload: AdminSubscriptionPlanPayload): Promise<AdminSubscriptionPlan> {
  const response = await apiClient.post<AdminSubscriptionPlan>('/admin-subscriptions/plans', payload);
  if (!response?.success || !response.data) {
    throw new Error(response?.message || 'ایجاد پلن ناموفق بود.');
  }
  return response.data;
}

export async function updatePlan(id: number, payload: AdminSubscriptionPlanPayload): Promise<AdminSubscriptionPlan> {
  const response = await apiClient.put<AdminSubscriptionPlan>(`/admin-subscriptions/plans/${encodeURIComponent(String(id))}`, payload);
  if (!response?.success || !response.data) {
    throw new Error(response?.message || 'به‌روزرسانی پلن ناموفق بود.');
  }
  return response.data;
}

export async function deletePlan(id: number): Promise<void> {
  const response = await apiClient.del(`/admin-subscriptions/plans/${encodeURIComponent(String(id))}`);
  if (!response?.success) {
    throw new Error(response?.message || 'حذف پلن ناموفق بود.');
  }
}


export async function applyGiftSubscription(days: number): Promise<{ days: number; affectedUsers: number }> {
  const value = Number(days);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error('تعداد روزهای اشتراک هدیه باید بیشتر از صفر باشد.');
  }
  const response = await apiClient.post<{ days: number; affectedUsers: number }>('/admin/subscriptions/gift', { days: value });
  if (!response?.success || !response.data) {
    throw new Error(response?.message || 'اعمال اشتراک هدیه ناموفق بود.');
  }
  return response.data;
}

export async function applyGiftSubscriptionToUser(userId: number, days: number): Promise<{ userId: number; days: number; previousEnd: string; newEnd: string }> {
  const value = Number(days);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('شناسه کاربر نامعتبر است.');
  if (!Number.isInteger(value) || value <= 0) throw new Error('تعداد روزهای اشتراک هدیه باید بیشتر از صفر باشد.');
  const response = await apiClient.post<{ userId: number; days: number; previousEnd: string; newEnd: string }>(
    `/admin/users/${encodeURIComponent(String(userId))}/subscription/gift`,
    { days: value },
  );
  if (!response?.success || !response.data) throw new Error(response?.message || 'اعمال اشتراک هدیه ناموفق بود.');
  return response.data;
}

export default { getSummary, getPlans, createPlan, updatePlan, deletePlan, applyGiftSubscription, applyGiftSubscriptionToUser };

