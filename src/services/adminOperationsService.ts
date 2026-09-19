import * as apiClient from './apiClient';
import type { AdminModuleKey } from './adminControlService';

export interface AdminModuleOverview {
  moduleKey: AdminModuleKey;
  title: string;
  enabled: boolean;
  version: number;
  config: Record<string, unknown>;
  counts: Record<string, number>;
}

export interface AdminActionResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

function unwrap<T>(response: { success?: boolean; data?: T; message?: string }, fallback: string): T {
  if (!response.success || response.data === undefined) throw new Error(response.message || fallback);
  return response.data;
}

export async function getOverview(moduleKey: AdminModuleKey): Promise<AdminModuleOverview> {
  const response = await apiClient.get<AdminModuleOverview>(`/admin-ops/${moduleKey}`);
  return unwrap(response, `دریافت اطلاعات ${moduleKey} ناموفق بود.`);
}

export async function saveConfig(moduleKey: AdminModuleKey, enabled: boolean, config: Record<string, unknown>) {
  const response = await apiClient.put<AdminModuleOverview>(`/admin-ops/${moduleKey}/config`, { enabled, config });
  return unwrap(response, 'ذخیره تنظیمات ناموفق بود.');
}

export async function getCapabilities(moduleKey: AdminModuleKey) {
  const response = await apiClient.get<{ moduleKey: AdminModuleKey; actions: string[]; transactional: boolean }>(`/admin-actions/capabilities/${moduleKey}`);
  return unwrap(response, 'دریافت قابلیت‌های ماژول ناموفق بود.');
}

export async function executeAction<T = unknown>(moduleKey: AdminModuleKey, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await apiClient.post<T>(`/admin-actions/${moduleKey}/${action}`, payload);
  return unwrap(response, 'اجرای عملیات مدیریتی ناموفق بود.');
}

export default { getOverview, saveConfig, getCapabilities, executeAction };
