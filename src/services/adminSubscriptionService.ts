import * as apiClient from './apiClient';

export interface AdminSubscriptionSummary {
  total: number;
  active: number;
  expiring: number;
  expired: number;
}

export async function getSummary(): Promise<AdminSubscriptionSummary> {
  const response = await apiClient.get<AdminSubscriptionSummary>('/admin-subscriptions/summary');
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

export default { getSummary };
