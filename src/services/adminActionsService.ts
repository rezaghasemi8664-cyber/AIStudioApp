import * as apiClient from './apiClient';
import type { AdminModuleKey } from './adminControlService';

export interface AdminCapability { moduleKey: AdminModuleKey; actions: string[]; transactional: boolean; }

function unwrap<T>(response: { success?: boolean; data?: T; message?: string }, fallback: string): T {
  if (!response.success || response.data === undefined) throw new Error(response.message || fallback);
  return response.data;
}

export async function getCapabilities(moduleKey: AdminModuleKey): Promise<AdminCapability> {
  const response = await apiClient.get<AdminCapability>(`/admin-actions/capabilities/${moduleKey}`);
  return unwrap(response, 'دریافت قابلیت‌های ماژول ناموفق بود.');
}

export async function executeAction<T = unknown>(moduleKey: AdminModuleKey, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await apiClient.post<T>(`/admin-actions/${moduleKey}/${action}`, payload);
  return unwrap(response, 'اجرای عملیات مدیریتی ناموفق بود.');
}
