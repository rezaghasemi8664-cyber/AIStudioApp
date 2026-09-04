import * as apiClient from './apiClient';

export const ADMIN_MODULES = [
  'dashboard','users','subscriptions','analysis','market','scalping','ai','prompts','history','notifications',
  'monitoring','reports','security','settings','maintenance','updates','backup','payments','roles','audit','sessions','api','infrastructure',
] as const;
export type AdminModuleKey = typeof ADMIN_MODULES[number];

export interface AdminModuleRecord {
  id: number;
  moduleKey: AdminModuleKey;
  title: string;
  enabled: boolean;
  config: Record<string, unknown>;
  version: number;
  updatedBy?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminSummary { users:number; activeUsers:number; analyses:number; apiKeys:number; notifications:number; sessions:number; auditEvents:number; moduleCount:number; }

function message<T>(response: { success?: boolean; message?: string; data?: T }, fallback: string): T {
  if (!response.success || response.data === undefined) throw new Error(response.message || fallback);
  return response.data;
}

export async function getModules(): Promise<AdminModuleRecord[]> {
  const r = await apiClient.get<AdminModuleRecord[]>('/admin-control/modules');
  return message(r, 'دریافت ماژول‌های مدیریت ناموفق بود.');
}
export async function getModule(moduleKey: AdminModuleKey): Promise<AdminModuleRecord> {
  const r = await apiClient.get<AdminModuleRecord>(`/admin-control/modules/${moduleKey}`);
  return message(r, 'دریافت تنظیمات ماژول ناموفق بود.');
}
export async function updateModule(moduleKey: AdminModuleKey, enabled: boolean, config: Record<string, unknown>): Promise<AdminModuleRecord> {
  const r = await apiClient.put<AdminModuleRecord>(`/admin-control/modules/${moduleKey}`, { enabled, config });
  return message(r, 'ذخیره تنظیمات ماژول ناموفق بود.');
}
export async function getAudit(limit = 100): Promise<Record<string, unknown>[]> {
  const r = await apiClient.get<Record<string, unknown>[]>(`/admin-control/audit?limit=${Math.min(Math.max(limit,1),200)}`);
  return message(r, 'دریافت Audit Log ناموفق بود.');
}
export async function getSummary(): Promise<AdminSummary> {
  const r = await apiClient.get<AdminSummary>('/admin-control/summary');
  return message(r, 'دریافت آمار مدیریتی ناموفق بود.');
}

export default { getModules, getModule, updateModule, getAudit, getSummary };
