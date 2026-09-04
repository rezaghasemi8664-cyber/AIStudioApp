import type { ApiResult } from '../types';

export type { ApiResult } from '../types';

export async function safeApi<T>(fn: () => Promise<T>): Promise<ApiResult<T>> {
  try {
    const data = await fn();
    return { success: true, ok: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, ok: false, error: message, message };
  }
}
