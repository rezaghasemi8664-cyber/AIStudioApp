import { safeApi, type ApiResult } from './apiResult';
import { request } from './apiClient';

type JsonMap = Record<string, any>;
type GlobalSettingsMap = Record<string, any>;

async function requestData<T>(method: string, endpoint: string, data?: unknown, customHeaders?: Record<string, string>): Promise<T> {
  const response = await request<T>(method, endpoint, data, customHeaders);
  if (response && typeof response === 'object' && 'data' in response) return response.data as T;
  return response as T;
}

export const globalSettingsService = {
  getAll: (): Promise<ApiResult<GlobalSettingsMap>> => safeApi(() => requestData('GET', '/global-settings')),
  getByCategory: (category: string): Promise<ApiResult<JsonMap>> => safeApi(() => requestData('GET', `/global-settings/${encodeURIComponent(category)}`)),
  get: (category: string, key: string): Promise<ApiResult<any>> => safeApi(() => requestData('GET', `/global-settings/${encodeURIComponent(category)}/${encodeURIComponent(key)}`)),
  set: (category: string, key: string, value: any): Promise<ApiResult<{ success: true }>> => safeApi(() => requestData('PUT', `/global-settings/${encodeURIComponent(category)}/${encodeURIComponent(key)}`, { value })),
  bulkSave: (settings: GlobalSettingsMap): Promise<ApiResult<{ success: true }>> => safeApi(() => requestData('PUT', '/global-settings', settings)),
  remove: (category: string, key: string): Promise<ApiResult<{ success: true }>> => safeApi(() => requestData('DELETE', `/global-settings/${encodeURIComponent(category)}/${encodeURIComponent(key)}`)),
  fetchGlobalSettings: (): Promise<ApiResult<GlobalSettingsMap>> => safeApi(() => requestData('GET', '/global-settings')),
};

export const userPreferencesService = {
  getAll: (): Promise<ApiResult<JsonMap>> => safeApi(() => requestData('GET', '/user-preference')),
  get: (key: string): Promise<ApiResult<{ key: string; value: any }>> => safeApi(() => requestData('GET', `/user-preference/${encodeURIComponent(key)}`)),
  set: (key: string, value: any): Promise<ApiResult<{ success: true }>> => safeApi(() => requestData('PUT', `/user-preference/${encodeURIComponent(key)}`, { value })),
  bulkSave: (prefs: JsonMap): Promise<ApiResult<{ success: true }>> => safeApi(() => requestData('PUT', '/user-preference', prefs)),
  remove: (key: string): Promise<ApiResult<{ success: true }>> => safeApi(() => requestData('DELETE', `/user-preference/${encodeURIComponent(key)}`)),
};

export const globalSettings = globalSettingsService;
export const userPreferences = userPreferencesService;
export type { JsonMap, GlobalSettingsMap };
