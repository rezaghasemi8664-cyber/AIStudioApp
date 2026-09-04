import type { ApiResult } from '../types';
import { appApiFetch } from './apiConfigService';

export type { ApiResult } from '../types';

type RequestOptions = RequestInit & { requireAuth?: boolean };

export async function safeApi<T>(fn: () => Promise<T>): Promise<ApiResult<T>>;
export async function safeApi<T>(endpoint: string, options?: RequestOptions): Promise<ApiResult<T>>;
export async function safeApi<T>(source: (() => Promise<T>) | string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  try {
    const data = typeof source === 'function'
      ? await source()
      : await appApiFetch<T>(source, options);
    return { success: true, ok: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, ok: false, error: message, message };
  }
}
